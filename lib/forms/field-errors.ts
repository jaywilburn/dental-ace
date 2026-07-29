import { z } from "zod";

/*
  Zod issues -> per-form-field error messages for the course-application and
  event wizards.

  WHY NOT z.flattenError: it buckets every issue by path[0], so a too-long
  presenter bio at ["presenters", 0, "bio"] collapses to the key "presenters".
  On a step with six presenter fields that produces "Presenters: keep the bio
  under 2,000 characters" with no way to place the message on the right input.
  z.treeifyError keeps the structure but still needs a hand-written walk with
  worse types, so we walk error.issues directly and map each path to the exact
  `name=` attribute the step forms render. See field-errors.test.ts.

  Pure module (no server-only, no Prisma) so both the server actions and the
  step pages can call it, and so it is directly unit-testable.
*/

/** Errors keyed by form field name. `_form` holds schema-level refinements
 *  that belong to no single input. */
export type FieldErrors = Record<string, string[]>;

/** Schema-level issues (a root .refine) have an empty path. */
export const FORM_LEVEL_KEY = "_form";

/**
 * Map one Zod issue path to the `name=` attribute of the input that produced
 * it. The array shapes below are the only ones these wizards post.
 */
function pathToFieldName(path: PropertyKey[]): string {
  if (path.length === 0) return FORM_LEVEL_KEY;

  const [head, ...rest] = path.map((p) => String(p));

  // presenters[0].bio -> presenter_0_bio (presenters-fields.tsx)
  if (head === "presenters") {
    if (rest.length >= 2) return `presenter_${rest[0]}_${rest[1]}`;
    return "presenters"; // array-level .min(1) / .max(8)
  }

  // quiz[2].options[1] -> q3_option_1, quiz[0].correctAnswer -> q1_correct
  // (quiz-fields.tsx numbers questions from 1)
  if (head === "quiz") {
    if (rest.length === 0) return "quiz"; // array-level refinements
    const n = Number(rest[0]);
    if (!Number.isInteger(n)) return "quiz";
    const q = `q${n + 1}`;
    if (rest.length === 1) return q;
    if (rest[1] === "options") {
      return rest.length >= 3 ? `${q}_option_${rest[2]}` : `${q}_options`;
    }
    if (rest[1] === "correctAnswer" || rest[1] === "correctIndex") return `${q}_correct`;
    return `${q}_${rest[1]}`;
  }

  // Root mcQuestionSchema (the per-session question steps): options[1] ->
  // option_1, matching the `option_${j}` inputs on those pages.
  if (head === "options") {
    return rest.length >= 1 ? `option_${rest[0]}` : "options";
  }

  return head;
}

/** Group a ZodError's issues by form field, preserving order and de-duping
 *  identical messages on the same field. */
export function fieldErrorsFromZod(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = pathToFieldName(issue.path);
    const bucket = (out[key] ??= []);
    if (!bucket.includes(issue.message)) bucket.push(issue.message);
  }
  return out;
}

/**
 * Re-derive a step's field errors from the draft that was just loaded.
 *
 * This is what lets the wizard show errors without storing them or threading
 * them through the URL: the failure path persists the raw slice, the page
 * re-parses it with the SAME schema the action used, and the messages fall out.
 * A draft that has since been fixed yields {} on its own, so a stale
 * ?error=validation in browser history never shows a phantom banner.
 */
export function deriveStepErrors(schema: z.ZodType, draft: unknown): FieldErrors {
  const result = schema.safeParse(draft);
  return result.success ? {} : fieldErrorsFromZod(result.error);
}
