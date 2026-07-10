import "server-only";
import { Prisma } from "@prisma/client";
import { CertBalanceExhaustedError } from "@/lib/attend/issue";

/*
  Issue ONE event certificate inside an open transaction that already holds a
  FOR UPDATE lock on the company row (the caller acquires it). Sibling of
  issueCertificateTx; the single-course path stays untouched. Exactly one
  IssuedCertificate per (event, attendee): courseId null, eventId set, hours
  stored on the row (total for full attendance, attended-sum for selective).
*/

export type IssueEventCertInput = {
  eventId: string;
  companyId: string;
  attendeeName: string;
  attendeeEmail: string;
  licenseNumber?: string | null;
  licenseType?: string | null;
  licenseStates: string[];
  /** Attendee-chosen course format; stored as the cert's deliveryMethod. */
  deliveryMethod?: string | null;
  quizResponses: unknown;
  score: number;
  ceHours: number;
  attendedSessionIds: string[];
  completedAt: Date;
};

export async function issueEventCertificateTx(
  tx: Prisma.TransactionClient,
  input: IssueEventCertInput,
): Promise<{ id: string }> {
  const company = await tx.company.findUniqueOrThrow({
    where: { id: input.companyId },
    select: { certBalance: true },
  });
  if (company.certBalance <= 0) {
    throw new CertBalanceExhaustedError();
  }

  await tx.company.update({
    where: { id: input.companyId },
    data: { certBalance: { decrement: 1 }, totalCertsIssued: { increment: 1 } },
  });
  await tx.event.update({
    where: { id: input.eventId },
    data: { certsIssuedCount: { increment: 1 } },
  });

  const cert = await tx.issuedCertificate.create({
    data: {
      eventId: input.eventId,
      courseId: null,
      companyId: input.companyId,
      attendeeName: input.attendeeName,
      attendeeEmail: input.attendeeEmail,
      licenseNumber: input.licenseNumber ?? null,
      licenseType: input.licenseType ?? null,
      licenseStates: input.licenseStates,
      deliveryMethod: input.deliveryMethod ?? "LIVE In Person",
      quizResponses: input.quizResponses as Prisma.InputJsonValue,
      score: input.score,
      passed: true,
      ceHours: new Prisma.Decimal(input.ceHours),
      attendedSessionIds: input.attendedSessionIds as unknown as Prisma.InputJsonValue,
      completedAt: input.completedAt,
    },
    select: { id: true },
  });
  return cert;
}
