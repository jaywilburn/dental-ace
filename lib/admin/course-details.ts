"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { AdminAuditAction, type Prisma } from "@prisma/client";
import { requireStaff } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { recordAdminAction } from "@/lib/admin/audit";
import { rerenderApprovalLetter, type LetterJob } from "@/lib/admin/course-letter";
import {
  dateFromIso,
  isoFromDate,
  parseCourseDetailsForm,
  todayIso,
} from "@/lib/admin/course-add-rules";
import { courseFormatLabel } from "@/lib/pdf/course-format-label";
import { isAdminAddedApplicationData, isLegacyApplicationData } from "@/lib/forms/application/legacy";

/*
  Admin "Edit details": change a course's CE hours, subject, format or approval
  date (expiry follows at +3 years). Exists so a mistake made in "Add approved
  course" (or a wrong import, like the DIBS hours on 2026-10-27) can be fixed
  from the page instead of by script. Title stays on Rename and the course ID
  is not editable: it is printed on certificates already issued.

  What an hours change reaches: course certificates carry no hours of their own
  (issued_certificates.ce_hours is for event certs), so the Certificate Log and
  any certificate rendered from now on read the new value. ProTrack records
  synced from this course snapshot hours, so they are updated in the same
  transaction, like rename's title cascade. Certificate PDFs already stored or
  downloaded are not reissued (the DIBS fix did that by script); the page copy
  says so. Format is not cascaded: each certificate stores the format the
  attendee chose.

  One transaction: row lock on the course's application (stable "before"
  values), re-read under the lock, write only what actually changed, and a
  COURSE_DETAILS_UPDATED audit row with a from/to pair per field. The columns
  are what every list, the attendee page and the letter read; native wizard
  applications also carry the values inside application_data, which the detail
  view reads, so those keys are updated too (never added to a legacy stub).

  Format and subject compare by meaning, not by string: most courses still store
  a pre-2026-06 format such as "Live/Online", which the form shows as its
  canonical "LIVE Online". Saving the hours alone must not rewrite that value
  and log a format change nobody made.

  Event-scoped and retired courses are refused, like rename. After commit the
  stored letter is re-rendered (lib/admin/course-letter.ts).
*/

class DetailsError extends Error {}

const courseIdSchema = z.string().uuid();

type Change = { from: string | number | null; to: string | number };

// Audit-summary wording. expiresAt follows the approval date, so it is not
// named separately.
const FIELD_LABEL: Record<string, string> = {
  ceHours: "CE hours",
  courseType: "subject",
  deliveryMethod: "format",
  approvedAt: "approval date",
};

