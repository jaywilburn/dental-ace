import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  courseFields,
  newCoCertNumber,
  parseAttendeeSheet,
  parseQuizCsv,
  type NewCourse,
} from "./new-companies-parse";

// ---------------------------------------------------------------------------
// parseQuizCsv
// ---------------------------------------------------------------------------

const QUIZ_HEADER =
  "course_da_number,course_title,ce_hours,subject_matter,course_format,organization,question_number,question_type,question_text,option_a,option_b,option_c,option_d,option_e,option_f,correct_option_letter,correct_answer_text";

function quizRow(
  da: string,
  n: number,
  type: string,
  question: string,
  options: string[],
  letter: string,
  answerText: string,
): string {
  const [a = "", b = "", c = "", d = ""] = options;
  return `${da},T,1,Business/Practice Management,LIVE/Online,Org,${n},${type},"${question}","${a}","${b}","${c}","${d}",,,${letter},"${answerText}"`;
}

function validQuizCsv(da = "DA900"): string {
  return [
    QUIZ_HEADER,
    quizRow(da, 1, "true_false", "First statement to judge?", ["TRUE", "FALSE"], "A", "TRUE"),
    quizRow(da, 2, "true_false", "Second statement to judge?", ["TRUE", "FALSE"], "B", "FALSE"),
    quizRow(da, 3, "multiple_choice", "Pick the right first option?", ["w1", "x1", "y1", "z1"], "C", "y1"),
    quizRow(da, 4, "multiple_choice", "Pick the right second option?", ["w2", "x2", "y2", "z2"], "A", "w2"),
    quizRow(da, 5, "multiple_choice", "Pick the right third option?", ["w3", "x3", "y3", "z3"], "D", "z3"),
  ].join("\n");
}

describe("parseQuizCsv", () => {
  it("maps TF + MC rows into the app's QuizQuestion shape", () => {
    const quizzes = parseQuizCsv(validQuizCsv());
    const quiz = quizzes.get("DA900")!;
    expect(quiz).toHaveLength(5);
    expect(quiz[0]).toEqual({ type: "TF", question: "First statement to judge?", correctAnswer: "True" });
    expect(quiz[1]).toEqual({ type: "TF", question: "Second statement to judge?", correctAnswer: "False" });
    expect(quiz[2]).toEqual({
      type: "MC",
      question: "Pick the right first option?",
      options: ["w1", "x1", "y1", "z1"],
      correctIndex: 2,
    });
    expect(quiz[4]).toMatchObject({ correctIndex: 3 });
  });

  it("rejects a TF row whose letter disagrees with the answer text", () => {
    const csv = [
      QUIZ_HEADER,
      quizRow("DA901", 1, "true_false", "First statement to judge?", ["TRUE", "FALSE"], "A", "FALSE"),
    ].join("\n");
    expect(() => parseQuizCsv(csv)).toThrow(/disagrees/);
  });

  it("rejects an MC row whose letter points at a different option than the answer text", () => {
    const csv = [
      QUIZ_HEADER,
      quizRow("DA902", 3, "multiple_choice", "Pick the right option now?", ["w", "x", "y", "z"], "B", "y"),
    ].join("\n");
    expect(() => parseQuizCsv(csv)).toThrow(/disagrees/);
  });

  it("rejects a course with fewer than 5 questions (step4Schema)", () => {
    const csv = [
      QUIZ_HEADER,
      quizRow("DA903", 1, "true_false", "Only statement present?", ["TRUE", "FALSE"], "A", "TRUE"),
    ].join("\n");
    expect(() => parseQuizCsv(csv)).toThrow();
  });

  it("rejects a quiz whose TF/MC order is wrong (step4Schema)", () => {
    const csv = [
      QUIZ_HEADER,
      quizRow("DA904", 1, "multiple_choice", "Pick the right first option?", ["w", "x", "y", "z"], "A", "w"),
      quizRow("DA904", 2, "true_false", "First statement to judge?", ["TRUE", "FALSE"], "A", "TRUE"),
      quizRow("DA904", 3, "multiple_choice", "Pick the right second option?", ["w", "x", "y", "z"], "A", "w"),
      quizRow("DA904", 4, "multiple_choice", "Pick the right third option?", ["w", "x", "y", "z"], "A", "w"),
      quizRow("DA904", 5, "true_false", "Second statement to judge?", ["TRUE", "FALSE"], "A", "TRUE"),
    ].join("\n");
    expect(() => parseQuizCsv(csv)).toThrow(/True\/False|Multiple Choice/);
  });

  it("parses the committed batch quiz CSV: 6 courses, 5 validated questions each", () => {
    const p = path.join(__dirname, "..", "data", "legacy", "new-companies", "quiz-data.csv");
    const quizzes = parseQuizCsv(fs.readFileSync(p, "utf8"));
    expect([...quizzes.keys()].sort()).toEqual(["DA252", "DA254", "DA256", "DA257", "DA258", "DA260"]);
    for (const quiz of quizzes.values()) {
      expect(quiz.map((q) => q.type)).toEqual(["TF", "TF", "MC", "MC", "MC"]);
    }
  });
});

