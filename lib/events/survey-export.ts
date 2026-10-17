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

  Answers come from two sources: certificate attempts
  (issued_certificates.survey_responses) and No-CE survey-only submissions
  (event_survey_responses, from attendees who said they do not need CE). The
  two are NEVER merged: a No-CE submission is public and unverified (anyone
  can type any email), so it must never replace or fill a certificate
  attendee's answers.

  - Certificate attendees: one row per email (case-insensitive) with an
    answered attempt. It reports that attendee's reported attempt's Submitted
    at / Name / License states / Result / Hours: the passed one if there is
    one, else the most recent. It may itself carry no answers (a retake after
    a survey edit, or a pass that was never shown a survey) and still reports
    as passed, with the answers of the attendee's most recent answered
    ATTEMPT. Callers pass every attempt of each exported attendee
    (lib/events/survey-export-response.ts), not just the answered ones, or a
    pass without answers would read "Not passed".
  - Survey-only respondents: separate rows, one per email WITHIN the
    survey-only submissions (latest wins), even when the same email also has
    a certificate row. Result "No CE requested", License states and Hours
    credited blank.

  Columns are the fixed attendee fields, then the CURRENT survey questions in
  order (header = prompt), then any question no longer in the survey that the
  exported answers include, headed "<prompt as answered> (removed)". Answers
  are matched by question id, so a reworded question keeps its column and a
  re-typed question (new id) shows its old answers under a removed column.
  Multi-choice answers join with "; ".
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

/** A No-CE survey-only submission (event_survey_responses). Always counts as answered. */
export type SurveyExportSurveyOnlyRow = {
  attendeeName: string;
  attendeeEmail: string;
  createdAt: Date;
  responses: unknown;
};

/** One exported attendee: the reported fields plus the answers to show. */
export type SurveyExportAttendee = {
  submittedAt: Date;
  attendeeName: string;
  attendeeEmail: string;
  licenseStates: string;
  result: string;
  hours: string;
  responses: unknown;
};

/** The one email key used to dedupe attendees, shared by the export and the response counts. */
export function normalizeEmailKey(email: string): string {
  return email.trim().toLowerCase();
}

/** The reported attempt per attendee, newest first. */
export function pickReportedRows<T extends SurveyExportCertRow>(rows: readonly T[]): T[] {
  const byEmail = new Map<string, T>();
  for (const row of rows) {
    const key = normalizeEmailKey(row.attendeeEmail);
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
  Every exported row, newest submission first: certificate attendees
  (reported attempt, answers from their latest answered attempt; attendees
  with no answered attempt are left out) and, separately, survey-only
  respondents (latest submission per email). The sources never share answers.
*/
export function mergeExportedAttendees(
  certRows: readonly SurveyExportCertRow[],
  surveyOnlyRows: readonly SurveyExportSurveyOnlyRow[] = [],
): SurveyExportAttendee[] {
  // Certificate answers come from certificate attempts only.
  const latestAnswers = new Map<string, { at: number; responses: unknown }>();
  for (const row of certRows) {
    if (!hasSurveyResponses(row)) continue;
    const key = normalizeEmailKey(row.attendeeEmail);
    const current = latestAnswers.get(key);
    if (!current || row.issuedAt.getTime() > current.at) {
      latestAnswers.set(key, { at: row.issuedAt.getTime(), responses: row.surveyResponses });
    }
  }

  const out: SurveyExportAttendee[] = [];
  for (const reported of pickReportedRows(certRows)) {
    const answers = latestAnswers.get(normalizeEmailKey(reported.attendeeEmail));
    if (!answers) continue;
    out.push({
      submittedAt: reported.issuedAt,
      attendeeName: reported.attendeeName,
      attendeeEmail: reported.attendeeEmail,
      licenseStates: reported.licenseStates.join("; "),
      result: reported.passed ? "Passed" : "Not passed",
      hours: formatHours(reported),
      responses: answers.responses,
    });
  }

  // Survey-only respondents: the latest submission per email, deduped among
  // survey-only rows only (a certificate row for the same email is separate).
  const surveyOnlyLatest = new Map<string, SurveyExportSurveyOnlyRow>();
  for (const row of surveyOnlyRows) {
    const key = normalizeEmailKey(row.attendeeEmail);
    const current = surveyOnlyLatest.get(key);
    if (!current || row.createdAt.getTime() > current.createdAt.getTime()) surveyOnlyLatest.set(key, row);
  }
  for (const row of surveyOnlyLatest.values()) {
    out.push({
      submittedAt: row.createdAt,
      attendeeName: row.attendeeName,
      attendeeEmail: row.attendeeEmail,
      licenseStates: "",
      result: "No CE requested",
      hours: "",
      responses: row.responses,
    });
  }

  return out.sort((a, b) => b.submittedAt.getTime() - a.submittedAt.getTime());
}

/** Header + one row per attendee, as raw (unquoted) cell values. */
export function surveyExportRows(
  questions: readonly SurveyQuestion[],
  certRows: readonly SurveyExportCertRow[],
  surveyOnlyRows: readonly SurveyExportSurveyOnlyRow[] = [],
): string[][] {
  const reported = mergeExportedAttendees(certRows, surveyOnlyRows).map((row) => {
    const answers = new Map<string, SurveyResponse>();
    for (const r of parseStoredSurveyResponses(row.responses)) answers.set(r.questionId, r);
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
      row.submittedAt.toISOString(),
      row.attendeeName,
      row.attendeeEmail,
      row.licenseStates,
      row.result,
      row.hours,
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
  surveyOnlyRows: readonly SurveyExportSurveyOnlyRow[] = [],
): string {
  return surveyExportRows(questions, certRows, surveyOnlyRows).map(csvLine).join("\r\n") + "\r\n";
}

/** Max rows an export reads from each source (mirrors the certificate log export). */
export const SURVEY_EXPORT_CAP = 10_000;
