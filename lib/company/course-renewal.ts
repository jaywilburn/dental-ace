"use server";

import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { stripLegacyStubKeys } from "@/lib/forms/application/legacy";

/*
  Course renewal (client Row 8). Renewing an expiring/expired accredited course
  creates a fresh DRAFT application pre-filled from the original course's
  application data and linked back to it via renewalOfCourseId. The customer
  then walks the normal review/submit flow, which consumes one application
  credit; on reviewer approval the old course is superseded and a new 3-year
  accreditation is issued (see lib/reviewer/actions.ts).
*/
export async function startCourseRenewal(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user?.companyId) redirect("/login");

  const courseId = String(formData.get("courseId") ?? "");
  if (!courseId) redirect("/company/courses?error=renew_failed");

  const course = await prisma.accreditedCourse.findFirst({
    where: { id: courseId, companyId: user.companyId },
    select: {
      id: true,
      supersededAt: true,
      application: { select: { applicationData: true } },
    },
  });
  if (!course) redirect("/company/courses?error=renew_not_found");
  if (course.supersededAt) redirect("/company/courses?error=already_renewed");

  // Don't start a second renewal if one is already in flight for this course.
  const openRenewal = await prisma.courseApplication.findFirst({
    where: {
      companyId: user.companyId,
      renewalOfCourseId: course.id,
      status: { in: ["DRAFT", "PENDING"] },
    },
    select: { id: true },
  });
  if (openRenewal) redirect("/company/courses?error=renewal_in_progress");

  await prisma.courseApplication.create({
    data: {
      companyId: user.companyId,
      status: "DRAFT",
      // Migrated courses carry a marker stub in their application data; strip
      // it so the renewal is a clean submission (a leftover `legacy: true`
      // would hide the renewal behind the "no application on file" panel).
      applicationData: stripLegacyStubKeys(
        course.application.applicationData,
      ) as Prisma.InputJsonValue,
      renewalOfCourseId: course.id,
    },
  });

  // The wizard's ensureDraft() picks the most recent DRAFT, which is now this
  // pre-filled renewal. Land on review/submit so the user can confirm and pay.
  redirect("/company/applications/new/review");
}
