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

export type EventFormItem = {
  id: string;
  label: string;
  sub: string;
  question: PublicQuestion;
};

export type EventPublicForm =
  | { mode: "full"; questions: PublicQuestion[] }
  | { mode: "selective"; items: EventFormItem[] };

export type ActiveQuizItem = {
  key: string;
  /** Session/course title shown above the question (selective modes only). */
  label: string | null;
  question: PublicQuestion;
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
    .map((it) => ({ key: it.id, label: it.label, question: it.question }));
}
