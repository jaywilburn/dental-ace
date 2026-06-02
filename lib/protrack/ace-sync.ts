import "server-only";
import { CertSource, VerificationStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { mapCategory, mapDeliveryFormat } from "@/lib/protrack/category-map";

/*
  ACE → ProTrack auto-sync.

  When a DentalACE-issued certificate was issued to a licensee's own account
  email, it appears in their ProTrack dashboard automatically as a trusted,
  AUTO-verified certificate. This module is the single home for that logic.

  - syncIssuedCertsForLicensee: backfill, run at registration and re-runnable.
  - syncNewIssuedCertificate: forward hook for the future attendee-issuance flow.

  SECURITY: matching is by attendeeEmail ONLY, never by license number. License
  numbers are user-supplied at registration / add-license and are effectively
  public (state-board lookups), so matching on them would let anyone harvest
  another person's CE history by claiming their license number (IDOR). The
  account email is the only attacker-non-arbitrary key we have here.

  Remaining hardening (tracked for before real issued certs exist in Weeks 5-6):
  registration sets email_confirm=true without a verification round-trip, so the
  email is not yet proven. Add email verification (or a per-cert claim code
  mailed to the original attendeeEmail) before go-live so the email key is
  trustworthy. Until then this is bounded: it only surfaces certificates issued
  to an email that is not already a registered account.

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
  issuedAt: Date;
  company: { name: string };
  course: {
    application: { ceHours: Prisma.Decimal | null; courseTitle: string | null };
  };
};

const ISSUED_SELECT = {
  id: true,
  courseType: true,
  deliveryMethod: true,
  certPdfUrl: true,
  issuedAt: true,
  company: { select: { name: true } },
  course: {
    select: {
      application: { select: { ceHours: true, courseTitle: true } },
    },
  },
} satisfies Prisma.IssuedCertificateSelect;

function toCeCertData(issued: IssuedCertForSync, licenseeId: string) {
  const courseTitle = issued.course.application.courseTitle ?? "DentalACE course";
  return {
    licenseeId,
    courseTitle,
    provider: issued.company.name,
    source: CertSource.ACE,
    category: mapCategory({
      courseType: issued.courseType,
      courseTitle,
    }),
    hours: issued.course.application.ceHours
      ? Number(issued.course.application.ceHours)
      : 0,
    deliveryFormat: mapDeliveryFormat(issued.deliveryMethod),
    completedAt: issued.issuedAt,
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

/**
 * Forward hook: sync a single freshly-issued DentalACE certificate to its
 * licensee, if one exists. Called by the attendee-issuance flow (Weeks 5-6).
 * No-ops when no matching licensee has registered yet; their later registration
 * backfill will pick it up. Returns the number created (0 or 1).
 */
export async function syncNewIssuedCertificate(
  issuedCertId: string,
): Promise<number> {
  const issued = await prisma.issuedCertificate.findUnique({
    where: { id: issuedCertId },
    select: { ...ISSUED_SELECT, passed: true, attendeeEmail: true },
  });
  if (!issued || !issued.passed) return 0;

  // Match the account by its email only (see SECURITY note above).
  const match = await prisma.user.findFirst({
    where: {
      email: { equals: issued.attendeeEmail, mode: "insensitive" },
    },
    select: { id: true },
  });
  if (!match) return 0;

  const result = await prisma.ceCertificate.createMany({
    data: [toCeCertData(issued, match.id)],
    skipDuplicates: true,
  });
  return result.count;
}
