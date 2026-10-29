"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { AdminAuditAction, Prisma } from "@prisma/client";
import { requireStaff } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { recordAdminAction } from "@/lib/admin/audit";
import { renderCourseAssets } from "@/lib/reviewer/accredit";
import { FORM_LEVEL_KEY } from "@/lib/forms/field-errors";
import { ADMIN_ADDED_SOURCE } from "@/lib/forms/application/legacy";
import {
  addCourseValuesFrom,
  dateFromIso,
  draftValuesFrom,
  parseAddCourseForm,
  todayIso,
  type AddCourseState,
  type AddCourseValues,
} from "@/lib/admin/course-add-rules";

/*
  Admin "Add approved course": put a course that was accredited somewhere other
  than this site's review queue straight onto a company's dashboard. First use:
  DA236 for Emme Sanders RDH, approved before DentalACE One and missing from the
  legacy export, so the provider could not run it.

  What it creates mirrors a reviewer approval (lib/reviewer/accredit.ts) minus
  the review: an APPROVED course_applications row carrying the legacy stub
  application_data ({ legacy, legacyCourseId, source }), so the company and
  reviewer detail pages show the "no application on file" panel instead of a
  parse error, plus the accredited course with its attendee token, quiz and
  asset paths. No application credit is taken (the course was already
  approved) and no email is sent: AADB tells the provider.

  One transaction: lock the company row (it must still exist), serialize on the
  lowercased course ID so two admins can't add "DA236" and "da236" at once,
  refuse a case-insensitive duplicate, create both rows and a COURSE_ADDED audit
  row. The unique index still backstops an exact duplicate. QR + letter render
  after commit; a failure there is logged and self-heals on first view
  (lib/courses/course-assets.ts), like every approval.

  Shaped for useActionState: a rejected submit returns field errors plus the
  echoed values; success redirects back to the company's Courses section.

  Drafts: the same form's "Save draft" button posts intent=draft, which stores
  the values as typed in admin_course_drafts (no validation beyond size, see
  course-add-rules.ts) and reloads the form on that draft. Adding the course
  deletes its draft inside the same transaction, so a finished course never
  leaves a stale draft behind. A draft id that no longer matches (another admin
  discarded it, or it belongs to another company) is never an error on save:
  the work is kept as a new draft instead.
*/

class AddCourseError extends Error {
  constructor(
    message: string,
    readonly field: string = FORM_LEVEL_KEY,
  ) {
    super(message);
  }
}

const companyIdSchema = z.string().uuid();
const draftIdSchema = z.string().uuid();

function formDraftId(formData: FormData): string | null {
  const parsed = draftIdSchema.safeParse(formData.get("draftId"));
  return parsed.success ? parsed.data : null;
}

function newCoursePath(companyId: string): string {
  return `/admin/companies/${companyId}/courses/new`;
}

function rejected(
  errors: Record<string, string[]>,
  values: AddCourseValues | null,
): AddCourseState {
  return { errors, values, attempt: Date.now() };
}

function duplicateIdError(courseIdNumber: string): AddCourseError {
  return new AddCourseError(
    `Course ID ${courseIdNumber} is already in use. Each course needs its own ID.`,
    "courseIdNumber",
  );
}

