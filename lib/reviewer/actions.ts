"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { uploadToStorage } from "@/lib/storage";
import { renderApprovalLetterPdf } from "@/lib/pdf/approval-letter";
import { renderQrPng } from "@/lib/qrcode";
import { sendEmail } from "@/lib/email/send";
import ApplicationApprovedEmail from "@/emails/application-approved";
import ApplicationRejectedEmail from "@/emails/application-rejected";
import {
  applicationDataSchema,
  type ApplicationData,
} from "@/lib/forms/application/schemas";

/*
  Approve / reject server actions invoked from the reviewer detail page.

  Approve generates the Course ID, QR code PNG, approval letter PDF, persists
  an accredited_courses row, transitions the application to APPROVED, and
  fires the approval email with attachments.

  Reject sets REJECTED with the reviewer's notes and sends the rejection
  email. Credit is NOT refunded.
*/

async function requireReviewer() {
  const user = await getCurrentUser();
  if (!user || user.role !== "REVIEWER") redirect("/login");
  return user;
}

/**
 * Compute the next ACE-YYYY-##### course id. MUST be called from inside a
 * transaction that has already acquired a year-scoped advisory lock
 * (pg_advisory_xact_lock(year)) — otherwise two concurrent approvals can
 * compute the same number and collide on the unique constraint after
 * external IO (PDF render + Storage upload) has happened.
 */
async function nextCourseIdNumber(
  tx: Prisma.TransactionClient,
  year: number,
): Promise<string> {
  const prefix = `ACE-${year}-`;
  const last = await tx.accreditedCourse.findFirst({
    where: { courseIdNumber: { startsWith: prefix } },
    orderBy: { courseIdNumber: "desc" },
    select: { courseIdNumber: true },
  });
  const lastSeq = last ? Number(last.courseIdNumber.split("-").at(-1)) : 0;
  const seq = (Number.isFinite(lastSeq) ? lastSeq : 0) + 1;
  return `${prefix}${String(seq).padStart(5, "0")}`;
}

