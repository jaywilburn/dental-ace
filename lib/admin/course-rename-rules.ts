import { step1Schema } from "@/lib/forms/application/schemas";

/*
  Pure validation for the admin course-rename action. No DB, no server-only —
  unit-tested directly (mirrors company-rename-rules.ts). Reuses the wizard's
  course-title rule so an admin rename can't produce a title the application
  form would reject. The wizard rule does not trim (the wizard normalizes on
  its own), so the raw input is trimmed here before parsing.
*/

export type CourseRenameValidation =
  | { ok: true; title: string }
  | { ok: false; error: string };

export function validateCourseRename(
  rawTitle: string,
  currentTitle: string | null,
): CourseRenameValidation {
  const parsed = step1Schema.shape.courseTitle.safeParse(rawTitle.trim());
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Enter a valid title." };
  }
  if (parsed.data === currentTitle) {
    return { ok: false, error: "The new title is the same as the current title." };
  }
  return { ok: true, title: parsed.data };
}
