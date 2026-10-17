import type { SurveyQuestion } from "@/lib/events/survey-schemas";

/*
  "Copy questions from another event" for the survey editor. AADB runs the
  same survey every year, so the editor can append another event's questions
  (same company) to the list being edited.

  PURE and client-safe: the page loads the sources on the server
  (survey-copy-sources.ts) and the editor appends them in client state. Nothing
  persists until the provider or admin saves, and that save goes through the
  normal action, which validates the whole list and assigns ids.

  Copied questions never carry the source event's ids. normalizeSurveyInput
  would already reject an id this event never issued, but stripping it here
  keeps the editor from treating a copy as a saved question (no "changing the
  type saves a new question" note, no "answers already collected" line).
*/

export type SurveyCopySource = {
  eventId: string;
  label: string;
  questions: SurveyQuestion[];
};

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** A source question without its id, ready to become a new unsaved draft. */
export type CopiedSurveyQuestion = DistributiveOmit<SurveyQuestion, "id">;

export type AppendCopiedResult<T> =
  | { ok: true; list: T[]; added: number }
  | { ok: false; room: number; needed: number };

/** Drop the id; copy options so the draft never shares an array with the source. */
export function stripSurveyQuestionId(q: SurveyQuestion): CopiedSurveyQuestion {
  if (q.type === "SINGLE_CHOICE" || q.type === "MULTI_CHOICE") {
    return { type: q.type, prompt: q.prompt, required: q.required, options: [...q.options] };
  }
  return { type: q.type, prompt: q.prompt, required: q.required };
}

/**
 * Append every question of `source` (in order, ids stripped) after `current`.
 * All or nothing: when the result would pass `max`, nothing is added and the
 * caller gets how many still fit, so it can say so next to the control.
 */
export function appendCopiedQuestions<T>(
  current: readonly T[],
  source: readonly SurveyQuestion[],
  max: number,
  toItem: (q: CopiedSurveyQuestion) => T,
): AppendCopiedResult<T> {
  const room = Math.max(0, max - current.length);
  if (source.length > room) return { ok: false, room, needed: source.length };
  return {
    ok: true,
    list: [...current, ...source.map((q) => toItem(stripSurveyQuestionId(q)))],
    added: source.length,
  };
}

/**
 * The source the copy control acts on: the remembered selection while it is
 * still offered, else the first source (a refreshed list can drop the
 * remembered id). Derived at render AND in the handler, so the select and
 * the button always agree. undefined only when there are no sources.
 */
export function effectiveCopySource<T extends { eventId: string }>(
  sources: readonly T[],
  selectedId: string,
): T | undefined {
  return sources.find((s) => s.eventId === selectedId) ?? sources[0];
}
