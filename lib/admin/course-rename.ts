"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { AdminAuditAction, type Prisma } from "@prisma/client";
import { requireStaff } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { recordAdminAction } from "@/lib/admin/audit";
import { validateCourseRename } from "@/lib/admin/course-rename-rules";
import { getLetterSignatory } from "@/lib/admin/letter-settings";
import { renderApprovalLetterPdf } from "@/lib/pdf/approval-letter";
import { uploadToStorage } from "@/lib/storage";

/*
  Admin course rename. Runs in one transaction: row lock on the course's
  application (a stable old title), the title update, the cascade to ProTrack
  snapshots, and a COURSE_RENAMED audit row. Mirrors company-rename.ts.

  The title lives on course_applications.course_title (what every list, the
  certificate and the approval letter read) and, for native wizard
  applications, is duplicated inside application_data.courseTitle (what the
  application detail view reads, lib/forms/application/detail-rows.ts). Both
  are updated so the two views never disagree. Legacy import stubs have no
  courseTitle key in application_data and the key is never added for them.

  The cascade rewrites ce_certificates.course_title for certs LINKED to this
  course's issued certs (issuedCertificateId → courseId). The title is a
  snapshot taken at sync time (lib/protrack/ace-sync.ts toCeCertData), so
  without this, already-synced ProTrack records keep the old title forever.
  Licensee-uploaded certs (issuedCertificateId null) are never touched, even
  if their typed title happens to match.

  Event-scoped courses (eventId set) are refused: their titles are session
  titles, edited through the event, and they never appear on this page.

  After commit, the stored approval letter is re-rendered in place. The
  self-heal path in lib/courses/course-assets.ts only regenerates a MISSING
  object, so an existing letter would otherwise keep the old title forever.
  A letter failure is logged, not surfaced: the rename itself has committed.
*/

class RenameError extends Error {}

// Boundary validation for the form post. The title's content rule lives in
// course-rename-rules.ts (checked under the row lock against the current
// title); this only guarantees the ids are well-formed before they reach
// Prisma, so a tampered hidden input redirects instead of throwing a 500.
const renameCourseFormSchema = z.object({
  courseId: z.string().uuid(),
  title: z.string(),
});

// Everything the post-commit letter re-render needs, captured inside the
// transaction and returned from it (a closure assignment would not narrow).
type LetterJob = {
  path: string;
  companyName: string;
  courseTitle: string;
  courseIdNumber: string;
  ceHours: number;
  deliveryMethod: string | null;
  approvedAt: Date;
  expiresAt: Date;
};

