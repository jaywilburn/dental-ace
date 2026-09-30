import { describe, expect, it } from "vitest";
import { hasCertificateQuiz, quizEditorPath } from "./course-quiz-status";

const tf = (q: string) => ({ type: "TF", question: q, correctAnswer: "True" });
const mc = (q: string) => ({ type: "MC", question: q, options: ["A", "B", "C", "D"], correctIndex: 0 });
const fullQuiz = [tf("First question"), tf("Second question"), mc("Third question"), mc("Fourth question"), mc("Fifth question")];

describe("hasCertificateQuiz", () => {
  it("accepts a valid 5-question quiz", () => {
    expect(hasCertificateQuiz(fullQuiz)).toBe(true);
  });

  it("rejects the empty quiz legacy courses were migrated with", () => {
    expect(hasCertificateQuiz([])).toBe(false);
  });

  it("rejects a single-question event-session quiz", () => {
    expect(hasCertificateQuiz([mc("Only question")])).toBe(false);
  });

  it("rejects null and malformed values", () => {
    expect(hasCertificateQuiz(null)).toBe(false);
    expect(hasCertificateQuiz({})).toBe(false);
    expect(hasCertificateQuiz([...fullQuiz.slice(0, 4), { type: "MC", question: "Bad" }])).toBe(false);
  });
});

describe("quizEditorPath", () => {
  it("points at the admin quiz editor", () => {
    expect(quizEditorPath("abc")).toBe("/admin/courses/abc/quiz");
  });
});
