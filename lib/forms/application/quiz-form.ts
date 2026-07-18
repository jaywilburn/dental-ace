import { step4Schema, type QuizQuestion } from "@/lib/forms/application/schemas";

/*
  FormData -> quiz-array mapping for the 5-question certificate quiz. The field
  names (q{n}_question, q{n}_correct, q{n}_option_{0..3}) are the contract with
  <QuizFields> (components/application-form/steps/quiz-fields.tsx). Shared by
  the application wizard's saveStep4 (lib/forms/application/actions.ts) and the
  admin post-approval quiz editor (lib/admin/course-quiz.ts) so the two write
  paths can never drift. Pure module (no "use server") so it stays unit-testable.
*/

/** Minimal FormData surface so tests can drive the mapping with a plain FormData. */
type QuizFormData = Pick<FormData, "get">;

/**
 * Raw mapping, unvalidated: Q1-Q2 True/False, Q3-Q5 four-option multiple
 * choice. Missing fields become empty strings (rejected later by step4Schema);
 * a TF correct answer is only "True" when the radio says exactly "True".
 */
export function quizFromFormData(formData: QuizFormData): QuizQuestion[] {
  return [
    ...[1, 2].map((n) => ({
      type: "TF" as const,
      question: String(formData.get(`q${n}_question`) ?? ""),
      correctAnswer: (formData.get(`q${n}_correct`) === "True" ? "True" : "False") as
        | "True"
        | "False",
    })),
    ...[3, 4, 5].map((n) => ({
      type: "MC" as const,
      question: String(formData.get(`q${n}_question`) ?? ""),
      options: [0, 1, 2, 3].map((j) => String(formData.get(`q${n}_option_${j}`) ?? "")),
      correctIndex: Number(formData.get(`q${n}_correct`) ?? 0),
    })),
  ];
}

export type QuizParseResult =
  | { ok: true; quiz: QuizQuestion[] }
  | { ok: false; error: string };

/**
 * Map + validate with step4Schema: exactly 5 questions, Q1-Q2 True/False,
 * Q3-Q5 multiple choice with 4 non-empty options and an in-range correct index.
 */
export function parseQuizForm(formData: QuizFormData): QuizParseResult {
  const parsed = step4Schema.safeParse({ quiz: quizFromFormData(formData) });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "The quiz is incomplete.",
    };
  }
  return { ok: true, quiz: parsed.data.quiz };
}
