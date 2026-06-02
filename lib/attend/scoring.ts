import type { QuizQuestion } from "@/lib/forms/application/schemas";

/*
  Pure quiz scorer. No DB, no server-only — unit-tested directly.
  Pass threshold is 3 of 5 (PRD Flow C).
*/

export const PASS_THRESHOLD = 3;

export type AttendeeAnswer =
  | { type: "TF"; answer: "True" | "False" }
  | { type: "MC"; answer: number };

export type QuizResult = {
  score: number;
  passed: boolean;
  correct: boolean[];
};

export function scoreQuiz(
  questions: QuizQuestion[],
  answers: AttendeeAnswer[],
): QuizResult {
  if (questions.length !== answers.length) {
    throw new Error(
      `answer count (${answers.length}) does not match question count (${questions.length})`,
    );
  }
  const correct = questions.map((q, i) => {
    const a = answers[i];
    if (q.type === "TF" && a.type === "TF") return a.answer === q.correctAnswer;
    if (q.type === "MC" && a.type === "MC") return a.answer === q.correctIndex;
    return false;
  });
  const score = correct.filter(Boolean).length;
  return { score, passed: score >= PASS_THRESHOLD, correct };
}
