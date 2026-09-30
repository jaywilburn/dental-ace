/*
  Shared shapes for the public (answer-stripped) event attendee form, importable
  from both the server assembler (lib/attend/event-quiz.ts) and the client form
  (components/attend/event-attendee-form.tsx), plus the pure helper that derives
  the quiz items the attendee answers. Keeping the helper pure keeps the
  client's answer ordering testable and guarantees answers[i] lines up with the
  server's re-assembly from the same selected ids.
*/

export type PublicQuestion =
  | { type: "TF"; question: string }
  | { type: "MC"; question: string; options: string[] };

export type EventFormItemDetails = {
  objectives?: string;
  outline?: string;
  category?: string;
  format?: string;
};

export type EventFormItem = {
  id: string;
  label: string;
  /** Display line under the title, e.g. "1 CE hour" (lib/attend/format-ce-hours). */
  sub: string;
  /** The session's CE hours when known (review-step list + selected total). */
  hours?: number;
  question: PublicQuestion;
  /** Short description shown under the title (sessions with course info). */
  description?: string;
  /** Extra fields behind the "View details" expander on the select step. */
  details?: EventFormItemDetails;
  /** Presenter NAMES only (never bio/disclosure), Primary first. */
  presenters?: string[];
};

export type EventPublicForm =
  | { mode: "full"; questions: PublicQuestion[] }
  | {
      mode: "selective";
      items: EventFormItem[];
      /**
       * SELECTIVE_INLINE: each session is credited on its own answer, so the
       * selected total is a maximum. Absent/false: one overall pass threshold.
       */
      perSessionCredit?: boolean;
    };

export type ActiveQuizItem = {
  key: string;
  /** Session/course title shown above the question (selective modes only). */
  label: string | null;
  question: PublicQuestion;
  /** Presenter names for the session (selective modes only, when known). */
  presenters?: string[];
  /** The session's CE hours (selective modes only, when known). */
  hours?: number;
};

/**
 * The questions to answer, with their answer keys and session labels, in
 * SUBMIT ORDER. Selective mode preserves the form's item order (not the
 * attendee's click order) so the server re-derives the same question sequence
 * from selectedSessionIds.
 */
export function activeQuizItems(
  form: EventPublicForm,
  selectedIds: string[],
): ActiveQuizItem[] {
  if (form.mode === "full") {
    return form.questions.map((q, i) => ({
      key: String(i),
      label: null,
      question: q,
    }));
  }
  return form.items
    .filter((it) => selectedIds.includes(it.id))
    .map((it) => ({
      key: it.id,
      label: it.label,
      question: it.question,
      ...(it.presenters?.length ? { presenters: it.presenters } : {}),
      ...(typeof it.hours === "number" ? { hours: it.hours } : {}),
    }));
}

/**
 * Sum of the known CE hours across the active (selected) items. This is the
 * MAXIMUM the attendee can earn: SELECTIVE_INLINE credits only the sessions
 * whose question is answered correctly.
 */
export function selectedHoursTotal(items: ActiveQuizItem[]): number {
  return items.reduce((sum, it) => sum + (it.hours ?? 0), 0);
}
