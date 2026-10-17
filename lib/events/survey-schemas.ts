import { z } from "zod";

/*
  Event attendee survey: the definition stored in events.survey and the
  answers snapshotted on issued_certificates.survey_responses.

  PURE (no DB, no server-only): the server actions, the CSV export and the
  public attendee form (validateSurveyResponses gates its Next button) all
  import it. New ids come from globalThis.crypto.randomUUID, which exists in
  Node and in every browser this form supports; only normalizeSurveyInput
  calls it, and only on the server.

  The survey is ungraded and sits OUTSIDE accreditation content: it is gated by
  companies.survey_enabled, stays editable after approval, and never affects
  scoring or credit.

  Ids are server-assigned and stable. An edit that changes a question's type
  gets a new id, so exported answers from the old type are never shown under a
  column whose meaning changed. Each stored answer is a snapshot
  {questionId, type, prompt, value}, so exports survive later edits and
  deletes.
*/

export const SURVEY_QUESTION_TYPES = [
  "SINGLE_CHOICE",
  "MULTI_CHOICE",
  "SHORT_TEXT",
  "LONG_TEXT",
] as const;
export type SurveyQuestionType = (typeof SURVEY_QUESTION_TYPES)[number];

export const SURVEY_TYPE_LABEL: Record<SurveyQuestionType, string> = {
  SINGLE_CHOICE: "Single choice",
  MULTI_CHOICE: "Multiple choice (select all that apply)",
  SHORT_TEXT: "Short answer",
  LONG_TEXT: "Long answer",
};

export const SURVEY_MAX_QUESTIONS = 40;
export const SURVEY_PROMPT_MAX = 500;
export const SURVEY_OPTIONS_MIN = 2;
export const SURVEY_OPTIONS_MAX = 20;
export const SURVEY_OPTION_MAX = 200;
export const SURVEY_SHORT_TEXT_MAX = 500;
export const SURVEY_LONG_TEXT_MAX = 5000;

export function isChoiceType(
  type: SurveyQuestionType,
): type is "SINGLE_CHOICE" | "MULTI_CHOICE" {
  return type === "SINGLE_CHOICE" || type === "MULTI_CHOICE";
}

/** Max answer length for a text question type. */
export function surveyTextMax(type: "SHORT_TEXT" | "LONG_TEXT"): number {
  return type === "SHORT_TEXT" ? SURVEY_SHORT_TEXT_MAX : SURVEY_LONG_TEXT_MAX;
}

// z.guid (not z.uuid) for the same reason as the attendee token: tolerate any
// well-formed 8-4-4-4-12 id rather than enforcing RFC 4122 variant bits.
const idSchema = z.guid();

const promptSchema = z
  .string()
  .trim()
  .min(1, "Enter the question text.")
  .max(SURVEY_PROMPT_MAX, `Keep the question under ${SURVEY_PROMPT_MAX} characters.`);

const optionsSchema = z
  .array(
    z
      .string()
      .trim()
      .min(1, "Every option needs text.")
      .max(SURVEY_OPTION_MAX, `Keep each option under ${SURVEY_OPTION_MAX} characters.`),
  )
  .min(SURVEY_OPTIONS_MIN, `Add at least ${SURVEY_OPTIONS_MIN} options.`)
  .max(SURVEY_OPTIONS_MAX, `Use no more than ${SURVEY_OPTIONS_MAX} options.`)
  .superRefine((opts, ctx) => {
    const seen = new Set<string>();
    opts.forEach((o, i) => {
      const k = o.toLowerCase();
      if (seen.has(k)) {
        ctx.addIssue({ code: "custom", message: "Each option must be different.", path: [i] });
      }
      seen.add(k);
    });
  });

const choiceShape = (type: "SINGLE_CHOICE" | "MULTI_CHOICE") => ({
  type: z.literal(type),
  prompt: promptSchema,
  required: z.boolean(),
  options: optionsSchema,
});
const textShape = (type: "SHORT_TEXT" | "LONG_TEXT") => ({
  type: z.literal(type),
  prompt: promptSchema,
  required: z.boolean(),
});

/** One stored survey question (id required). */
export const surveyQuestionSchema = z.discriminatedUnion("type", [
  z.object({ id: idSchema, ...choiceShape("SINGLE_CHOICE") }),
  z.object({ id: idSchema, ...choiceShape("MULTI_CHOICE") }),
  z.object({ id: idSchema, ...textShape("SHORT_TEXT") }),
  z.object({ id: idSchema, ...textShape("LONG_TEXT") }),
]);
export type SurveyQuestion = z.infer<typeof surveyQuestionSchema>;

