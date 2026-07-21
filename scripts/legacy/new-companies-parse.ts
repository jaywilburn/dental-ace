/*
  Pure parser + normalizer for the July 2026 "new companies" import batch (3 new
  CE-provider companies + 2 new People + Practice LLC courses; 6 courses, 83
  attendee/certificate rows). No DB access — unit-tested in
  new-companies-parse.test.ts; the DB-facing importer is
  scripts/import-new-companies.ts.

  Sources are the derived artifacts under scripts/data/legacy/new-companies/
  (produced by scripts/legacy/extract-new-companies.py from the client's
  Migration report.xlsx + quiz CSV):

    companies.json       3 NEW companies with assigned legacyIds (40-42)
    courses.json         6 courses with assigned legacyIds (107-112) + approvedAt
    quiz-data.csv        30 rows: 5 questions per course, Q1-Q2 TF, Q3-Q5 MC
    attendees-DA###.csv  normalized attendee rows (PII, gitignored)

  Reuses the Pearl-export helpers (parseCsv, guardedCompletionDate,
  derivePassed, occupation aliases) and scripts/legacy/normalize.ts so rows land
  with the same vocabulary as the v3 migration and the Pearl delta.

  Idempotency key: NEWCO-<DA###>-<submit ts compact>-<sha256(email)[0..8]> —
  deterministic from row content, same construction as the Pearl importer's
  PEARL-… keys (submit timestamp + email is unique per sheet; collision-checked
  by the importer).

  Relative imports (not "@/") so the same module loads under both tsx and vitest.
*/
import { createHash } from "node:crypto";
import {
  derivePassed,
  guardedCompletionDate,
  parseCsv,
  pearlOccupationToLicenseType,
} from "./pearl-export-parse";
import { formatToDelivery, normalizeLicenseStates, subjectToCourseType } from "./normalize";
import { PASS_THRESHOLD } from "../../lib/attend/scoring";
import { step4Schema, type QuizQuestion } from "../../lib/forms/application/schemas";

// ---------------------------------------------------------------------------
// Artifact shapes (committed JSON under scripts/data/legacy/new-companies/)
// ---------------------------------------------------------------------------

export type NewCompany = { legacyId: number; name: string };

export type NewCourse = {
  legacyId: number;
  companyLegacyId: number;
  legacyCourseId: string; // DA###
  courseIdNumber: string; // ACE-LEG-#####
  courseTitle: string;
  ceHours: number;
  subjectRaw: string;
  formatRaw: string;
  sheetOrg: string | null; // organization string in the attendee sheet, when one exists
  approvedAt: string; // ISO date (earliest cert date, or the import date for cert-less courses)
};

// ---------------------------------------------------------------------------
// Quiz CSV -> validated 5-question quiz per course
// ---------------------------------------------------------------------------

const QUIZ_COLUMNS = [
  "course_da_number",
  "question_number",
  "question_type",
  "question_text",
  "option_a",
  "option_b",
  "option_c",
  "option_d",
  "correct_option_letter",
  "correct_answer_text",
] as const;

/**
 * Parse the client quiz CSV into a per-DA QuizQuestion[5], validated through
 * step4Schema (the same guard the application wizard and the admin quiz editor
 * use), so the importer can never persist a quiz shape the app would reject.
 * Throws on any structural problem — quiz data must be perfect before load.
 */
