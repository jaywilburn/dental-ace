"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { AdminAuditAction, type Prisma } from "@prisma/client";
import { requireStaff } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { recordAdminAction } from "@/lib/admin/audit";
import { parseQuizForm } from "@/lib/forms/application/quiz-form";

/*
  Admin-only post-approval quiz editor. Legacy-migrated courses landed with
  quiz_questions = [], which fails the exactly-5-questions guard on the public
  attendee page (/attend/[token]) and leaves the course "not configured for
  certificates". This action attaches or replaces the 5-question quiz on an
  already-approved course.

  Same contract as sibling admin actions (lib/admin/company-rename.ts,
  lib/admin/letter-settings-actions.ts): requireStaff("ADMIN") -> Zod-validate ->
  transaction (update + audit row atomically) -> revalidate -> redirect back to
  the editor with ?ok / ?error. Validation reuses step4Schema via parseQuizForm,
  so an admin can never save a quiz shape the application wizard would reject.
*/

const courseIdSchema = z.string().uuid();

function editorPath(courseId: string): string {
  return `/admin/courses/${courseId}/quiz`;
}

export async function saveCourseQuiz(formData: FormData) {
  const admin = await requireStaff("ADMIN");

  const parsedId = courseIdSchema.safeParse(String(formData.get("courseId") ?? ""));
  if (!parsedId.success) throw new Error("Invalid courseId");
  const courseId = parsedId.data;

  const parsed = parseQuizForm(formData);
  if (!parsed.ok) {
    redirect(`${editorPath(courseId)}?error=${encodeURIComponent(parsed.error)}`);
  }

  const course = await prisma.accreditedCourse.findUnique({
    where: { id: courseId },
    select: { courseIdNumber: true, eventId: true },
  });
  if (!course) {
    redirect(
      `${editorPath(courseId)}?error=${encodeURIComponent("That course no longer exists.")}`,
    );
  }
  // Event-session courses (FULL_EVENT_QUIZ) carry a single MC question authored
  // through the event; this 5-question editor must never overwrite it, even via
  // a direct POST.
  if (course.eventId) {
    redirect(
      `${editorPath(courseId)}?error=${encodeURIComponent(
        "This is an event session; its question is managed through the event.",
      )}`,
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.accreditedCourse.update({
      where: { id: courseId },
      data: { quizQuestions: parsed.quiz as Prisma.InputJsonValue },
    });
    await recordAdminAction(tx, {
      actorUserId: admin.id,
      targetUserId: null,
      action: AdminAuditAction.COURSE_QUIZ_UPDATED,
      summary: `Updated the certificate quiz for course ${course.courseIdNumber}`,
      details: { courseId, courseIdNumber: course.courseIdNumber },
    });
  });

  revalidatePath(editorPath(courseId));
  revalidatePath("/reviewer/approved");
  redirect(`${editorPath(courseId)}?ok=saved`);
}