// ---------------------------------------------------------------------------
// newCoCertNumber
// ---------------------------------------------------------------------------

describe("newCoCertNumber", () => {
  it("is deterministic and email-case-insensitive", () => {
    const a = newCoCertNumber("DA256", "2026-06-14T19:17:47Z", "Jane@Example.com");
    const b = newCoCertNumber("DA256", "2026-06-14T19:17:47Z", "jane@example.com ");
    expect(a).toBe(b);
    expect(a).toMatch(/^NEWCO-DA256-20260614191747-[0-9a-f]{8}$/);
  });
  it("differs across sheets, timestamps, and emails", () => {
    const base = newCoCertNumber("DA256", "2026-06-14T19:17:47Z", "a@x.com");
    expect(newCoCertNumber("DA258", "2026-06-14T19:17:47Z", "a@x.com")).not.toBe(base);
    expect(newCoCertNumber("DA256", "2026-06-14T19:17:48Z", "a@x.com")).not.toBe(base);
    expect(newCoCertNumber("DA256", "2026-06-14T19:17:47Z", "b@x.com")).not.toBe(base);
  });
});

// ---------------------------------------------------------------------------
// parseAttendeeSheet
// ---------------------------------------------------------------------------

const COURSE: NewCourse = {
  legacyId: 109,
  companyLegacyId: 40,
  legacyCourseId: "DA256",
  courseIdNumber: "ACE-LEG-00109",
  courseTitle: "Building a High-Performing Hygiene Department",
  ceHours: 10,
  subjectRaw: "Scientific (Clinical)",
  formatRaw: "LIVE/In Person (Presenter(s) must be available LIVE)",
  sheetOrg: "COLLABricon",
  approvedAt: "2026-06-12",
};

const ATTENDEE_HEADER =
  "name,email,course_date,organization,course_title,subject,state,additional_states,occupation,course_format," +
  "q1_question,q1_answer,q2_question,q2_answer,q3_question,q3_answer,q4_question,q4_answer,q5_question,q5_answer," +
  "score,ending,submitted_at,token";

type RowOverrides = Partial<Record<string, string>>;

function attendeeRow(overrides: RowOverrides = {}): string {
  const v: Record<string, string> = {
    name: "Jane Doe",
    email: "Jane@Example.com",
    course_date: "2026-06-12",
    organization: "COLLABricon",
    course_title: "Building a High-Performing Hygiene Department",
    subject: "Clinical/Medical Scientific",
    state: "California",
    additional_states: '["Michigan","Jamaica"]',
    occupation: "Hygienist",
    course_format: "LIVE-In Person",
    q1_question: "Question one text?",
    q1_answer: "True",
    q2_question: "Question two text?",
    q2_answer: "True",
    q3_question: "Question three text?",
    q3_answer: "Answer three",
    q4_question: "Question four text?",
    q4_answer: "All of the above",
    q5_question: "Question five text?",
    q5_answer: "Answer five",
    score: "5",
    ending:
      "Congratulations, you received a passing score and will receive your certificate via the email you provided above.",
    submitted_at: "2026-06-14T21:20:07Z",
    token: "tok123",
    ...overrides,
  };
  return ATTENDEE_HEADER.split(",")
    .map((h) => `"${(v[h] ?? "").replace(/"/g, '""')}"`)
    .join(",");
}