export async function renameCourse(formData: FormData) {
  const admin = await requireStaff("ADMIN");
  const parsedForm = renameCourseFormSchema.safeParse({
    courseId: formData.get("courseId"),
    title: formData.get("title"),
  });
  if (!parsedForm.success) {
    redirect(`/admin/companies?error=${encodeURIComponent("Invalid rename request.")}`);
  }
  const { courseId, title: rawTitle } = parsedForm.data;

  // Resolved inside the transaction; needed afterwards for the redirect.
  // Set before any RenameError is thrown, so the error redirect always has
  // somewhere to land.
  let companyId = "";
  let letter: LetterJob | null = null;

  try {
    letter = await prisma.$transaction(async (tx): Promise<LetterJob | null> => {
      const course = await tx.accreditedCourse.findUnique({
        where: { id: courseId },
        select: {
          id: true,
          courseIdNumber: true,
          companyId: true,
          eventId: true,
          approvedAt: true,
          expiresAt: true,
          approvalLetterUrl: true,
          // courseTitle and applicationData are deliberately NOT read here:
          // both are re-read under the row lock below, and the JSON blob is
          // large enough that fetching it twice per rename is wasteful.
          application: { select: { id: true, ceHours: true, deliveryMethod: true } },
          company: { select: { name: true } },
        },
      });
      if (!course) throw new RenameError("Course not found");
      companyId = course.companyId;
      if (course.eventId) {
        throw new RenameError(
          "This course is a session of an event. Edit the session title through the event instead.",
        );
      }

      const applicationId = course.application.id;
      await tx.$executeRaw`select id from public.course_applications where id = ${applicationId}::uuid for update`;
      // Re-read under the lock so the "same title" check and the audit row's
      // oldTitle reflect the committed value, not a pre-lock snapshot.
      const application = await tx.courseApplication.findUniqueOrThrow({
        where: { id: applicationId },
        select: { courseTitle: true, applicationData: true },
      });
      const v = validateCourseRename(rawTitle, application.courseTitle);
      if (!v.ok) throw new RenameError(v.error);

      // Only native wizard applications carry the title inside applicationData;
      // never add the key to a legacy stub that lacks it.
      const data = application.applicationData;
      const hasInlineTitle =
        data !== null &&
        typeof data === "object" &&
        !Array.isArray(data) &&
        typeof (data as Record<string, unknown>).courseTitle === "string";
      await tx.courseApplication.update({
        where: { id: applicationId },
        data: {
          courseTitle: v.title,
          ...(hasInlineTitle
            ? {
                applicationData: {
                  ...(data as Record<string, unknown>),
                  courseTitle: v.title,
                } as Prisma.InputJsonObject,
              }
            : {}),
        },
      });

      const synced = await tx.ceCertificate.updateMany({
        where: { issuedCertificate: { courseId } },
        data: { courseTitle: v.title },
      });

      await recordAdminAction(tx, {
        actorUserId: admin.id,
        action: AdminAuditAction.COURSE_RENAMED,
        summary: `Renamed course ${course.courseIdNumber} "${application.courseTitle ?? ""}" to "${v.title}"`,
        details: {
          companyId,
          // companyName is the shared key the audit log links a company by;
          // the course fields stay for the rename-specific record.
          companyName: course.company.name,
          courseId,
          courseIdNumber: course.courseIdNumber,
          oldTitle: application.courseTitle,
          newTitle: v.title,
          protrackCertsUpdated: synced.count,
        },
      });

      if (!course.approvalLetterUrl) return null;
      const inlineFormat = hasInlineTitle
        ? (data as Record<string, unknown>).deliveryFormat
        : undefined;
      return {
        path: course.approvalLetterUrl,
        companyName: course.company.name,
        courseTitle: v.title,
        courseIdNumber: course.courseIdNumber,
        ceHours: Number(course.application.ceHours ?? 0),
        // Same source accredit.ts used at approval (applicationData.deliveryFormat),
        // falling back to the denormalized column for legacy rows.
        deliveryMethod:
          typeof inlineFormat === "string" ? inlineFormat : (course.application.deliveryMethod ?? null),
        approvedAt: course.approvedAt,
        expiresAt: course.expiresAt,
      };
    });
  } catch (err) {
    if (err instanceof RenameError) {
      const back = companyId ? `/admin/companies/${companyId}` : "/admin/companies";
      redirect(`${back}?error=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }

  // Outside the transaction: PDF render + storage IO must not hold the row
  // lock, and a failure here must not roll back a committed rename.
  if (letter) {
    try {
      const body = await renderApprovalLetterPdf({
        companyName: letter.companyName,
        courseTitle: letter.courseTitle,
        courseIdNumber: letter.courseIdNumber,
        ceHours: letter.ceHours,
        deliveryMethod: letter.deliveryMethod,
        approvedAt: letter.approvedAt,
        expiresAt: letter.expiresAt,
        ...(await getLetterSignatory()),
      });
      await uploadToStorage({ kind: "uploads", path: letter.path, body, contentType: "application/pdf" });
    } catch (err) {
      console.error(
        `[renameCourse] approval letter re-render failed (courseId=${courseId}, path=${letter.path})`,
        err,
      );
    }
  }

  revalidatePath(`/admin/companies/${companyId}`);
  revalidatePath("/company/courses");
  redirect(`/admin/companies/${companyId}?ok=course-renamed`);
}
