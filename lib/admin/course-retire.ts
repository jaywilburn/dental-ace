"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { AdminAuditAction } from "@prisma/client";
import { requireStaff } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { recordAdminAction } from "@/lib/admin/audit";
import { parseRetireCourseForm, totalAfterRetire } from "@/lib/admin/course-retire-rules";

/*
  Admin course retire. Courses are retired, never deleted: retired_at hides a
  course from company-facing lists (My Courses, the dashboard count, the event
  attach picker, expiry reminders), the Certificate Log and its CSV export, and
  closes the attendee link exactly like an expired course. Its issued
  certificates stay valid: ProTrack and public Verify keep showing them.

  First use (2026-10-27): ACE-LEG-00023 (legacy DA245) was imported under
  Limitless on Demand, which says the course is not theirs.

  One transaction with a row lock on the company (serialises against a
  concurrent retire of the same course and against certificate issuance, which
  increments total_certs_issued under the same lock): re-read the course under
  the lock, refuse if already retired, stamp retired_at, take the course's
  PASSED certificates out of companies.total_certs_issued (floored at zero) and
  write a COURSE_RETIRED audit row. cert_balance, issued_certificates and
  ce_certificates are deliberately NOT touched: the certificates were paid for
  and remain the attendees' records.

  Event-scoped courses (eventId set) are refused, like rename: they are event
  sessions, never appear on the admin course list, and retiring one would
  orphan part of an event.

  There is no un-retire control yet; reversing one is a manual DB edit
  (clear retired_at and add the count back to total_certs_issued).
*/

class RetireError extends Error {}

export async function retireCourse(formData: FormData) {
  const admin = await requireStaff("ADMIN");
  const parsed = parseRetireCourseForm({
    courseId: formData.get("courseId"),
    reason: formData.get("reason"),
  });

  // Resolved before any RetireError is thrown, so the error redirect always has
  // somewhere to land.
  let companyId = "";

  try {
    if (!parsed.ok) {
      // Resolve the company for a friendly redirect when only the reason was bad.
      const rawId = z.string().uuid().safeParse(formData.get("courseId"));
      if (rawId.success) {
        const c = await prisma.accreditedCourse.findUnique({ where: { id: rawId.data }, select: { companyId: true } });
        companyId = c?.companyId ?? "";
      }
      throw new RetireError(parsed.error);
    }
    const { courseId, reason } = parsed.data;

    await prisma.$transaction(async (tx) => {
      const owner = await tx.accreditedCourse.findUnique({
        where: { id: courseId },
        select: { companyId: true },
      });
      if (!owner) throw new RetireError("Course not found.");
      companyId = owner.companyId;

      await tx.$executeRaw`select id from public.companies where id = ${companyId}::uuid for update`;
      // Re-read under the lock so "already retired" and the counts reflect the
      // committed state, not a pre-lock snapshot.
      const course = await tx.accreditedCourse.findUniqueOrThrow({
        where: { id: courseId },
        select: {
          courseIdNumber: true,
          eventId: true,
          retiredAt: true,
          company: { select: { name: true, totalCertsIssued: true } },
        },
      });
      if (course.retiredAt) throw new RetireError("This course is already retired.");
      if (course.eventId) {
        throw new RetireError("This course is a session of an event and cannot be retired on its own.");
      }

      const certsHidden = await tx.issuedCertificate.count({ where: { courseId, passed: true } });
      const totalBefore = course.company.totalCertsIssued;
      const totalAfter = totalAfterRetire(totalBefore, certsHidden);

      await tx.accreditedCourse.update({ where: { id: courseId }, data: { retiredAt: new Date() } });
      await tx.company.update({ where: { id: companyId }, data: { totalCertsIssued: totalAfter } });
      await recordAdminAction(tx, {
        actorUserId: admin.id,
        // The subject is a course, not a user; identity lives in details.
        targetUserId: null,
        action: AdminAuditAction.COURSE_RETIRED,
        summary: `Retired course ${course.courseIdNumber} from "${course.company.name}" (${certsHidden} certificate${certsHidden === 1 ? "" : "s"} hidden from the company)`,
        details: {
          courseId,
          courseIdNumber: course.courseIdNumber,
          companyId,
          // companyName is the shared key the audit log links a company by.
          companyName: course.company.name,
          certsHidden,
          totalBefore,
          totalAfter,
          reason,
        },
      });
    });
  } catch (err) {
    if (err instanceof RetireError) {
      const back = companyId ? `/admin/companies/${companyId}` : "/admin/companies";
      redirect(`${back}?error=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }

  revalidatePath(`/admin/companies/${companyId}`);
  revalidatePath("/company/courses");
  revalidatePath("/company/certificates");
  redirect(`/admin/companies/${companyId}?ok=course-retired`);
}
