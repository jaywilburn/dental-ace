import "server-only";
import { prisma } from "@/lib/prisma";

/*
  Public Verify lookup. Unifies two data sources:
   - IssuedCertificate (Phase 1) — certificates DentalACE issued to attendees
     of accredited courses. Authoritative (the AADB issued them).
   - CeCertificate (Phase 2) — every CE cert a ProTrack licensee holds, whether
     auto-synced from DentalACE (source=ACE) or uploaded from another provider
     (ADA CERP, AGD PACE, or self-upload). Provenance is on each row.

  The lookup returns a normalized hit shape with a `provenance` label so the
  public page can show users where the record came from. PII surfaced is the
  minimum needed for a verifier to recognize the certificate: name, license
  number, course title, hours, completion date. Email is never returned to the
  public.

  Three lookup modes:
   - license — match by license number (exact)
   - name    — match by attendee/licensee name (case-insensitive contains)
   - cert    — match by cert number; for CeCertificate use cert_number, for
               IssuedCertificate use the row id when input is a uuid

  Results are de-duped: when a CeCertificate row links back to an
  IssuedCertificate (source=ACE), we prefer the CeCertificate (richer
  provenance + category data) and drop the IssuedCertificate twin.
*/

export type VerifyMode = "license" | "name" | "cert";

export type VerifyHit = {
  source: "DENTAL_ACE_ISSUED" | "PROTRACK";
  provenance: string;
  attendeeName: string;
  licenseNumber: string | null;
  courseTitle: string;
  ceHours: number;
  category: string | null;
  completedAt: Date;
  certNumber: string | null;
};

const HIT_LIMIT = 50;

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
      return "Uploaded by licensee · self-reported";
    default:
      return "Uploaded by licensee";
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function lookupCertificates(
  mode: VerifyMode,
  rawQuery: string,
): Promise<VerifyHit[]> {
  const q = rawQuery.trim();
  if (q.length < 2) return [];

  const protrack = await queryProtrack(mode, q);
  const issued = await queryIssued(mode, q);

  // De-dupe: drop IssuedCertificate twins that are already represented in the
  // ProTrack-side hits (CeCertificate.issued_certificate_id links them).
  const protrackIssuedIds = new Set<string>();
  // We re-query just to get the link ids; the ProTrack query above already
  // pulled them, but the hit type doesn't carry it — keep it lean by passing
  // the ids back through a second narrow query.
  const linked = await prisma.ceCertificate.findMany({
    where: {
      ...(mode === "license"
        ? { user: { licenses: { some: { licenseNumber: q } } } }
        : mode === "name"
          ? { user: { OR: nameClauses(q) } }
          : { OR: [{ certNumber: q }, ...(UUID_RE.test(q) ? [{ id: q }] : [])] }),
      issuedCertificateId: { not: null },
    },
    select: { issuedCertificateId: true },
    take: HIT_LIMIT,
  });
  for (const row of linked) {
    if (row.issuedCertificateId) protrackIssuedIds.add(row.issuedCertificateId);
  }

  const issuedDeduped = issued.filter(
    (hit) => !(hit.certNumber && protrackIssuedIds.has(hit.certNumber)),
  );

  return [...protrack, ...issuedDeduped]
    .sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime())
    .slice(0, HIT_LIMIT);
}

function nameClauses(q: string) {
  const parts = q.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return [
      { firstName: { contains: parts[0]!, mode: "insensitive" as const } },
      { lastName: { contains: parts[0]!, mode: "insensitive" as const } },
    ];
  }
  // First + last assumed when multiple tokens.
  const [first, ...rest] = parts;
  const last = rest.join(" ");
  return [
    {
      AND: [
        { firstName: { contains: first!, mode: "insensitive" as const } },
        { lastName: { contains: last, mode: "insensitive" as const } },
      ],
    },
  ];
}

async function queryProtrack(
  mode: VerifyMode,
  q: string,
): Promise<VerifyHit[]> {
  const where =
    mode === "license"
      ? { user: { licenses: { some: { licenseNumber: q } } } }
      : mode === "name"
        ? { user: { OR: nameClauses(q) } }
        : {
            OR: [
              { certNumber: q },
              ...(UUID_RE.test(q) ? [{ id: q }] : []),
            ],
          };

  const rows = await prisma.ceCertificate.findMany({
    where,
    orderBy: { completedAt: "desc" },
    take: HIT_LIMIT,
    select: {
      certNumber: true,
      courseTitle: true,
      hours: true,
      category: true,
      completedAt: true,
      source: true,
      user: {
        select: {
          firstName: true,
          lastName: true,
          licenses: {
            where:
              mode === "license"
                ? { licenseNumber: q }
                : { isPrimary: true },
            select: { licenseNumber: true },
            take: 1,
          },
        },
      },
    },
  });

  return rows.map((row) => ({
    source: "PROTRACK" as const,
    provenance: provenanceFor("PROTRACK", row.source),
    attendeeName: nameOf(row.user.firstName, row.user.lastName) ?? "—",
    licenseNumber: row.user.licenses[0]?.licenseNumber ?? null,
    courseTitle: row.courseTitle,
    ceHours: Number(row.hours),
    category: row.category,
    completedAt: row.completedAt,
    certNumber: row.certNumber,
  }));
}

async function queryIssued(
  mode: VerifyMode,
  q: string,
): Promise<VerifyHit[]> {
  const where =
    mode === "license"
      ? { licenseNumber: q }
      : mode === "name"
        ? { attendeeName: { contains: q, mode: "insensitive" as const } }
        : UUID_RE.test(q)
          ? { id: q }
          : { id: "00000000-0000-0000-0000-000000000000" }; // no-match

  const rows = await prisma.issuedCertificate.findMany({
    where,
    orderBy: { issuedAt: "desc" },
    take: HIT_LIMIT,
    select: {
      id: true,
      attendeeName: true,
      licenseNumber: true,
      issuedAt: true,
      course: {
        select: {
          courseIdNumber: true,
          application: {
            select: {
              courseTitle: true,
              ceHours: true,
              courseType: true,
            },
          },
        },
      },
    },
  });

  return rows.map((row) => ({
    source: "DENTAL_ACE_ISSUED" as const,
    provenance: provenanceFor("DENTAL_ACE_ISSUED"),
    attendeeName: row.attendeeName,
    licenseNumber: row.licenseNumber,
    courseTitle: row.course.application.courseTitle ?? "(course)",
    ceHours: Number(row.course.application.ceHours ?? 0),
    category: row.course.application.courseType ?? null,
    completedAt: row.issuedAt,
    certNumber: row.id,
  }));
}

function nameOf(first: string | null, last: string | null): string | null {
  const parts = [first, last].filter(Boolean) as string[];
  return parts.length ? parts.join(" ") : null;
}