describe("parseAttendeeSheet", () => {
  it("normalizes a passing row end to end", () => {
    const { records, skipped } = parseAttendeeSheet([ATTENDEE_HEADER, attendeeRow()].join("\n"), COURSE);
    expect(skipped).toEqual([]);
    expect(records).toHaveLength(1);
    const r = records[0];
    expect(r.attendeeName).toBe("Jane Doe");
    expect(r.attendeeEmail).toBe("jane@example.com");
    expect(r.licenseType).toBe("RDH"); // Hygienist alias
    expect(r.licenseStates).toEqual(["CA", "MI"]);
    expect(r.droppedStates).toEqual(["Jamaica"]);
    expect(r.deliveryMethod).toBe("Live/In Person");
    expect(r.courseType).toBe("Scientific");
    expect(r.score).toBe(5);
    expect(r.passed).toBe(true);
    expect(r.signalsDisagree).toBe(false);
    expect(r.completedAt).toBe("2026-06-12");
    expect(r.completedAtSource).toBe("course-date");
    expect(r.issuedAtIso).toBe("2026-06-14T21:20:07.000Z");
    expect(r.certNumber).toMatch(/^NEWCO-DA256-20260614212007-[0-9a-f]{8}$/);
    expect(r.quizResponses).toEqual({
      "Question one text?": "True",
      "Question two text?": "True",
      "Question three text?": "Answer three",
      "Question four text?": "All of the above",
      "Question five text?": "Answer five",
    });
  });

  it("falls back to the submit date for implausible course dates", () => {
    const csv = [ATTENDEE_HEADER, attendeeRow({ course_date: "1984-06-30" })].join("\n");
    const r = parseAttendeeSheet(csv, COURSE).records[0];
    expect(r.completedAt).toBe("2026-06-14");
    expect(r.completedAtSource).toBe("submit-date");
  });

  it("records a failing row as failed with the score kept", () => {
    const csv = [
      ATTENDEE_HEADER,
      attendeeRow({
        score: "2",
        ending: "Unfortunately, you did not receive a passing score.\n\nPlease click the link to retake.",
      }),
    ].join("\n");
    const r = parseAttendeeSheet(csv, COURSE).records[0];
    expect(r.passed).toBe(false);
    expect(r.score).toBe(2);
    expect(r.signalsDisagree).toBe(false);
  });

  it("flags a row whose outcome text disagrees with the 3/5 threshold", () => {
    const csv = [
      ATTENDEE_HEADER,
      attendeeRow({ score: "2" }), // Congratulations ending but score below threshold
    ].join("\n");
    const r = parseAttendeeSheet(csv, COURSE).records[0];
    expect(r.passed).toBe(true); // outcome text wins, but…
    expect(r.signalsDisagree).toBe(true); // …the disagreement is surfaced
  });

  it("skips rows with an unusable email, wrong org, wrong title, or bad score", () => {
    const csv = [
      ATTENDEE_HEADER,
      attendeeRow({ email: "not-an-email" }),
      attendeeRow({ organization: "Someone Else LLC" }),
      attendeeRow({ course_title: "A Different Course" }),
      attendeeRow({ score: "7" }),
      attendeeRow({ submitted_at: "46192.8" }),
    ].join("\n");
    const { records, skipped } = parseAttendeeSheet(csv, COURSE);
    expect(records).toEqual([]);
    expect(skipped.map((s) => s.reason)).toEqual([
      expect.stringContaining("unusable email"),
      expect.stringContaining("unexpected organization"),
      expect.stringContaining("unexpected course title"),
      expect.stringContaining("bad score"),
      expect.stringContaining("unparseable submitted_at"),
    ]);
  });

  it("does not enforce an org match when the course has no sheetOrg", () => {
    const csv = [ATTENDEE_HEADER, attendeeRow({ organization: "Whatever" })].join("\n");
    const { records } = parseAttendeeSheet(csv, { ...COURSE, sheetOrg: null });
    expect(records).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// courseFields
// ---------------------------------------------------------------------------

describe("courseFields", () => {
  it("maps the intake subject + first-line format onto canonical values", () => {
    expect(courseFields(COURSE)).toEqual({ courseType: "Scientific", deliveryMethod: "Live/In Person" });
    expect(
      courseFields({ ...COURSE, subjectRaw: "Business/Practice Management", formatRaw: "onDemand Recorded Video (…)" }),
    ).toEqual({ courseType: "Business/Practice Management", deliveryMethod: "On Demand Video" });
  });
});