/** The stored survey: events.survey. Max 40 questions, unique ids. */
export const eventSurveySchema = z
  .array(surveyQuestionSchema)
  .max(SURVEY_MAX_QUESTIONS, `A survey can have up to ${SURVEY_MAX_QUESTIONS} questions.`)
  .superRefine((qs, ctx) => {
    const seen = new Set<string>();
    qs.forEach((q, i) => {
      if (seen.has(q.id)) {
        ctx.addIssue({ code: "custom", message: "Duplicate question id.", path: [i, "id"] });
      }
      seen.add(q.id);
    });
  });
export type EventSurvey = z.infer<typeof eventSurveySchema>;

/** One question as posted by the editor: id is absent for new questions. */
export const surveyQuestionInputSchema = z.discriminatedUnion("type", [
  z.object({ id: idSchema.optional(), ...choiceShape("SINGLE_CHOICE") }),
  z.object({ id: idSchema.optional(), ...choiceShape("MULTI_CHOICE") }),
  z.object({ id: idSchema.optional(), ...textShape("SHORT_TEXT") }),
  z.object({ id: idSchema.optional(), ...textShape("LONG_TEXT") }),
]);
export type SurveyQuestionInput = z.infer<typeof surveyQuestionInputSchema>;

export const eventSurveyInputSchema = z
  .array(surveyQuestionInputSchema)
  .max(SURVEY_MAX_QUESTIONS, `A survey can have up to ${SURVEY_MAX_QUESTIONS} questions.`);

/**
 * Field errors keyed by the Zod issue path joined with ".", relative to the
 * question array: "2.prompt", "3.options", "3.options.1", "4.type". Errors on
 * the array itself (the 40 cap, unparseable JSON) use SURVEY_FORM_KEY.
 */
export type SurveyFieldErrors = Record<string, string[]>;
export const SURVEY_FORM_KEY = "survey";

function issuesToErrors(error: z.ZodError): SurveyFieldErrors {
  const out: SurveyFieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.map(String).join(".") : SURVEY_FORM_KEY;
    // A wrong or missing discriminator surfaces on the question's type field.
    (out[key] ??= []).push(
      issue.code === "invalid_union" ? "Choose a question type." : issue.message,
    );
  }
  return out;
}

export type NormalizeSurveyResult =
  | { ok: true; questions: SurveyQuestion[] }
  | { ok: false; errors: SurveyFieldErrors };

/**
 * Validate an editor submission and assign ids. `raw` is the question array,
 * or its JSON string as posted from a hidden input. `existing` is the survey
 * currently stored (parseStoredSurvey of events.survey).
 *
 * An input id is kept only when it names an existing question of the SAME
 * type and has not already been used earlier in this submission. Everything
 * else (new questions, a changed type, an id the server never issued, a
 * duplicated id) gets a fresh id, so a client can never choose or collide ids.
 */
export function normalizeSurveyInput(
  raw: unknown,
  existing: readonly SurveyQuestion[],
  newId: () => string = () => globalThis.crypto.randomUUID(),
): NormalizeSurveyResult {
  let value = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return { ok: false, errors: { [SURVEY_FORM_KEY]: ["The survey could not be read. Reload the page and try again."] } };
    }
  }
  const parsed = eventSurveyInputSchema.safeParse(value);
  if (!parsed.success) return { ok: false, errors: issuesToErrors(parsed.error) };

  const existingType = new Map(existing.map((q) => [q.id, q.type]));
  const used = new Set<string>();
  const questions = parsed.data.map((q): SurveyQuestion => {
    const keep = q.id !== undefined && existingType.get(q.id) === q.type && !used.has(q.id);
    const id = keep ? (q.id as string) : newId();
    used.add(id);
    return { ...q, id };
  });

  // Final shape check (ids are now present and unique by construction).
  const final = eventSurveySchema.safeParse(questions);
  if (!final.success) return { ok: false, errors: issuesToErrors(final.error) };
  return { ok: true, questions: final.data };
}

/** Tolerant read of events.survey: anything malformed reads as no survey. */
export function parseStoredSurvey(json: unknown): SurveyQuestion[] {
  const parsed = eventSurveySchema.safeParse(json ?? []);
  return parsed.success ? parsed.data : [];
}

