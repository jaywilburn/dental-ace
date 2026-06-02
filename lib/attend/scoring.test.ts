import { describe, it, expect } from "vitest";
import { scoreQuiz, PASS_THRESHOLD, type AttendeeAnswer } from "@/lib/attend/scoring";
import type { QuizQuestion } from "@/lib/forms/application/schemas";

const questions: QuizQuestion[] = [
  { type: "TF", question: "q1", correctAnswer: "True" },
  { type: "TF", question: "q2", correctAnswer: "False" },
  { type: "MC", question: "q3", options: ["a", "b", "c", "d"], correctIndex: 1 },
  { type: "MC", question: "q4", options: ["a", "b", "c", "d"], correctIndex: 2 },
  { type: "MC", question: "q5", options: ["a", "b", "c", "d"], correctIndex: 3 },
];

const all = (xs: AttendeeAnswer[]) => xs;

describe("scoreQuiz", () => {
  it("scores a perfect quiz as 5 and passed", () => {
    const answers = all([
      { type: "TF", answer: "True" },
      { type: "TF", answer: "False" },
      { type: "MC", answer: 1 },
      { type: "MC", answer: 2 },
      { type: "MC", answer: 3 },
    ]);
    expect(scoreQuiz(questions, answers)).toEqual({
      score: 5,
      passed: true,
      correct: [true, true, true, true, true],
    });
  });

  it("passes at exactly the threshold (3/5)", () => {
    const answers = all([
      { type: "TF", answer: "True" },
      { type: "TF", answer: "True" },
      { type: "MC", answer: 1 },
      { type: "MC", answer: 0 },
      { type: "MC", answer: 3 },
    ]);
    const result = scoreQuiz(questions, answers);
    expect(result.score).toBe(PASS_THRESHOLD);
    expect(result.passed).toBe(true);
  });

  it("fails below the threshold (2/5)", () => {
    const answers = all([
      { type: "TF", answer: "True" },
      { type: "TF", answer: "True" },
      { type: "MC", answer: 1 },
      { type: "MC", answer: 0 },
      { type: "MC", answer: 0 },
    ]);
    const result = scoreQuiz(questions, answers);
    expect(result.score).toBe(2);
    expect(result.passed).toBe(false);
  });

  it("counts a type mismatch as wrong", () => {
    const answers = all([
      { type: "MC", answer: 0 } as AttendeeAnswer,
      { type: "TF", answer: "False" },
      { type: "MC", answer: 1 },
      { type: "MC", answer: 2 },
      { type: "MC", answer: 3 },
    ]);
    const result = scoreQuiz(questions, answers);
    expect(result.correct[0]).toBe(false);
    expect(result.score).toBe(4);
  });

  it("throws when answer count does not match", () => {
    expect(() => scoreQuiz(questions, [])).toThrow(/count/i);
  });
});