export async function addApprovedCourse(
  _prev: AddCourseState,
  formData: FormData,
): Promise<AddCourseState> {
  const admin = await requireStaff("ADMIN");
  const companyId = companyIdSchema.safeParse(formData.get("companyId"));
  if (!companyId.success) {
    return rejected({ [FORM_LEVEL_KEY]: ["This form could not be read. Reload the page and try again."] }, null);
  }

  const draftId = formDraftId(formData);
  if (formData.get("intent") === "draft") {
    return saveDraft(admin.id, companyId.data, draftId, formData);
  }

  const parsed = parseAddCourseForm(formData, todayIso());
  if (!parsed.ok) return rejected(parsed.errors, parsed.values);
  const input = parsed.data;
  const approvedAt = dateFromIso(input.approvedOn);
  const expiresAt = dateFromIso(input.expiresOn);

  let created: { courseId: string; applicationId: string; attendeeLinkToken: string; companyName: string };
  try {
    created = await prisma.$transaction(async (tx) => {
      const [company] = await tx.$queryRaw<{ name: string }[]>`
        select name from public.companies where id = ${companyId.data}::uuid for update`;
      if (!company) throw new AddCourseError("This company no longer exists.");

      await tx.$executeRaw`select pg_advisory_xact_lock(hashtext(${`admin-course-id:${input.courseIdNumber.toLowerCase()}`}))`;
      const clash = await tx.accreditedCourse.findFirst({
        where: { courseIdNumber: { equals: input.courseIdNumber, mode: "insensitive" } },
        select: { id: true },
      });
      if (clash) throw duplicateIdError(input.courseIdNumber);

      const application = await tx.courseApplication.create({
        data: {
          companyId: companyId.data,
          status: "APPROVED",
          courseTitle: input.courseTitle,
          ceHours: input.ceHours,
          courseType: input.courseType,
          deliveryMethod: input.deliveryMethod,
          applicationData: {
            legacy: true,
            legacyCourseId: input.legacyCourseId,
            source: ADMIN_ADDED_SOURCE,
          } as Prisma.InputJsonValue,
          submittedAt: approvedAt,
          reviewedAt: approvedAt,
          reviewedById: admin.id,
        },
        select: { id: true },
      });

      const attendeeLinkToken = randomUUID();
      const course = await tx.accreditedCourse.create({
        data: {
          applicationId: application.id,
          companyId: companyId.data,
          courseIdNumber: input.courseIdNumber,
          approvedAt,
          expiresAt,
          attendeeLinkToken,
          // Keyed by applicationId, the same deterministic paths an approval
          // uses, so the self-heal on first view finds them.
          qrCodeUrl: `qrcodes/${application.id}.png`,
          approvalLetterUrl: `approval-letters/${application.id}.pdf`,
          quizQuestions: input.quiz as unknown as Prisma.InputJsonValue,
        },
        select: { id: true },
      });

      await recordAdminAction(tx, {
        actorUserId: admin.id,
        action: AdminAuditAction.COURSE_ADDED,
        summary: `Added approved course ${input.courseIdNumber} "${input.courseTitle}" to ${company.name}`,
        details: {
          companyId: companyId.data,
          companyName: company.name,
          courseId: course.id,
          courseIdNumber: input.courseIdNumber,
          courseTitle: input.courseTitle,
          ceHours: input.ceHours,
          courseType: input.courseType,
          deliveryMethod: input.deliveryMethod,
          approvedAt: input.approvedOn,
          expiresAt: input.expiresOn,
          legacyCourseId: input.legacyCourseId,
        },
      });

      if (draftId) {
        await tx.adminCourseDraft.deleteMany({ where: { id: draftId, companyId: companyId.data } });
      }

      return {
        courseId: course.id,
        applicationId: application.id,
        attendeeLinkToken,
        companyName: company.name,
      };
    });
  } catch (err) {
    // Two admins racing on the exact same ID: the unique index wins.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      err = duplicateIdError(input.courseIdNumber);
    }
    if (err instanceof AddCourseError) {
      return rejected({ [err.field]: [err.message] }, addCourseValuesFrom(formData));
    }
    throw err;
  }

  await renderCourseAssets({
    applicationId: created.applicationId,
    courseIdNumber: input.courseIdNumber,
    attendeeLinkToken: created.attendeeLinkToken,
    qrStoragePath: `qrcodes/${created.applicationId}.png`,
    pdfStoragePath: `approval-letters/${created.applicationId}.pdf`,
    companyName: created.companyName,
    courseTitle: input.courseTitle,
    ceHours: input.ceHours,
    deliveryMethod: input.deliveryMethod,
    approvedAt,
    expiresAt,
  });

  revalidatePath(`/admin/companies/${companyId.data}`);
  revalidatePath("/company/courses");
  revalidatePath("/company");
  redirect(`/admin/companies/${companyId.data}?ok=course-added#courses`);
}

async function saveDraft(
  adminId: string,
  companyId: string,
  draftId: string | null,
  formData: FormData,
): Promise<AddCourseState> {
  const values = draftValuesFrom(formData) as unknown as Prisma.InputJsonValue;
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { id: true } });
  if (!company) {
    return rejected({ [FORM_LEVEL_KEY]: ["This company no longer exists."] }, addCourseValuesFrom(formData));
  }

  let savedId = draftId;
  const updated = draftId
    ? await prisma.adminCourseDraft.updateMany({
        where: { id: draftId, companyId },
        data: { values, updatedById: adminId },
      })
    : { count: 0 };
  if (updated.count === 0) {
    const created = await prisma.adminCourseDraft.create({
      data: { companyId, values, createdById: adminId, updatedById: adminId },
      select: { id: true },
    });
    savedId = created.id;
  }

  revalidatePath(`/admin/companies/${companyId}`);
  revalidatePath("/admin");
  redirect(`${newCoursePath(companyId)}?draft=${savedId}&ok=draft-saved`);
}

/** Discard an unfinished draft. Drafts are not records, so nothing is audited. */
export async function discardCourseDraft(formData: FormData) {
  await requireStaff("ADMIN");
  const companyId = companyIdSchema.safeParse(formData.get("companyId"));
  const draftId = formDraftId(formData);
  if (!companyId.success || !draftId) {
    redirect(`/admin/companies?error=${encodeURIComponent("Invalid draft request.")}`);
  }
  await prisma.adminCourseDraft.deleteMany({ where: { id: draftId, companyId: companyId.data } });
  revalidatePath(`/admin/companies/${companyId.data}`);
  revalidatePath("/admin");
  redirect(`/admin/companies/${companyId.data}?ok=draft-discarded#courses`);
}
