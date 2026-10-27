import { CertSource, VerificationStatus, Prisma, type PrismaClient } from "@prisma/client";
import { mapCategory, mapDeliveryFormat } from "@/lib/protrack/category-map";

/*
  The client-agnostic half of the ACE -> ProTrack sync (lib/protrack/ace-sync.ts).
  Kept free of "server-only" and of the app Prisma singleton so one-off tsx
  scripts can run the exact same issued-cert -> ce_certificates mapping inside
  their own transaction (first use: scripts/correct-attendee-email-typos.ts).
  Read the SECURITY note in ace-sync.ts before calling attach from anywhere new:
  the caller must already have proof that the cert's attendeeEmail belongs to
  the account it lands on.
*/

export type AceSyncClient = PrismaClient | Prisma.TransactionClient;

export const ISSUED_SELECT = {
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

type IssuedCertForSync = Prisma.IssuedCertificateGetPayload<{ select: typeof ISSUED_SELECT }>;

export function toCeCertData(issued: IssuedCertForSync, licenseeId: string) {
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

export type CertClaimResult =
  | { status: "attached"; email: string } // matching account exists; cert now in ProTrack
  | { status: "no_account"; email: string } // nobody registered that email yet
  | { status: "invalid" }; // unknown id, or a non-passing cert

/**
 * Attach ONE issued certificate to the account that owns its attendeeEmail,
 * through the given client (the app singleton or a transaction). Idempotent via
 * the unique ce_certificates.issuedCertificateId + skipDuplicates.
 */
export async function attachIssuedCertToMatchingAccount(
  client: AceSyncClient,
  issuedCertId: string,
): Promise<CertClaimResult> {
  const issued = await client.issuedCertificate.findUnique({
    where: { id: issuedCertId },
    select: { ...ISSUED_SELECT, passed: true, attendeeEmail: true },
  });
  if (!issued || !issued.passed) return { status: "invalid" };

  // Match the account by its email only (see SECURITY note in ace-sync.ts).
  const match = await client.user.findFirst({
    where: {
      email: { equals: issued.attendeeEmail, mode: "insensitive" },
    },
    select: { id: true },
  });
  if (!match) return { status: "no_account", email: issued.attendeeEmail };

  await client.ceCertificate.createMany({
    data: [toCeCertData(issued, match.id)],
    skipDuplicates: true,
  });
  return { status: "attached", email: issued.attendeeEmail };
}
