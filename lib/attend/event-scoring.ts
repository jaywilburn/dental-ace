import type { QuizQuestion } from "@/lib/forms/application/schemas";
import type { AttendeeAnswer, QuizResult } from "@/lib/attend/scoring";

/*
  Variable-length quiz scorer for events. The single-course scorer
  (lib/attend/scoring.ts, fixed 5 questions / 3-of-5) is left untouched.

  Event quizzes vary in length: Opt 1 is 5 questions, Opt 2 is one per attached
  course, Opt 3/4 are one per attended session/course. Pass = at least
  `passPct` of the answered questions correct.

  Rounding: Math.round with a floor of 1 (so a single-question quiz needs 1/1,
  a 2-question quiz needs 1/2, a 3-question quiz needs 2/3, a 5-question quiz
  needs 4/5 at 0.7). This is the "about 70%" reading the client chose; the
  threshold is a parameter so it can be tuned without touching callers.
*/

export function passThreshold(total: number, passPct: number): number {
  return Math.max(1, Math.round(passPct * total));
}

export function scoreEventQuiz(
  questions: QuizQuestion[],
  answers: AttendeeAnswer[],
  passPct = 0.7,
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
  return { score, passed: score >= passThreshold(questions.length, passPct), correct };
}
