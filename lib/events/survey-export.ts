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

  One row per attendee (email, case-insensitive) who answered the survey on
  at least one attempt. Submitted at / Name / Result / Hours come from the
  reported attempt (the passed one if there is one, else the most recent),
  which may itself carry no answers: a retake after a survey edit, or a pass
  that was never shown a survey, still reports as passed. The answers come
  from that attendee's most recent attempt that HAS answers. Callers pass
  every attempt for the event (lib/events/survey-export-response.ts), not just
  the answered ones, or a pass without answers would read "Not passed".
  Columns are the fixed attendee fields,
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

/** True when an attempt stored survey answers (SQL NULL and JSON null both read back as null). */
export function hasSurveyResponses(row: { surveyResponses: unknown }): boolean {
  return row.surveyResponses != null;
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

/**
  The reported attempt per attendee plus the attempt their answers come from,
  newest reported first. Attendees with no answered attempt are left out.
*/
export function pickExportedAttendees<T extends SurveyExportCertRow>(
  rows: readonly T[],
): { reported: T; answered: T }[] {
  const answeredByEmail = new Map<string, T>();
  for (const row of rows) {
    if (!hasSurveyResponses(row)) continue;
    const key = row.attendeeEmail.trim().toLowerCase();
    const current = answeredByEmail.get(key);
    if (!current || row.issuedAt.getTime() > current.issuedAt.getTime()) {
      answeredByEmail.set(key, row);
    }
  }
  const out: { reported: T; answered: T }[] = [];
  for (const reported of pickReportedRows(rows)) {
    const answered = answeredByEmail.get(reported.attendeeEmail.trim().toLowerCase());
    if (answered) out.push({ reported, answered });
  }
  return out;
}

/** Header + one row per attendee, as raw (unquoted) cell values. */
export function surveyExportRows(
  questions: readonly SurveyQuestion[],
  certRows: readonly SurveyExportCertRow[],
): string[][] {
  const reported = pickExportedAttendees(certRows).map(({ reported: row, answered }) => {
    const answers = new Map<string, SurveyResponse>();
    for (const r of parseStoredSurveyResponses(answered.surveyResponses)) answers.set(r.questionId, r);
    return { row, answers };
  });

  // Removed questions, in order of first appearance across the exported
  // answers (attendees newest first), labelled with the prompt as answered.
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
