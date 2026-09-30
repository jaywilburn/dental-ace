import { z } from "zod";
import { quizQuestionSchema } from "@/lib/forms/application/schemas";

/*
  Whether a standalone accredited course can issue certificates, as far as its
  quiz goes. The public attendee page (app/attend/[token]/page.tsx) refuses to
  serve a course whose quiz_questions is not exactly 5 valid questions ("not
  configured for certificates yet"). Legacy-migrated courses arrived with an
  empty quiz, so staff surfaces use this one check to flag them and route an
  ADMIN to the post-approval editor at /admin/courses/[id]/quiz.

  Event courses are excluded by callers: their single-MC session quiz is
  authored through the event, not the standalone editor.
*/
export const certificateQuizSchema = z.array(quizQuestionSchema).length(5);

export function hasCertificateQuiz(quizQuestions: unknown): boolean {
  return certificateQuizSchema.safeParse(quizQuestions).success;
}

export function quizEditorPath(courseId: string): string {
  return `/admin/courses/${courseId}/quiz`;
}