// --- Attendee answers ---

/**
 * What the attendee form posts: question id -> answer. Text and single-choice
 * answers are strings; multi-choice answers are string arrays. Unanswered
 * questions may be omitted, "" or []. Bounds here are transport limits; the
 * per-question rules live in validateSurveyResponses.
 */
export const surveyAnswerInputSchema = z
  .record(
    z.string().max(64),
    z.union([
      z.string().max(SURVEY_LONG_TEXT_MAX),
      z.array(z.string().max(SURVEY_OPTION_MAX)).max(SURVEY_OPTIONS_MAX),
    ]),
  )
  .refine((r) => Object.keys(r).length <= SURVEY_MAX_QUESTIONS, {
    message: "Too many survey answers.",
  });
export type SurveyAnswerInput = z.infer<typeof surveyAnswerInputSchema>;

/** One stored answer snapshot (issued_certificates.survey_responses[]). */
export const surveyResponseSchema = z.object({
  questionId: z.string(),
  type: z.enum(SURVEY_QUESTION_TYPES),
  prompt: z.string(),
  value: z.union([z.string(), z.array(z.string())]),
});
export type SurveyResponse = z.infer<typeof surveyResponseSchema>;

/** Tolerant read of issued_certificates.survey_responses. */
export function parseStoredSurveyResponses(json: unknown): SurveyResponse[] {
  const parsed = z.array(surveyResponseSchema).safeParse(json ?? []);
  return parsed.success ? parsed.data : [];
}

export type ValidateSurveyResult =
  | { ok: true; responses: SurveyResponse[] }
  /** Keyed by question id; SURVEY_FORM_KEY when the payload itself is bad. */
  | { ok: false; errors: Record<string, string[]> };

const REQUIRED_MESSAGE = "This question is required.";

/**
 * Check the attendee's answers against the CURRENT survey definition and
 * build the snapshots to store. Answers come back in survey order; unanswered
 * optional questions are left out. Answers for ids not in the survey (a
 * question deleted while the form was open) are ignored.
 */
export function validateSurveyResponses(
  def: readonly SurveyQuestion[],
  input: unknown,
): ValidateSurveyResult {
  const parsed = surveyAnswerInputSchema.safeParse(input ?? {});
  if (!parsed.success) {
    return { ok: false, errors: { [SURVEY_FORM_KEY]: ["Your survey answers could not be read. Please review them and try again."] } };
  }
  const answers = parsed.data;
  const errors: Record<string, string[]> = {};
  const responses: SurveyResponse[] = [];
  const fail = (id: string, message: string) => {
    errors[id] = [message];
  };

  for (const q of def) {
    const raw = Object.prototype.hasOwnProperty.call(answers, q.id) ? answers[q.id] : undefined;
    const snapshot = (value: string | string[]) =>
      responses.push({ questionId: q.id, type: q.type, prompt: q.prompt, value });

    if (q.type === "MULTI_CHOICE") {
      if (raw !== undefined && !Array.isArray(raw)) {
        fail(q.id, "Choose from the options listed.");
        continue;
      }
      const picked = raw ?? [];
      if (picked.length === 0) {
        if (q.required) fail(q.id, REQUIRED_MESSAGE);
        continue;
      }
      if (new Set(picked).size !== picked.length || !picked.every((p) => q.options.includes(p))) {
        fail(q.id, "Choose from the options listed.");
        continue;
      }
      // Stored in option order, so exports read the same for every attendee.
      snapshot(q.options.filter((o) => picked.includes(o)));
      continue;
    }

    if (Array.isArray(raw)) {
      fail(q.id, q.type === "SINGLE_CHOICE" ? "Choose one option." : "Enter a text answer.");
      continue;
    }
    if (q.type === "SINGLE_CHOICE") {
      if (raw === undefined || raw === "") {
        if (q.required) fail(q.id, REQUIRED_MESSAGE);
        continue;
      }
      if (!q.options.includes(raw)) {
        fail(q.id, "Choose from the options listed.");
        continue;
      }
      snapshot(raw);
      continue;
    }

    const text = (raw ?? "").trim();
    if (text === "") {
      if (q.required) fail(q.id, REQUIRED_MESSAGE);
      continue;
    }
    const max = surveyTextMax(q.type);
    if (text.length > max) {
      fail(q.id, `Keep your answer under ${max} characters.`);
      continue;
    }
    snapshot(text);
  }

  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, responses };
}
