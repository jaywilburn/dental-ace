import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { appBaseUrl } from "@/lib/app-url";
import { uploadToStorage } from "@/lib/storage";
import { renderApprovalLetterPdf } from "@/lib/pdf/approval-letter";
import { renderQrPng } from "@/lib/qrcode";
import { formatCourseId, nextSeqFromLast } from "@/lib/reviewer/course-id";
import { getLetterSignatory } from "@/lib/admin/letter-settings";
import type { ApplicationDataRead } from "@/lib/forms/application/schemas";

/*
  Shared course-accreditation core used by BOTH the standalone application
  approval (lib/reviewer/actions.ts) and the event approval that accredits each
  inline session as an event-scoped course (lib/reviewer/event-actions.ts).

  Server-only (not a "use server" action): accreditApplicationTx takes a Prisma
  transaction client, so it must be an ordinary function invoked from inside an
  action's transaction, never an RPC action itself.
*/

/**
 * Next ACE-YYYY-##### course id. MUST run inside a transaction that already holds
 * the year-scoped course advisory lock (pg_advisory_xact_lock(year)) so two
 * concurrent approvals can't compute the same number.
 */
export async function nextCourseIdNumber(
  tx: Prisma.TransactionClient,
  year: number,
): Promise<string> {
  const prefix = `ACE-${year}-`;
  const last = await tx.accreditedCourse.findFirst({
    where: { courseIdNumber: { startsWith: prefix } },
    orderBy: { courseIdNumber: "desc" },
    select: { courseIdNumber: true },
  });
  return formatCourseId(year, nextSeqFromLast(last?.courseIdNumber ?? null));
}

export type AccreditInput = {
  application: {
    id: string;
    companyId: string;
    renewalOfCourseId: string | null;
  };
  data: ApplicationDataRead;
  reviewerId: string;
  reviewerNotes?: string;
  approvedAt: Date;
  expiresAt: Date;
  year: number;
  /** When set, the resulting course is event-scoped (hidden from /company/courses). */
  eventId?: string | null;
};

export type AccreditResult = {
  courseId: string;
  applicationId: string;
  courseIdNumber: string;
  attendeeLinkToken: string;
  qrStoragePath: string;
  pdfStoragePath: string;
  eventScoped: boolean;
};

/**
 * Accredit one PENDING application inside a transaction: allocate its Course ID,
 * create the AccreditedCourse (event-scoped when eventId is set), flip the
 * application to APPROVED, and supersede a renewed course. Returns everything the
 * caller needs to render assets AFTER commit. The caller MUST already hold the
 * year-scoped course advisory lock.
 */
export async function accreditApplicationTx(
  tx: Prisma.TransactionClient,
  input: AccreditInput,
): Promise<AccreditResult> {
  const { application, data, reviewerId, approvedAt, expiresAt, year, eventId } = input;
  const courseIdNumber = await nextCourseIdNumber(tx, year);
  const attendeeLinkToken = randomUUID();
  // Paths keyed by applicationId so a retried approval is idempotent.
  const qrStoragePath = `qrcodes/${application.id}.png`;
  const pdfStoragePath = `approval-letters/${application.id}.pdf`;

  const course = await tx.accreditedCourse.create({
    data: {
      applicationId: application.id,
      companyId: application.companyId,
      courseIdNumber,
      approvedAt,
      expiresAt,
      attendeeLinkToken,
      qrCodeUrl: qrStoragePath,
      approvalLetterUrl: pdfStoragePath,
      quizQuestions: data.quiz as unknown as object,
      eventId: eventId ?? null,
    },
    select: { id: true },
  });

  const updated = await tx.courseApplication.updateMany({
    where: { id: application.id, status: "PENDING" },
    data: {
      status: "APPROVED",
      reviewedById: reviewerId,
      reviewedAt: approvedAt,
      reviewerNotes: input.reviewerNotes ?? "",
    },
  });
  if (updated.count !== 1) {
    throw new Error("Application status changed during approval");
  }

  // Supersede the renewed course, if any (kept for history; no longer live).
  if (application.renewalOfCourseId) {
    await tx.accreditedCourse.updateMany({
      where: { id: application.renewalOfCourseId, supersededAt: null },
      data: { supersededAt: approvedAt },
    });
  }

  return {
    courseId: course.id,
    applicationId: application.id,
    courseIdNumber,
    attendeeLinkToken,
    qrStoragePath,
    pdfStoragePath,
    eventScoped: !!eventId,
  };
}

export type RenderCourseAssetsInput = {
  applicationId: string;
  courseIdNumber: string;
  attendeeLinkToken: string;
  qrStoragePath: string;
  pdfStoragePath: string;
  companyName: string;
  courseTitle: string;
  ceHours: number;
  approvedAt: Date;
  expiresAt: Date;
  /** Event-scoped sessions attend via the event token, so skip the per-course QR. */
  withQr?: boolean;
};

/**
 * Render + upload a course's approval letter (always) and attendee QR (unless
 * the course is event-scoped). Runs AFTER commit; failures are logged, never
 * fatal — deterministic paths let /company/courses self-heal on demand. Returns
 * the rendered buffers so the caller can attach them to an approval email.
 */
export async function renderCourseAssets(
  input: RenderCourseAssetsInput,
): Promise<{ qrPng: Buffer | null; letterPdf: Buffer | null }> {
  const withQr = input.withQr ?? true;
  let qrPng: Buffer | null = null;
  let letterPdf: Buffer | null = null;
  try {
    const signatory = await getLetterSignatory();
    const attendeeUrl = `${appBaseUrl()}/attend/${input.attendeeLinkToken}`;
    const jobs: Promise<unknown>[] = [];

    const letterJob = renderApprovalLetterPdf({
      companyName: input.companyName,
      courseTitle: input.courseTitle,
      courseIdNumber: input.courseIdNumber,
      ceHours: input.ceHours,
      approvedAt: input.approvedAt,
      expiresAt: input.expiresAt,
      ...signatory,
    }).then((pdf) => {
      letterPdf = pdf;
    });
    jobs.push(letterJob);

    if (withQr) {
      const qrJob = renderQrPng(attendeeUrl).then((png) => {
        qrPng = png;
      });
      jobs.push(qrJob);
    }
    await Promise.all(jobs);

    const uploads: Promise<unknown>[] = [];
    if (letterPdf) {
      uploads.push(
        uploadToStorage({
          kind: "uploads",
          path: input.pdfStoragePath,
          body: letterPdf,
          contentType: "application/pdf",
        }),
      );
    }
    if (withQr && qrPng) {
      uploads.push(
        uploadToStorage({
          kind: "uploads",
          path: input.qrStoragePath,
          body: qrPng,
          contentType: "image/png",
        }),
      );
    }
    await Promise.all(uploads);
  } catch (err) {
    console.error(
      `[renderCourseAssets] failed (applicationId=${input.applicationId}, courseId=${input.courseIdNumber})`,
      err,
    );
  }
  return { qrPng, letterPdf };
}