export async function updateCourseDetails(formData: FormData) {
  const admin = await requireStaff("ADMIN");
  const parsedId = courseIdSchema.safeParse(formData.get("courseId"));
  if (!parsedId.success) {
    redirect(`/admin/companies?error=${encodeURIComponent("Invalid course details request.")}`);
  }
  const courseId = parsedId.data;

  let companyId = "";
  let letter: LetterJob | null = null;

  try {
    letter = await prisma.$transaction(async (tx): Promise<LetterJob | null> => {
      const owner = await tx.accreditedCourse.findUnique({
        where: { id: courseId },
        select: { companyId: true, applicationId: true },
      });
      if (!owner) throw new DetailsError("Course not found.");
      companyId = owner.companyId;

      await tx.$executeRaw`select id from public.course_applications where id = ${owner.applicationId}::uuid for update`;
      // Read the course under the lock too: a concurrent edit that moved the
      // approval date must not hand this one a stale date for the letter.
      const course = await tx.accreditedCourse.findUniqueOrThrow({
        where: { id: courseId },
        select: {
          courseIdNumber: true,
          companyId: true,
          eventId: true,
          retiredAt: true,
          approvedAt: true,
          expiresAt: true,
          approvalLetterUrl: true,
          applicationId: true,
          company: { select: { name: true } },
        },
      });
      if (course.eventId) {
        throw new DetailsError("This course is a session of an event. Edit it through the event instead.");
      }
      if (course.retiredAt) throw new DetailsError("This course is retired and can't be edited.");

      const application = await tx.courseApplication.findUniqueOrThrow({
        where: { id: course.applicationId },
        select: {
          courseTitle: true,
          ceHours: true,
          courseType: true,
          deliveryMethod: true,
          applicationData: true,
        },
      });

      const currentApprovedOn = isoFromDate(course.approvedAt);
      const v = parseCourseDetailsForm(formData, todayIso(), currentApprovedOn);
      if (!v.ok) throw new DetailsError(v.error);
      const next = v.data;

      const oldHours = application.ceHours === null ? null : Number(application.ceHours);
      const changes: Record<string, Change> = {};
      if (oldHours !== next.ceHours) changes.ceHours = { from: oldHours, to: next.ceHours };
      if (application.courseType !== next.courseType) {
        changes.courseType = { from: application.courseType, to: next.courseType };
      }
      if (courseFormatLabel(application.deliveryMethod) !== next.deliveryMethod) {
        changes.deliveryMethod = { from: application.deliveryMethod, to: next.deliveryMethod };
      }
      const dateChanged = next.approvedOn !== currentApprovedOn;
      if (dateChanged) {
        changes.approvedAt = { from: currentApprovedOn, to: next.approvedOn };
        changes.expiresAt = { from: isoFromDate(course.expiresAt), to: next.expiresOn };
      }
      if (Object.keys(changes).length === 0) throw new DetailsError("Nothing changed.");

      // Native wizard applications mirror these fields in application_data;
      // update the keys only where they already exist.
      const data = application.applicationData;
      const inline =
        data !== null && typeof data === "object" && !Array.isArray(data)
          ? (data as Record<string, unknown>)
          : null;
      const inlinePatch: Record<string, unknown> = {};
      if (inline && "ceCreditHours" in inline && changes.ceHours) inlinePatch.ceCreditHours = next.ceHours;
      if (inline && "subjectMatter" in inline && changes.courseType) inlinePatch.subjectMatter = next.courseType;
      if (inline && "deliveryFormat" in inline && changes.deliveryMethod) {
        inlinePatch.deliveryFormat = next.deliveryMethod;
      }

      // A stub course (migrated or admin-added) has no review, so its detail
      // pages show reviewedAt as the approval date; keep the two in step.
      // Admin-added stubs also stamped submittedAt with it. A real reviewed
      // application keeps its actual review timestamps.
      const stubDates =
        dateChanged && isLegacyApplicationData(data)
          ? {
              reviewedAt: dateFromIso(next.approvedOn),
              ...(isAdminAddedApplicationData(data) ? { submittedAt: dateFromIso(next.approvedOn) } : {}),
            }
          : {};

      await tx.courseApplication.update({
        where: { id: course.applicationId },
        data: {
          ...stubDates,
          ...(changes.ceHours ? { ceHours: next.ceHours } : {}),
          ...(changes.courseType ? { courseType: next.courseType } : {}),
          ...(changes.deliveryMethod ? { deliveryMethod: next.deliveryMethod } : {}),
          ...(Object.keys(inlinePatch).length
            ? { applicationData: { ...inline, ...inlinePatch } as Prisma.InputJsonObject }
            : {}),
        },
      });

      // Course certs only: event certs (courseId null) carry their own hours.
      const synced = changes.ceHours
        ? await tx.ceCertificate.updateMany({
            where: { issuedCertificate: { courseId } },
            data: { hours: next.ceHours },
          })
        : { count: 0 };

      // An unchanged date keeps its original timestamp (a reviewer approval
      // carries a time of day); a changed one is stored at noon UTC.
      const approvedAt = dateChanged ? dateFromIso(next.approvedOn) : course.approvedAt;
      const expiresAt = dateChanged ? dateFromIso(next.expiresOn) : course.expiresAt;
      if (dateChanged) {
        await tx.accreditedCourse.update({ where: { id: courseId }, data: { approvedAt, expiresAt } });
      }

      await recordAdminAction(tx, {
        actorUserId: admin.id,
        action: AdminAuditAction.COURSE_DETAILS_UPDATED,
        summary: `Updated ${Object.keys(changes)
          .flatMap((k) => (FIELD_LABEL[k] ? [FIELD_LABEL[k]] : []))
          .join(", ")} on course ${course.courseIdNumber}`,
        details: {
          companyId,
          companyName: course.company.name,
          courseId,
          courseIdNumber: course.courseIdNumber,
          changes,
          protrackCertsUpdated: synced.count,
        } as Prisma.InputJsonObject,
      });

      if (!course.approvalLetterUrl) return null;
      return {
        path: course.approvalLetterUrl,
        companyName: course.company.name,
        courseTitle: application.courseTitle ?? course.courseIdNumber,
        courseIdNumber: course.courseIdNumber,
        ceHours: next.ceHours,
        // Unchanged: keep printing what the letter printed before.
        deliveryMethod: changes.deliveryMethod ? next.deliveryMethod : application.deliveryMethod,
        approvedAt,
        expiresAt,
      };
    });
  } catch (err) {
    if (err instanceof DetailsError) {
      const back = companyId ? `/admin/companies/${companyId}` : "/admin/companies";
      redirect(`${back}?error=${encodeURIComponent(err.message)}#courses`);
    }
    throw err;
  }

  if (letter) await rerenderApprovalLetter(letter, { action: "updateCourseDetails", courseId });

  revalidatePath(`/admin/companies/${companyId}`);
  revalidatePath("/company/courses");
  redirect(`/admin/companies/${companyId}?ok=course-details#courses`);
}
