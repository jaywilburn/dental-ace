import { csvLine } from "@/lib/csv";
import {
  parseStoredSurveyResponses,
  type SurveyQuestion,
  type SurveyResponse,
} from "@/lib/events/survey-schemas";

/*
  Event survey responses as CSV cells. PURE (no DB): the company and admin
  export routes load the rows and the current survey, this shapes them, and
  lib/csv.ts quotes them. Unit-tested in survey-export.test.ts.

  One row per attendee (email, case-insensitive): the passed attempt if there
  is one, else the most recent attempt. Columns are the fixed attendee fields,
  then the CURRENT survey questions in order (header = prompt), then any
  question no longer in the survey that the reported rows answered, headed
  "<prompt as answered> (removed)". Answers are matched by question id, so a
  reworded question keeps its column and a re-typed question (new id) shows
  its old answers under a removed column. Multi-choice answers join with "; ".
*/

export type SurveyExportCertRow = {
  attendeeName: string;
  attendeeEmail: string;
  licenseStates: string[];
  passed: boolean;
  /** Credited hours on a pass; a failed row's value is ignored (0 credited). */
  ceHours: { toString(): string } | number | null;
  /** When the attempt was submitted (issued_certificates.issued_at). */
  issuedAt: Date;
  surveyResponses: unknown;
};

const FIXED_HEADER = [
  "Submitted at",
  "Name",
  "Email",
  "License states",
  "Result",
  "Hours credited",
] as const;

function formatValue(value: SurveyResponse["value"]): string {
  return Array.isArray(value) ? value.join("; ") : value;
}

function formatHours(row: SurveyExportCertRow): string {
  if (!row.passed || row.ceHours == null) return "0";
  return String(Number(row.ceHours));
}

/** The reported attempt per attendee, newest first. */
export function pickReportedRows<T extends SurveyExportCertRow>(rows: readonly T[]): T[] {
  const byEmail = new Map<string, T>();
  for (const row of rows) {
    const key = row.attendeeEmail.trim().toLowerCase();
    const current = byEmail.get(key);
    if (
      !current ||
      (row.passed && !current.passed) ||
      (row.passed === current.passed && row.issuedAt.getTime() > current.issuedAt.getTime())
    ) {
      byEmail.set(key, row);
    }
  }
  return [...byEmail.values()].sort((a, b) => b.issuedAt.getTime() - a.issuedAt.getTime());
}

/** Header + one row per attendee, as raw (unquoted) cell values. */
export function surveyExportRows(
  questions: readonly SurveyQuestion[],
  certRows: readonly SurveyExportCertRow[],
): string[][] {
  const reported = pickReportedRows(certRows).map((row) => {
    const answers = new Map<string, SurveyResponse>();
    for (const r of parseStoredSurveyResponses(row.surveyResponses)) answers.set(r.questionId, r);
    return { row, answers };
  });

  // Removed questions, in order of first appearance across the reported rows
  // (newest first), labelled with the newest prompt that row answered.
  const current = new Set(questions.map((q) => q.id));
  const removed = new Map<string, string>();
  for (const { answers } of reported) {
    for (const r of answers.values()) {
      if (!current.has(r.questionId) && !removed.has(r.questionId)) {
        removed.set(r.questionId, r.prompt);
      }
    }
  }
  const columnIds = [...questions.map((q) => q.id), ...removed.keys()];

  const header = [
    ...FIXED_HEADER,
    ...questions.map((q) => q.prompt),
    ...[...removed.values()].map((prompt) => `${prompt} (removed)`),
  ];

  return [
    header,
    ...reported.map(({ row, answers }) => [
      row.issuedAt.toISOString(),
      row.attendeeName,
      row.attendeeEmail,
      row.licenseStates.join("; "),
      row.passed ? "Passed" : "Not passed",
      formatHours(row),
      ...columnIds.map((id) => {
        const a = answers.get(id);
        return a ? formatValue(a.value) : "";
      }),
    ]),
  ];
}

/** A filesystem-safe download name, e.g. "aadb-annual-meeting-survey-responses.csv". */
export function surveyExportFilename(eventName: string): string {
  const slug = eventName
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return `${slug || "event"}-survey-responses.csv`;
}

/** The full CSV body (CRLF line endings, trailing CRLF), formula-guarded by lib/csv. */
export function surveyExportCsv(
  questions: readonly SurveyQuestion[],
  certRows: readonly SurveyExportCertRow[],
): string {
  return surveyExportRows(questions, certRows).map(csvLine).join("\r\n") + "\r\n";
}

/** Max attempt rows an export reads (mirrors the certificate log export). */
export const SURVEY_EXPORT_CAP = 10_000;