export function parseQuizCsv(text: string): Map<string, QuizQuestion[]> {
  const rows = parseCsv(text);
  const header = rows[0];
  const col = new Map<string, number>();
  for (const name of QUIZ_COLUMNS) {
    const i = header.indexOf(name);
    if (i === -1) throw new Error(`quiz CSV: missing column "${name}"`);
    col.set(name, i);
  }
  const cell = (r: string[], name: (typeof QUIZ_COLUMNS)[number]): string => (r[col.get(name)!] ?? "").trim();

  const byDa = new Map<string, { n: number; q: QuizQuestion }[]>();
  for (const r of rows.slice(1)) {
    const da = cell(r, "course_da_number");
    const n = Number(cell(r, "question_number"));
    const type = cell(r, "question_type");
    const question = cell(r, "question_text");
    const letter = cell(r, "correct_option_letter").toUpperCase();
    const answerText = cell(r, "correct_answer_text");

    let q: QuizQuestion;
    if (type === "true_false") {
      const correctAnswer = letter === "A" ? "True" : "False";
      const expected = correctAnswer === "True" ? "TRUE" : "FALSE";
      if (answerText.toUpperCase() !== expected) {
        throw new Error(`quiz ${da} Q${n}: TF letter ${letter} disagrees with answer text ${JSON.stringify(answerText)}`);
      }
      q = { type: "TF", question, correctAnswer };
    } else if (type === "multiple_choice") {
      const options = (["option_a", "option_b", "option_c", "option_d"] as const).map((o) => cell(r, o));
      const correctIndex = letter.charCodeAt(0) - 65;
      if (options[correctIndex] !== answerText) {
        throw new Error(
          `quiz ${da} Q${n}: option ${letter} ${JSON.stringify(options[correctIndex])} disagrees with answer text ${JSON.stringify(answerText)}`,
        );
      }
      q = { type: "MC", question, options, correctIndex };
    } else {
      throw new Error(`quiz ${da} Q${n}: unknown question_type ${JSON.stringify(type)}`);
    }
    const list = byDa.get(da) ?? [];
    list.push({ n, q });
    byDa.set(da, list);
  }

  const out = new Map<string, QuizQuestion[]>();
  for (const [da, list] of byDa) {
    const quiz = list.sort((a, b) => a.n - b.n).map((e) => e.q);
    const parsed = step4Schema.safeParse({ quiz });
    if (!parsed.success) {
      throw new Error(`quiz ${da}: ${parsed.error.issues[0]?.message ?? "invalid quiz shape"}`);
    }
    out.set(da, parsed.data.quiz);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Attendee CSV (the derived, column-stable shape) -> normalized records
// ---------------------------------------------------------------------------

export function newCoCertNumber(da: string, submittedAtIso: string, email: string): string {
  const compact = submittedAtIso.replace(/\D/g, ""); // YYYYMMDDHHMMSS
  const hash = createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 8);
  return `NEWCO-${da}-${compact}-${hash}`;
}

export type NewCoRecord = {
  da: string;
  rowNumber: number;
  certNumber: string; // NEWCO-… idempotency key (unique legacy_cert_number)
  attendeeName: string;
  attendeeEmail: string; // trimmed + lowercased
  licenseType: string | null;
  occupationRaw: string;
  licenseStates: string[]; // 2-char codes
  droppedStates: string[];
  deliveryMethod: string | null;
  courseFormatRaw: string;
  courseType: string | null;
  quizResponses: Record<string, string>; // question text -> attendee answer
  score: number; // raw correct-count out of 5
  passed: boolean; // from the export's displayed-outcome text
  endingRecognized: boolean;
  signalsDisagree: boolean; // outcome text vs score >= PASS_THRESHOLD
  completedAt: string; // ISO date, guarded
  completedAtSource: "course-date" | "submit-date";
  courseDateRaw: string;
  issuedAtIso: string; // ISO datetime (Submitted At, taken at face value as UTC)
};

export type NewCoSkip = { rowNumber: number; name: string; email: string; reason: string };

export type NewCoSheetParse = { da: string; records: NewCoRecord[]; skipped: NewCoSkip[] };

const SUBMIT_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const QUIZ_SLOTS = [1, 2, 3, 4, 5] as const;

export function parseAttendeeSheet(text: string, course: NewCourse): NewCoSheetParse {
  const da = course.legacyCourseId;
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error(`${da}: no data rows`);
  const header = rows[0];
  const col = (name: string): number => {
    const i = header.indexOf(name);
    if (i === -1) throw new Error(`${da}: missing column "${name}"`);
    return i;
  };

  const iName = col("name");
  const iEmail = col("email");
  const iCourseDate = col("course_date");
  const iOrg = col("organization");
  const iTitle = col("course_title");
  const iSubject = col("subject");
  const iState = col("state");
  const iAddl = col("additional_states");
  const iOccupation = col("occupation");
  const iFormat = col("course_format");
  const iScore = col("score");
  const iEnding = col("ending");
  const iSubmitted = col("submitted_at");
  const quizCols = QUIZ_SLOTS.map((n) => ({ q: col(`q${n}_question`), a: col(`q${n}_answer`) }));

  const records: NewCoRecord[] = [];
  const skipped: NewCoSkip[] = [];

  rows.slice(1).forEach((cells, idx) => {
    const rowNumber = idx + 1;
    const cell = (i: number): string => (cells[i] ?? "").trim();
    const name = cell(iName);
    const email = cell(iEmail).toLowerCase();
    const skip = (reason: string) => skipped.push({ rowNumber, name, email, reason });

    if (!name) return skip("blank attendee name");
    if (!email || !email.includes("@")) return skip(`unusable email ${JSON.stringify(cell(iEmail))}`);
    if (course.sheetOrg && cell(iOrg) !== course.sheetOrg) {
      return skip(`unexpected organization ${JSON.stringify(cell(iOrg))}`);
    }
    if (cell(iTitle) !== course.courseTitle) return skip(`unexpected course title ${JSON.stringify(cell(iTitle))}`);

    const submittedAtIso = cell(iSubmitted);
    if (!SUBMIT_ISO.test(submittedAtIso)) return skip(`unparseable submitted_at ${JSON.stringify(submittedAtIso)}`);

    const score = Number(cell(iScore));
    if (!Number.isInteger(score) || score < 0 || score > 5) {
      return skip(`bad score ${JSON.stringify(cell(iScore))} (expected 0..5)`);
    }

    const { passed, recognized } = derivePassed(cell(iEnding));
    const courseDateRaw = cell(iCourseDate);
    const { date: completedAt, source: completedAtSource } = guardedCompletionDate(
      courseDateRaw,
      submittedAtIso.slice(0, 10),
    );

    const { codes, dropped } = normalizeLicenseStates(cell(iAddl), cell(iState));

    const quizResponses: Record<string, string> = {};
    for (const { q, a } of quizCols) quizResponses[cell(q)] = cell(a);

    records.push({
      da,
      rowNumber,
      certNumber: newCoCertNumber(da, submittedAtIso, email),
      attendeeName: name,
      attendeeEmail: email,
      licenseType: pearlOccupationToLicenseType(cell(iOccupation)),
      occupationRaw: cell(iOccupation),
      licenseStates: codes,
      droppedStates: dropped,
      deliveryMethod: formatToDelivery(cell(iFormat)),
      courseFormatRaw: cell(iFormat),
      courseType: subjectToCourseType(cell(iSubject)),
      quizResponses,
      score,
      passed,
      endingRecognized: recognized,
      signalsDisagree: passed !== (score >= PASS_THRESHOLD),
      completedAt,
      completedAtSource,
      courseDateRaw,
      issuedAtIso: submittedAtIso.replace("Z", ".000Z"),
    });
  });

  return { da, records, skipped };
}

/** Course-level fields derived from the artifact's raw intake strings. */
export function courseFields(course: NewCourse): {
  courseType: string | null;
  deliveryMethod: string | null;
} {
  return {
    courseType: subjectToCourseType(course.subjectRaw),
    deliveryMethod: formatToDelivery(course.formatRaw),
  };
}
