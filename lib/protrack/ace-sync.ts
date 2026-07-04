import "server-only";
import { CertSource, VerificationStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { mapCategory, mapDeliveryFormat } from "@/lib/protrack/category-map";

/*
  ACE → ProTrack auto-sync.

  When a DentalACE-issued certificate was issued to a licensee's own account
  email, it appears in their ProTrack dashboard automatically as a trusted,
  AUTO-verified certificate. This module is the single home for that logic.

  - syncIssuedCertsForLicensee: backfill, run at email verification (matches the
    account's own, now-proven email) and re-runnable.
  - claimIssuedCertificate: attaches ONE issued cert to the matching account,
    called only from /api/protrack/claim-certificate after the recipient proved
    control of attendeeEmail by clicking the signed claim link in the cert email.

  SECURITY: matching is by attendeeEmail ONLY, never by license number. License
  numbers are user-supplied at registration / add-license and are effectively
  public (state-board lookups), so matching on them would let anyone harvest
  another person's CE history by claiming their license number (IDOR). The
  account email is the only attacker-non-arbitrary key we have here.

  Email ownership is proven on BOTH paths (neither auto-attaches from a merely
  self-reported email): the backfill runs in /api/auth/verify-email, only after
  the account holder clicked their own verification link; the forward attach
  (claimIssuedCertificate) runs only from the claim route, reached by clicking a
  signed link mailed to attendeeEmail, so the clicker proved control of that
  inbox first.

  Both dedupe on ce_certificates.issuedCertificateId (unique) via createMany
  skipDuplicates, so they are safe to re-run. Prisma queries here run as the
  privileged DB role and intentionally read issued_certificates across companies;
  this is the one sanctioned cross-company read.
*/

type IssuedCertForSync = {
  id: string;
  courseType: string | null;
  deliveryMethod: string | null;
  certPdfUrl: string | null;
  completedAt: Date | null;
  ceHours: Prisma.Decimal | null;
  issuedAt: Date;
  company: { name: string };
  // Course certs carry `course`; event certs carry `event` + a stored `ceHours`.
  course: {
    application: { ceHours: Prisma.Decimal | null; courseTitle: string | null };
  } | null;
  event: { name: string } | null;
};

const ISSUED_SELECT = {
  id: true,
  courseType: true,
  deliveryMethod: true,
  certPdfUrl: true,
  completedAt: true,
  ceHours: true,
  issuedAt: true,
  company: { select: { name: true } },
  course: {
    select: {
      application: { select: { ceHours: true, courseTitle: true } },
    },
  },
  event: { select: { name: true } },
} satisfies Prisma.IssuedCertificateSelect;

function toCeCertData(issued: IssuedCertForSync, licenseeId: string) {
  // Event certs use the event name; course certs use the course title.
  const courseTitle =
    issued.event?.name ?? issued.course?.application.courseTitle ?? "DentalACE course";
  // Event certs store hours on the cert (total/attended); course certs read the
  // course's CE hours.
  const hours = issued.ceHours
    ? Number(issued.ceHours)
    : issued.course?.application.ceHours
      ? Number(issued.course.application.ceHours)
      : 0;
  return {
    licenseeId,
    courseTitle,
    provider: issued.company.name,
    source: CertSource.ACE,
    category: mapCategory({
      courseType: issued.courseType,
      courseTitle,
    }),
    hours,
    deliveryFormat: mapDeliveryFormat(issued.deliveryMethod),
    // Prefer the attendee-entered completion date; legacy rows (null) fall back
    // to the issuance timestamp.
    completedAt: issued.completedAt ?? issued.issuedAt,
    verificationStatus: VerificationStatus.AUTO,
    fileUrl: issued.certPdfUrl,
    issuedCertificateId: issued.id,
  };
}

/**
 * Backfill every DentalACE certificate that matches this licensee's email or any
 * of their license numbers. Returns the number of new ProTrack certificates
 * created. Idempotent.
 */
export async function syncIssuedCertsForLicensee(
  licenseeId: string,
): Promise<number> {
  const user = await prisma.user.findUnique({
    where: { id: licenseeId },
    select: { email: true },
  });
  if (!user) return 0;

  // Match by the account's own email only — never by user-supplied license
  // number (see SECURITY note above).
  const issued = await prisma.issuedCertificate.findMany({
    where: {
      passed: true,
      attendeeEmail: { equals: user.email, mode: "insensitive" },
    },
    select: ISSUED_SELECT,
  });
  if (issued.length === 0) return 0;

  const result = await prisma.ceCertificate.createMany({
    data: issued.map((i) => toCeCertData(i, licenseeId)),
    skipDuplicates: true,
  });
  return result.count;
}

export type CertClaimResult =
  | { status: "attached"; email: string } // matching account exists; cert now in ProTrack
  | { status: "no_account"; email: string } // nobody registered that email yet
  | { status: "invalid" }; // unknown id, or a non-passing cert

/**
 * Attach ONE freshly-issued DentalACE certificate to the ProTrack account that
 * owns its attendeeEmail. Call ONLY after the recipient proved control of that
 * email (the claim route verifies a signed link mailed to attendeeEmail — see
 * SECURITY note above). Idempotent via the unique issuedCertificateId +
 * skipDuplicates. Returns:
 *   - attached:   a matching account exists and now has the cert,
 *   - no_account: nobody has registered that email yet (route them to sign-up;
 *                 the verification backfill picks it up when they do),
 *   - invalid:    the id is unknown or the cert did not pass.
 */
export async function claimIssuedCertificate(
  issuedCertId: string,
): Promise<CertClaimResult> {
  const issued = await prisma.issuedCertificate.findUnique({
    where: { id: issuedCertId },
    select: { ...ISSUED_SELECT, passed: true, attendeeEmail: true },
  });
  if (!issued || !issued.passed) return { status: "invalid" };

  // Match the account by its email only (see SECURITY note above).
  const match = await prisma.user.findFirst({
    where: {
      email: { equals: issued.attendeeEmail, mode: "insensitive" },
    },
    select: { id: true },
  });
  if (!match) return { status: "no_account", email: issued.attendeeEmail };

  await prisma.ceCertificate.createMany({
    data: [toCeCertData(issued, match.id)],
    skipDuplicates: true,
  });
  return { status: "attached", email: issued.attendeeEmail };
}
