import { describe, it, expect } from "vitest";
import { passThreshold, scoreEventQuiz, creditSessions } from "@/lib/attend/event-scoring";
import type { QuizQuestion } from "@/lib/forms/application/schemas";
import type { AttendeeAnswer } from "@/lib/attend/scoring";

const mc = (correctIndex: number): QuizQuestion => ({
  type: "MC",
  question: "q",
  options: ["a", "b", "c", "d"],
  correctIndex,
});
const tf = (correctAnswer: "True" | "False"): QuizQuestion => ({
  type: "TF",
  question: "q",
  correctAnswer,
});

describe("passThreshold (round, floor 1)", () => {
  it("never drops below 1", () => {
    expect(passThreshold(1, 0.7)).toBe(1);
  });
  it("rounds about 70%", () => {
    expect(passThreshold(2, 0.7)).toBe(1); // round(1.4)
    expect(passThreshold(3, 0.7)).toBe(2); // round(2.1)
    expect(passThreshold(5, 0.7)).toBe(4); // round(3.5)
  });
  it("honors the 60% (3-of-5) event-quiz threshold", () => {
    expect(passThreshold(5, 0.6)).toBe(3); // round(3.0)
  });
});

describe("scoreEventQuiz", () => {
  it("passes a single correct answer (1-question selective)", () => {
    const r = scoreEventQuiz([mc(2)], [{ type: "MC", answer: 2 }], 0.7);
    expect(r).toEqual({ score: 1, passed: true, correct: [true] });
  });
  it("fails a single wrong answer", () => {
    const r = scoreEventQuiz([mc(2)], [{ type: "MC", answer: 0 }], 0.7);
    expect(r.passed).toBe(false);
  });
  it("needs 2 of 3 at 0.7", () => {
    const questions = [mc(0), mc(1), mc(2)];
    const twoRight: AttendeeAnswer[] = [
      { type: "MC", answer: 0 },
      { type: "MC", answer: 1 },
      { type: "MC", answer: 3 },
    ];
    expect(scoreEventQuiz(questions, twoRight, 0.7).passed).toBe(true);
    const oneRight: AttendeeAnswer[] = [
      { type: "MC", answer: 0 },
      { type: "MC", answer: 3 },
      { type: "MC", answer: 3 },
    ];
    expect(scoreEventQuiz(questions, oneRight, 0.7).passed).toBe(false);
  });
  it("scores a mixed TF/MC 5-question event quiz at 0.6", () => {
    const questions = [tf("True"), tf("False"), mc(0), mc(1), mc(2)];
    const answers: AttendeeAnswer[] = [
      { type: "TF", answer: "True" },
      { type: "TF", answer: "False" },
      { type: "MC", answer: 0 },
      { type: "MC", answer: 3 },
      { type: "MC", answer: 3 },
    ];
    expect(scoreEventQuiz(questions, answers, 0.6).passed).toBe(true); // 3/5
  });
  it("throws on a length mismatch", () => {
    expect(() => scoreEventQuiz([mc(0)], [], 0.7)).toThrow();
  });
});

describe("creditSessions (SELECTIVE_INLINE per-session credit)", () => {
  it("credits only the correctly answered sessions (partial sum)", () => {
    const r = creditSessions([true, false, true], [1.5, 2, 0.5]);
    expect(r).toEqual({ creditedIndices: [0, 2], creditedHours: 2, passed: true });
  });
  it("fails with zero hours when every answer is wrong", () => {
    const r = creditSessions([false, false], [1, 2.5]);
    expect(r).toEqual({ creditedIndices: [], creditedHours: 0, passed: false });
  });
  it("credits the full sum when every answer is correct", () => {
    const r = creditSessions([true, true, true], [1, 2, 3]);
    expect(r).toEqual({ creditedIndices: [0, 1, 2], creditedHours: 6, passed: true });
  });
  it("passes a single attended session answered correctly", () => {
    expect(creditSessions([true], [0.5])).toEqual({
      creditedIndices: [0],
      creditedHours: 0.5,
      passed: true,
    });
  });
  it("throws on a length mismatch", () => {
    expect(() => creditSessions([true, false], [1])).toThrow();
  });
});
