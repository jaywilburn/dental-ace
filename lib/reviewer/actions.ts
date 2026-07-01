"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { appBaseUrl } from "@/lib/app-url";
import { sendEmail } from "@/lib/email/send";
import ApplicationApprovedEmail from "@/emails/application-approved";
import ApplicationRejectedEmail from "@/emails/application-rejected";
import {
  applicationDataReadSchema,
  type ApplicationDataRead,
} from "@/lib/forms/application/schemas";
import { accreditApplicationTx, renderCourseAssets } from "@/lib/reviewer/accredit";

/*
  Approve / reject server actions invoked from the reviewer detail page.

  Approve generates the Course ID, QR code PNG, approval letter PDF, persists
  an accredited_courses row, transitions the application to APPROVED, and
  fires the approval email with attachments. The accreditation core is shared
  with event approval via lib/reviewer/accredit.ts.

  Reject sets REJECTED with the reviewer's notes and sends the rejection
  email. Credit is NOT refunded.
*/

async function requireReviewer() {
  const user = await getCurrentUser();
  if (!user || (user.staffRole !== "REVIEWER" && user.staffRole !== "ADMIN")) redirect("/login");
  return user;
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

  // Tolerant read schema: applications submitted before the 2026-06 form
  // changes must stay approvable despite retired enum values / removed fields.
  const parsed = applicationDataReadSchema.safeParse(application.applicationData);
  if (!parsed.success) {
    throw new Error(`Application data invalid: ${parsed.error.message}`);
  }
  const data: ApplicationDataRead = parsed.data;

  const approvedAt = new Date();
  const expiresAt = new Date(approvedAt);
  expiresAt.setFullYear(expiresAt.getFullYear() + 3);
  const year = approvedAt.getFullYear();
  const appBase = appBaseUrl();

  // 1) Commit the DB transition first, with the Course ID generated UNDER a
  //    year-scoped advisory lock so two reviewers can't compute the same id.
  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`select pg_advisory_xact_lock(${year})`;
    return accreditApplicationTx(tx, {
      application: {
        id: application.id,
        companyId: application.companyId,
        renewalOfCourseId: application.renewalOfCourseId,
      },
      data,
      reviewerId: reviewer.id,
      reviewerNotes,
      approvedAt,
      expiresAt,
      year,
    });
  });
  const courseIdNumber = result.courseIdNumber;

  // 2) Render + upload assets AFTER commit (non-fatal; My Courses self-heals).
  const { qrPng, letterPdf } = await renderCourseAssets({
    applicationId: application.id,
    courseIdNumber,
    attendeeLinkToken: result.attendeeLinkToken,
    qrStoragePath: result.qrStoragePath,
    pdfStoragePath: result.pdfStoragePath,
    companyName: application.company.name,
    courseTitle: data.courseTitle,
    ceHours: data.ceCreditHours,
    approvedAt,
    expiresAt,
    reviewerName: reviewer.email.split("@")[0],
    withQr: true,
  });

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
        // If asset rendering failed, send the approval email without
        // attachments; the deliverables stay downloadable from My Courses.
        attachments:
          qrPng && letterPdf
            ? [
                { filename: `${courseIdNumber}-approval-letter.pdf`, content: letterPdf },
                { filename: `${courseIdNumber}-attendee-qr.png`, content: qrPng },
              ]
            : undefined,
      });
    } catch (err) {
      console.error("[approveApplication] email failed", err);
    }
  }

  revalidatePath("/reviewer");
  revalidatePath("/reviewer/approved");
  revalidatePath("/company/courses");
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

  const parsed = applicationDataReadSchema.safeParse(application.applicationData);
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
