import "server-only";
import type { Prisma } from "@prisma/client";

/*
  Issue a certificate inside an open transaction that ALREADY holds a
  `SELECT … FOR UPDATE` lock on the company row (the caller acquires it). The
  balance is re-checked under the lock to close the race between the page-load
  check and submit. Failed attempts do NOT go through here — they are written
  by the action with passed=false and never touch the balance.
*/

export class CertBalanceExhaustedError extends Error {
  constructor() {
    super("cert balance exhausted");
    this.name = "CertBalanceExhaustedError";
  }
}

export type IssueCertInput = {
  courseId: string;
  companyId: string;
  attendeeName: string;
  attendeeEmail: string;
  licenseNumber?: string | null;
  licenseType?: string | null;
  licenseStates: string[];
  deliveryMethod?: string | null;
  courseType?: string | null;
  quizResponses: unknown;
  score: number;
};

export async function issueCertificateTx(
  tx: Prisma.TransactionClient,
  input: IssueCertInput,
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
  await tx.accreditedCourse.update({
    where: { id: input.courseId },
    data: { certsIssuedCount: { increment: 1 } },
  });

  const cert = await tx.issuedCertificate.create({
    data: {
      courseId: input.courseId,
      companyId: input.companyId,
      attendeeName: input.attendeeName,
      attendeeEmail: input.attendeeEmail,
      licenseNumber: input.licenseNumber ?? null,
      licenseType: input.licenseType ?? null,
      licenseStates: input.licenseStates,
      deliveryMethod: input.deliveryMethod ?? null,
      courseType: input.courseType ?? null,
      quizResponses: input.quizResponses as Prisma.InputJsonValue,
      score: input.score,
      passed: true,
    },
    select: { id: true },
  });
  return cert;
}
