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

/** Thrown when the course was retired by an admin (lib/admin/course-retire.ts).
 *  Callers map it to the same closed result as an expired course. */
export class CourseRetiredError extends Error {
  constructor() {
    super("course retired");
    this.name = "CourseRetiredError";
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
  completedAt: Date;
};

/**
 * Issue a passing certificate. CALLER CONTRACT: invoke this only from inside a
 * `prisma.$transaction` that has ALREADY run
 * `SELECT id FROM companies WHERE id = ... FOR UPDATE` on this company. The
 * balance re-check below is only race-safe while that row lock is held; calling
 * this without the lock lets concurrent attendees drive certBalance negative.
 */
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

  // The course counter write doubles as the retirement re-check: retireCourse
  // takes the same company row lock, so a retire that committed while the
  // attendee was filling in the form matches zero rows here and the whole
  // transaction (balance included) rolls back.
  const bumped = await tx.accreditedCourse.updateMany({
    where: { id: input.courseId, retiredAt: null },
    data: { certsIssuedCount: { increment: 1 } },
  });
  if (bumped.count === 0) throw new CourseRetiredError();
  await tx.company.update({
    where: { id: input.companyId },
    data: { certBalance: { decrement: 1 }, totalCertsIssued: { increment: 1 } },
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
      completedAt: input.completedAt,
    },
    select: { id: true },
  });
  return cert;
}
