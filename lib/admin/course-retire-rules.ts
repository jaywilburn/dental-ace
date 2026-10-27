import { z } from "zod";

/*
  Pure validation + arithmetic for the admin course-retire action. No DB, no
  server-only: unit-tested directly (mirrors course-rename-rules.ts). The server
  action (course-retire.ts) applies the parsed result under the company row
  lock.
*/

export const RETIRE_REASON_MAX = 500;

export const retireCourseFormSchema = z.object({
  courseId: z.string().uuid(),
  // Required and trimmed: the reason is the only record of WHY a course left
  // the company's list, so a blank one is refused.
  reason: z
    .string()
    .trim()
    .min(1, "Enter a reason for retiring this course.")
    .max(RETIRE_REASON_MAX, `Keep the reason under ${RETIRE_REASON_MAX} characters.`),
});
export type RetireCourseForm = z.infer<typeof retireCourseFormSchema>;

export type RetireCourseParse =
  | { ok: true; data: RetireCourseForm }
  | { ok: false; error: string };

export function parseRetireCourseForm(input: { courseId: unknown; reason: unknown }): RetireCourseParse {
  const parsed = retireCourseFormSchema.safeParse(input);
  if (parsed.success) return { ok: true, data: parsed.data };
  // A malformed id is a tampered form, not a user mistake; name the reason
  // problem when that is what failed.
  const reasonIssue = parsed.error.issues.find((i) => i.path[0] === "reason");
  return { ok: false, error: reasonIssue?.message ?? "Invalid retire request." };
}

/**
 * The company's total_certs_issued after hiding `certsHidden` certificates,
 * floored at zero (the counter can already be lower than the course's
 * certificate count, e.g. after an earlier manual correction).
 */
export function totalAfterRetire(totalBefore: number, certsHidden: number): number {
  return Math.max(0, totalBefore - certsHidden);
}