export async function approveApplication(formData: FormData) {
  const reviewer = await requireReviewer();
  const applicationId = String(formData.get("applicationId") ?? "");
  const reviewerNotes = String(formData.get("reviewerNotes") ?? "");
  if (!applicationId) throw new Error("applicationId required");

  const application = await prisma.courseApplication.findUnique({
    where: { id: applicationId },
    include: { company: { select: { id: true, name: true, users: { select: { email: true }, take: 1 } } } },
  });
  if (!application) throw new Error("Application not found");
  if (application.status !== "PENDING") throw new Error("Only PENDING applications can be approved");

  const parsed = applicationDataSchema.safeParse(application.applicationData);
  if (!parsed.success) {
    throw new Error(`Application data invalid: ${parsed.error.message}`);
  }
  const data: ApplicationData = parsed.data;

  const approvedAt = new Date();
  const expiresAt = new Date(approvedAt);
  expiresAt.setFullYear(expiresAt.getFullYear() + 3);
  const year = approvedAt.getFullYear();
  const attendeeLinkToken = randomUUID();
  const appBase = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  // Storage paths are keyed by applicationId, not Course ID — that way a
  // retried approval or a race between two reviewers on different applications
  // can never clobber each other's QR/PDF (upsert:true is idempotent at the
  // applicationId level).
  const qrStoragePath = `qrcodes/${application.id}.png`;
  const pdfStoragePath = `approval-letters/${application.id}.pdf`;

  // 1) Commit the DB transition first, with the Course ID generated UNDER a
  //    year-scoped advisory lock so two reviewers can't compute the same id.
  //    The application's PENDING status is also re-asserted via updateMany.
  const courseIdNumber = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`select pg_advisory_xact_lock(${year})`;

    const id = await nextCourseIdNumber(tx, year);

    await tx.accreditedCourse.create({
      data: {
        applicationId: application.id,
        companyId: application.companyId,
        courseIdNumber: id,
        approvedAt,
        expiresAt,
        attendeeLinkToken,
        qrCodeUrl: qrStoragePath,
        approvalLetterUrl: pdfStoragePath,
        quizQuestions: data.quiz as unknown as object,
      },
    });

    const updated = await tx.courseApplication.updateMany({
      where: { id: application.id, status: "PENDING" },
      data: {
        status: "APPROVED",
        reviewedById: reviewer.id,
        reviewedAt: approvedAt,
        reviewerNotes,
      },
    });
    if (updated.count !== 1) {
      throw new Error("Application status changed during approval");
    }

    return id;
  });

  // 2) Render and upload assets AFTER the row is committed. Using deterministic
  //    paths means an upload failure is fully retryable — a follow-up approval
  //    of the same applicationId is blocked (unique constraint), so the only
  //    retry path is a maintenance job that re-renders for this applicationId.
  const attendeeUrl = `${appBase}/attend/${attendeeLinkToken}`;
  const [qrPng, letterPdf] = await Promise.all([
    renderQrPng(attendeeUrl),
    renderApprovalLetterPdf({
      companyName: application.company.name,
      courseTitle: data.courseTitle,
      courseIdNumber,
      ceHours: data.ceCreditHours,
      approvedAt,
      expiresAt,
      reviewerName: reviewer.email.split("@")[0],
    }),
  ]);

  await Promise.all([
    uploadToStorage({
      kind: "uploads",
      path: qrStoragePath,
      body: qrPng,
      contentType: "image/png",
    }),
    uploadToStorage({
      kind: "uploads",
      path: pdfStoragePath,
      body: letterPdf,
      contentType: "application/pdf",
    }),
  ]);

  // Approval email — log mode unless Resend is configured.
  const customerEmail = application.company.users[0]?.email;
  if (customerEmail) {
    try {
      const emailProps = {
        companyName: application.company.name,
        courseTitle: data.courseTitle,
        courseIdNumber,
        ceHours: data.ceCreditHours,
        approvedAt: approvedAt.toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        }),
        expiresAt: expiresAt.toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        }),
        myCoursesUrl: `${appBase}/company/courses`,
      };
      await sendEmail({
        to: customerEmail,
        subject: ApplicationApprovedEmail.subject(emailProps),
        react: ApplicationApprovedEmail(emailProps),
        attachments: [
          { filename: `${courseIdNumber}-approval-letter.pdf`, content: letterPdf },
          { filename: `${courseIdNumber}-attendee-qr.png`, content: qrPng },
        ],
      });
    } catch (err) {
      console.error("[approveApplication] email failed", err);
    }
  }

  revalidatePath("/reviewer");
  revalidatePath("/reviewer/approved");
  redirect("/reviewer?just=approved");
}

export async function rejectApplication(formData: FormData) {
  const reviewer = await requireReviewer();
  const applicationId = String(formData.get("applicationId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!applicationId) throw new Error("applicationId required");
  if (reason.length < 10) {
    redirect(`/reviewer/${applicationId}?error=reason_required`);
  }

  const application = await prisma.courseApplication.findUnique({
    where: { id: applicationId },
    include: { company: { select: { name: true, users: { select: { email: true }, take: 1 } } } },
  });
  if (!application) throw new Error("Application not found");
  if (application.status !== "PENDING") throw new Error("Only PENDING applications can be rejected");

  const parsed = applicationDataSchema.safeParse(application.applicationData);
  const courseTitle = parsed.success ? parsed.data.courseTitle : "(unknown course)";

  const rejectedAt = new Date();
  await prisma.courseApplication.update({
    where: { id: applicationId },
    data: {
      status: "REJECTED",
      reviewedById: reviewer.id,
      reviewedAt: rejectedAt,
      reviewerNotes: reason,
    },
  });

  const customerEmail = application.company.users[0]?.email;
  if (customerEmail) {
    try {
      const emailProps = {
        companyName: application.company.name,
        courseTitle,
        submittedAt: (application.submittedAt ?? application.createdAt).toLocaleDateString(
          "en-US",
          { month: "long", day: "numeric", year: "numeric" },
        ),
        decisionAt: rejectedAt.toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        }),
        reviewerFeedback: reason,
      };
      await sendEmail({
        to: customerEmail,
        subject: ApplicationRejectedEmail.subject(emailProps),
        react: ApplicationRejectedEmail(emailProps),
      });
    } catch (err) {
      console.error("[rejectApplication] email failed", err);
    }
  }

  revalidatePath("/reviewer");
  revalidatePath("/reviewer/rejected");
  redirect("/reviewer?just=rejected");
}
