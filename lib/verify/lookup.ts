import "server-only";
import { Prisma, VerificationStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/*
  Public Verify lookup. Unifies two data sources:
   - IssuedCertificate (Phase 1) — certificates DentalACE issued to attendees
     of accredited courses. Authoritative (the AADB issued them).
   - CeCertificate (Phase 2) — every CE cert a ProTrack licensee holds, whether
     auto-synced from DentalACE (source=ACE) or uploaded from another provider
     (ADA CERP, AGD PACE, or self-upload).

  Security model:
   - Only certificates with a verified status are surfaced. PENDING uploads
     are intentionally hidden — anyone can upload anything to ProTrack, so
     publishing those would let attackers seed fake records into the public
     lookup. IssuedCertificate is always verified (AADB issued it).
   - Name-mode lookups are deliberately weaker than license/cert modes:
       * both first AND last name required, ≥3 chars each, alphabetic only
       * prefix match (startsWith), not substring (contains)
       * limit 5 hits, not 50 — surface a "refine your search" UX instead of
         leaking a directory
       * license number is NOT returned in name-mode hits (the requester
         didn't provide it; surfacing it enables enumeration). License-mode
         and cert-mode hits do include the license number because the
         requester already supplied an identifier-grade input.
   - Email is never returned to the public regardless of mode.

  Results carry a `verificationStatus` so the UI can render an explicit
  "AADB Issued" / "ADA CERP Verified" / etc. badge.
*/

export type VerifyMode = "license" | "name" | "cert";

export type VerifyVerificationLabel =
  | "AADB Issued"
  | "ADA CERP Verified"
  | "AGD PACE Verified"
  | "Admin Verified"
  | "Verified";

export type VerifyHit = {
  source: "DENTAL_ACE_ISSUED" | "PROTRACK";
  provenance: string;
  verificationLabel: VerifyVerificationLabel;
  attendeeName: string;
  licenseNumber: string | null;
  courseTitle: string;
  ceHours: number;
  category: string | null;
  completedAt: Date;
  certNumber: string | null;
};

const LICENSE_OR_CERT_LIMIT = 50;
const NAME_LIMIT = 5;

// Verified-only filter applied to the ProTrack side. PENDING is excluded so
// the public lookup can't be poisoned by anonymous uploads.
const VERIFIED_STATUSES: VerificationStatus[] = [
  VerificationStatus.AUTO,
  VerificationStatus.ADA_CERP_ACCEPTED,
  VerificationStatus.AGD_PACE_ACCEPTED,
  VerificationStatus.ADMIN_VERIFIED,
];

const NAME_TOKEN_RE = /^[\p{L}'\-.]+$/u;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * States whose board has opted out of the public lookup. ProTrack-uploaded
 * certificates for licensees who hold *any* license in one of these states
 * are hidden. AADB-issued certificates (IssuedCertificate) are unaffected —
 * those are national accreditation records, not state-board ones.
 *
 * Resolution is once per call. The set is small (≤ 56 boards even at full
 * 50-state coverage) so a per-request fetch is cheap. Re-querying every
 * call also means a settings flip takes effect on the next request without
 * any cache invalidation work.
 */
async function disabledLookupStates(): Promise<string[]> {
  const rows = await prisma.board.findMany({
    where: {
      settings: {
        path: ["publicLookupEnabled"],
        equals: false,
      },
    },
    select: { state: true },
  });
  return rows.map((r) => r.state);
}

function verificationLabelFor(
  source: VerifyHit["source"],
  status?: VerificationStatus | null,
): VerifyVerificationLabel {
  if (source === "DENTAL_ACE_ISSUED") return "AADB Issued";
  switch (status) {
    case VerificationStatus.AUTO:
      return "AADB Issued";
    case VerificationStatus.ADA_CERP_ACCEPTED:
      return "ADA CERP Verified";
    case VerificationStatus.AGD_PACE_ACCEPTED:
      return "AGD PACE Verified";
    case VerificationStatus.ADMIN_VERIFIED:
      return "Admin Verified";
    default:
      return "Verified";
  }
}

function provenanceFor(
  source: VerifyHit["source"],
  certSource?: string | null,
): string {
  if (source === "DENTAL_ACE_ISSUED") {
    return "Issued by AADB DentalACE";
  }
  switch (certSource) {
    case "ACE":
      return "Auto-synced from a DentalACE-issued certificate";
    case "ADA_CERP":
      return "Uploaded by licensee · ADA CERP source";
    case "AGD_PACE":
      return "Uploaded by licensee · AGD PACE source";
    case "UPLOADED":
      return "Uploaded by licensee";
    default:
      return "Uploaded by licensee";
  }
}

/** Parse a name query into {first, last} only if both pass the strict gate. */
function parseStrictName(
  raw: string,
): { first: string; last: string } | null {
  const tokens = raw.trim().split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return null;
  const first = tokens[0]!;
  const last = tokens.slice(1).join(" ");
  if (first.length < 3 || last.length < 3) return null;
  if (!NAME_TOKEN_RE.test(first)) return null;
  // Allow apostrophes / hyphens / dots / spaces in the last name (O'Brien, Smith-Jones).
  if (!/^[\p{L}'\-. ]+$/u.test(last)) return null;
  return { first, last };
}

export async function lookupCertificates(
  mode: VerifyMode,
  rawQuery: string,
): Promise<VerifyHit[]> {
  const q = rawQuery.trim();
  if (q.length < 2) return [];

  if (mode === "name") {
    const parsed = parseStrictName(q);
    if (!parsed) return [];
    return runNameLookup(parsed);
  }

  if (mode === "license") {
    return runIdentifierLookup({ licenseNumber: q });
  }

  return runIdentifierLookup({ certNumber: q });
}

async function runNameLookup(parsed: {
  first: string;
  last: string;
}): Promise<VerifyHit[]> {
  const disabledStates = await disabledLookupStates();
  // Anchored-prefix match on both first and last, verified-only,
  // intentionally narrow.
  const protrackRows = await prisma.ceCertificate.findMany({
    where: {
      verificationStatus: { in: VERIFIED_STATUSES },
      user: {
        AND: [
          { firstName: { startsWith: parsed.first, mode: "insensitive" } },
          { lastName: { startsWith: parsed.last, mode: "insensitive" } },
        ],
        ...(disabledStates.length > 0
          ? { licenses: { none: { state: { in: disabledStates } } } }
          : {}),
      },
    },
    orderBy: { completedAt: "desc" },
    take: NAME_LIMIT,
    select: {
      certNumber: true,
      courseTitle: true,
      hours: true,
      category: true,
      completedAt: true,
      source: true,
      verificationStatus: true,
      issuedCertificateId: true,
      user: { select: { firstName: true, lastName: true } },
    },
  });

  const issuedRows = await prisma.issuedCertificate.findMany({
    where: {
      // attendee_name in IssuedCertificate is "First Last"; we anchor on the
      // full string starting with the first name.
      attendeeName: { startsWith: `${parsed.first} `, mode: "insensitive" },
    },
    orderBy: { issuedAt: "desc" },
    take: NAME_LIMIT,
    select: {
      id: true,
      attendeeName: true,
      issuedAt: true,
      ceHours: true,
      course: {
        select: {
          application: {
            select: {
              courseTitle: true,
              ceHours: true,
              courseType: true,
            },
          },
        },
      },
      event: { select: { name: true } },
    },
  });

  // Filter issued by last-name prefix in JS (the column is a single field;
  // doing this in SQL would need a function index we don't have).
  const lastLower = parsed.last.toLowerCase();
  const issuedNarrowed = issuedRows.filter((row) => {
    const parts = row.attendeeName.split(/\s+/);
    if (parts.length < 2) return false;
    const lastToken = parts.slice(1).join(" ").toLowerCase();
    return lastToken.startsWith(lastLower);
  });

  // De-dupe: drop IssuedCertificate twins represented in ProTrack rows.
  const linkedIds = new Set(
    protrackRows
      .map((r) => r.issuedCertificateId)
      .filter((id): id is string => Boolean(id)),
  );

  const protrackHits: VerifyHit[] = protrackRows.map((row) => ({
    source: "PROTRACK",
    provenance: provenanceFor("PROTRACK", row.source),
    verificationLabel: verificationLabelFor("PROTRACK", row.verificationStatus),
    attendeeName:
      nameOf(row.user.firstName, row.user.lastName) ?? "—",
    // Name mode: do NOT return license number. Surfacing it here would let an
    // attacker enumerate license numbers from a list of names.
    licenseNumber: null,
    courseTitle: row.courseTitle,
    ceHours: Number(row.hours),
    category: row.category,
    completedAt: row.completedAt,
    certNumber: row.certNumber,
  }));

  const issuedHits: VerifyHit[] = issuedNarrowed
    .filter((row) => !linkedIds.has(row.id))
    .map((row) => ({
      source: "DENTAL_ACE_ISSUED",
      provenance: provenanceFor("DENTAL_ACE_ISSUED"),
      verificationLabel: verificationLabelFor("DENTAL_ACE_ISSUED"),
      attendeeName: row.attendeeName,
      // Name mode: never surface license number (see comment above).
      licenseNumber: null,
      courseTitle: row.course?.application.courseTitle ?? row.event?.name ?? "(course)",
      ceHours: Number(row.ceHours ?? row.course?.application.ceHours ?? 0),
      category: row.course?.application.courseType ?? null,
      completedAt: row.issuedAt,
      certNumber: row.id,
    }));

  return [...protrackHits, ...issuedHits]
    .sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime())
    .slice(0, NAME_LIMIT);
}

async function runIdentifierLookup(args: {
  licenseNumber?: string;
  certNumber?: string;
}): Promise<VerifyHit[]> {
  const disabledStates = await disabledLookupStates();
  const userOptOutClause: Prisma.UserWhereInput | null =
    disabledStates.length > 0
      ? { licenses: { none: { state: { in: disabledStates } } } }
      : null;

  const protrackWhere: Prisma.CeCertificateWhereInput = {
    verificationStatus: { in: VERIFIED_STATUSES },
    ...(args.licenseNumber
      ? {
          user: {
            licenses: { some: { licenseNumber: args.licenseNumber } },
            ...(userOptOutClause ?? {}),
          },
        }
      : {
          OR: [
            { certNumber: args.certNumber! },
            ...(UUID_RE.test(args.certNumber!) ? [{ id: args.certNumber! }] : []),
          ],
          ...(userOptOutClause ? { user: userOptOutClause } : {}),
        }),
  };

  const protrackRows = await prisma.ceCertificate.findMany({
    where: protrackWhere,
    orderBy: { completedAt: "desc" },
    take: LICENSE_OR_CERT_LIMIT,
    select: {
      certNumber: true,
      courseTitle: true,
      hours: true,
      category: true,
      completedAt: true,
      source: true,
      verificationStatus: true,
      issuedCertificateId: true,
      user: {
        select: {
          firstName: true,
          lastName: true,
          licenses: {
            where: args.licenseNumber
              ? { licenseNumber: args.licenseNumber }
              : { isPrimary: true },
            select: { licenseNumber: true },
            take: 1,
          },
        },
      },
    },
  });

  const issuedWhere: Prisma.IssuedCertificateWhereInput = args.licenseNumber
    ? { licenseNumber: args.licenseNumber }
    : UUID_RE.test(args.certNumber!)
      ? { id: args.certNumber! }
      : { id: "00000000-0000-0000-0000-000000000000" }; // no-match sentinel

  const issuedRows = await prisma.issuedCertificate.findMany({
    where: issuedWhere,
    orderBy: { issuedAt: "desc" },
    take: LICENSE_OR_CERT_LIMIT,
    select: {
      id: true,
      attendeeName: true,
      licenseNumber: true,
      issuedAt: true,
      ceHours: true,
      course: {
        select: {
          application: {
            select: {
              courseTitle: true,
              ceHours: true,
              courseType: true,
            },
          },
        },
      },
      event: { select: { name: true } },
    },
  });

  const linkedIds = new Set(
    protrackRows
      .map((r) => r.issuedCertificateId)
      .filter((id): id is string => Boolean(id)),
  );

  const protrackHits: VerifyHit[] = protrackRows.map((row) => ({
    source: "PROTRACK",
    provenance: provenanceFor("PROTRACK", row.source),
    verificationLabel: verificationLabelFor("PROTRACK", row.verificationStatus),
    attendeeName: nameOf(row.user.firstName, row.user.lastName) ?? "—",
    licenseNumber: row.user.licenses[0]?.licenseNumber ?? null,
    courseTitle: row.courseTitle,
    ceHours: Number(row.hours),
    category: row.category,
    completedAt: row.completedAt,
    certNumber: row.certNumber,
  }));

  const issuedHits: VerifyHit[] = issuedRows
    .filter((row) => !linkedIds.has(row.id))
    .map((row) => ({
      source: "DENTAL_ACE_ISSUED",
      provenance: provenanceFor("DENTAL_ACE_ISSUED"),
      verificationLabel: verificationLabelFor("DENTAL_ACE_ISSUED"),
      attendeeName: row.attendeeName,
      licenseNumber: row.licenseNumber,
      courseTitle: row.course?.application.courseTitle ?? row.event?.name ?? "(course)",
      ceHours: Number(row.ceHours ?? row.course?.application.ceHours ?? 0),
      category: row.course?.application.courseType ?? null,
      completedAt: row.issuedAt,
      certNumber: row.id,
    }));

  return [...protrackHits, ...issuedHits]
    .sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime())
    .slice(0, LICENSE_OR_CERT_LIMIT);
}

function nameOf(first: string | null, last: string | null): string | null {
  const parts = [first, last].filter(Boolean) as string[];
  return parts.length ? parts.join(" ") : null;
}
