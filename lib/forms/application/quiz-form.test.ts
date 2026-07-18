import { describe, it, expect } from "vitest";
import { parseQuizForm, quizFromFormData } from "@/lib/forms/application/quiz-form";

/*
  The FormData -> quiz mapping + step4Schema validation shared by the wizard's
  saveStep4 and the admin post-approval quiz editor (lib/admin/course-quiz.ts).
  Field names mirror <QuizFields>: q{n}_question, q{n}_correct, q{n}_option_{0..3}.
*/

function validForm(): FormData {
  const fd = new FormData();
  fd.set("q1_question", "Flossing daily reduces gingivitis risk.");
  fd.set("q1_correct", "True");
  fd.set("q2_question", "Enamel regenerates on its own after erosion.");
  fd.set("q2_correct", "False");
  for (const n of [3, 4, 5]) {
    fd.set(`q${n}_question`, `Which option is correct for question ${n}?`);
    fd.set(`q${n}_option_0`, "Option A");
    fd.set(`q${n}_option_1`, "Option B");
    fd.set(`q${n}_option_2`, "Option C");
    fd.set(`q${n}_option_3`, "Option D");
    fd.set(`q${n}_correct`, "2");
  }
  return fd;
}

describe("quizFromFormData", () => {
  it("maps a complete form to the TF/TF/MC/MC/MC shape in field order", () => {
    expect(quizFromFormData(validForm())).toEqual([
      {
        type: "TF",
        question: "Flossing daily reduces gingivitis risk.",
        correctAnswer: "True",
      },
      {
        type: "TF",
        question: "Enamel regenerates on its own after erosion.",
        correctAnswer: "False",
      },
      {
        type: "MC",
        question: "Which option is correct for question 3?",
        options: ["Option A", "Option B", "Option C", "Option D"],
        correctIndex: 2,
      },
      {
        type: "MC",
        question: "Which option is correct for question 4?",
        options: ["Option A", "Option B", "Option C", "Option D"],
        correctIndex: 2,
      },
      {
        type: "MC",
        question: "Which option is correct for question 5?",
        options: ["Option A", "Option B", "Option C", "Option D"],
        correctIndex: 2,
      },
    ]);
  });

  it("always produces 5 entries, with missing fields mapped to empty values", () => {
    const quiz = quizFromFormData(new FormData());
    expect(quiz).toHaveLength(5);
    expect(quiz[0]).toEqual({ type: "TF", question: "", correctAnswer: "False" });
    expect(quiz[2]).toEqual({
      type: "MC",
      question: "",
      options: ["", "", "", ""],
      correctIndex: 0,
    });
  });

  it("treats any TF correct value other than exactly 'True' as 'False'", () => {
    const fd = validForm();
    fd.set("q1_correct", "true");
    const quiz = quizFromFormData(fd);
    expect(quiz[0]).toMatchObject({ correctAnswer: "False" });
  });
});

describe("parseQuizForm", () => {
  it("accepts a complete valid TF/TF/MC/MC/MC form", () => {
    const result = parseQuizForm(validForm());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.quiz).toHaveLength(5);
      expect(result.quiz[0].type).toBe("TF");
      expect(result.quiz[4].type).toBe("MC");
    }
  });

  it("rejects a form with only 4 questions filled in", () => {
    const fd = validForm();
    fd.delete("q5_question");
    const result = parseQuizForm(fd);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.length).toBeGreaterThan(0);
  });

  it("rejects a multiple-choice question with only 3 options", () => {
    const fd = validForm();
    fd.set("q3_option_3", "");
    expect(parseQuizForm(fd).ok).toBe(false);
  });

  it("rejects a multiple-choice correct answer that is not a number", () => {
    const fd = validForm();
    fd.set("q4_correct", "banana");
    expect(parseQuizForm(fd).ok).toBe(false);
  });

  it("rejects a multiple-choice correct index outside 0-3", () => {
    const fd = validForm();
    fd.set("q4_correct", "7");
    expect(parseQuizForm(fd).ok).toBe(false);
  });

  it("rejects an empty form", () => {
    expect(parseQuizForm(new FormData()).ok).toBe(false);
  });
});
