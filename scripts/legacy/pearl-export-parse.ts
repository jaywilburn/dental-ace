/*
  Pure parser + normalizer for the client's Pearl quiz-platform export (two CSV
  sheets, one per course: DA255 "Practice Better with Practice Intelligence" and
  DA253 "Practice Better with Second Opinion"). No DB access — everything here
  is unit-tested in pearl-export-parse.test.ts; the DB-facing delta importer is
  scripts/import-pearl-legacy-quiz.ts.

  Normalization reuses scripts/legacy/normalize.ts helpers (states, delivery
  method, course type, completion-date sanity) so these rows land identically to
  the original migration, plus a small Pearl-specific occupation alias layer
  (this export says "General Dentist" / "Hygienist" where the original source
  said "Dentist" / "Dental Hygienist").

  Idempotency key: the export's "Network ID" turned out to be per-NETWORK, not
  per-response (whole offices share one — 26 DA253 rows share a single id), so
  it cannot be the dedup key on its own. (email, Submit Date) IS unique per
  sheet, so the key is PEARL-<sheet>-<submit ts compact>-<sha256(email)[0..8]>:
  deterministic from row content alone, stable across re-exports, and collision
  -checked by the importer.

  passed: the platform's own verdict is the "Ending" text ("Congratulations,
  you received a passing score…" vs "Unfortunately…"). Cross-checked against
  score >= PASS_THRESHOLD (3 of 5 — lib/attend/scoring.ts, PRD Flow C; the
  export agrees: every score-3 row got the Congratulations ending and the one
  score-2 row got Unfortunately). Rows where the two signals disagree are
  flagged for the report, with the Ending text winning.

  Relative imports (not "@/") so the same module loads under both tsx (the
  importer) and vitest (the tests).
*/
import { createHash } from "node:crypto";
import {
  formatToDelivery,
  normalizeLicenseStates,
  occupationToLicenseType,
  sanitizeCompletionDate,
  subjectToCourseType,
} from "./normalize";
import { PASS_THRESHOLD } from "../../lib/attend/scoring";

// ---------------------------------------------------------------------------
// Sheet identity — look up, never create. Verified against the live DB:
// Company legacy_id 1 = "Pearl, Inc.", AccreditedCourse legacy_id 1 = DA255,
// legacy_id 2 = DA253. The importer refuses to run if the DB course titles
// don't match these.
// ---------------------------------------------------------------------------

export type PearlSheet = "DA255" | "DA253";

export const PEARL_COMPANY_LEGACY_ID = 1;
export const PEARL_ORG_NAME = "Pearl, Inc.";

export const PEARL_SHEETS: Record<PearlSheet, { courseLegacyId: number; courseTitle: string }> = {
  DA255: { courseLegacyId: 1, courseTitle: "Practice Better with Practice Intelligence" },
  DA253: { courseLegacyId: 2, courseTitle: "Practice Better with Second Opinion" },
};

// ---------------------------------------------------------------------------
// Minimal RFC-4180 CSV reader. The export has quoted fields containing commas
// AND newlines (the "Ending" paragraph), which rules out line-based splitting.
// ---------------------------------------------------------------------------

export function parseCsv(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text; // strip BOM
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"'; // "" -> escaped quote
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      endField();
    } else if (ch === "\r") {
      if (src[i + 1] === "\n") i += 1;
      endRow();
    } else if (ch === "\n") {
      endRow();
    } else {
      field += ch;
    }
  }
  if (inQuotes) throw new Error("Unterminated quoted CSV field");
  if (field.length > 0 || row.length > 0) endRow();
  return rows.filter((r) => r.some((c) => c.trim().length > 0));
}

// ---------------------------------------------------------------------------
// Pearl-specific occupation aliases, then the shared normalize.ts mapping so
// the output vocabulary (DDS/DMD, RDH, DA, null) is identical to the original
// migration. "Dental Therapist" stays intentionally unmapped -> null.
// ---------------------------------------------------------------------------

const PEARL_OCCUPATION_ALIASES: Record<string, string> = {
  "general dentist": "Dentist",
  hygienist: "Dental Hygienist",
};

export function pearlOccupationToLicenseType(raw: string | null | undefined): string | null {
  const key = (raw ?? "").trim().toLowerCase();
  return occupationToLicenseType(PEARL_OCCUPATION_ALIASES[key] ?? raw);
}

// ---------------------------------------------------------------------------
// Completion-date guard. The attendee-entered course date is unreliable
// (1987-01-20, 2027-01-05, …): keep it only when it's a real calendar date,
// 2020 or later, and not after the submission itself; otherwise fall back to
// the Submit Date's date. Returns which source was used for the report.
// ---------------------------------------------------------------------------

export const PEARL_MIN_COURSE_YEAR = 2020;

export function guardedCompletionDate(
  courseDateRaw: string | null | undefined,
  submitDateIso: string, // YYYY-MM-DD from the Submit Date (UTC) column
): { date: string; source: "course-date" | "submit-date" } {
  // The column is an ISO datetime ("2026-07-09T00:00:00.000Z"); the date part
  // is what the attendee picked.
  const datePart = (courseDateRaw ?? "").trim().slice(0, 10);
  const sane = sanitizeCompletionDate(datePart); // real calendar date, sane window
  if (sane && Number(sane.slice(0, 4)) >= PEARL_MIN_COURSE_YEAR && sane <= submitDateIso) {
    return { date: sane, source: "course-date" };
  }
  return { date: submitDateIso, source: "submit-date" };
}

// ---------------------------------------------------------------------------
// passed: derived from the platform's "Ending" verdict text.
// ---------------------------------------------------------------------------

const PASSING_ENDING_PREFIX = "congratulations, you received a passing score";
const FAILING_ENDING_PREFIX = "unfortunately, you did not receive a passing";

export function derivePassed(ending: string | null | undefined): {
  passed: boolean;
  recognized: boolean;
} {
  const text = (ending ?? "").trim().toLowerCase();
  if (text.startsWith(PASSING_ENDING_PREFIX)) return { passed: true, recognized: true };
  if (text.startsWith(FAILING_ENDING_PREFIX)) return { passed: false, recognized: true };
  return { passed: false, recognized: false }; // unknown verdict -> fail-safe, reported
}

// ---------------------------------------------------------------------------
// Idempotency key. (email, Submit Date) is unique per sheet (verified across
// all 166 rows); Network ID is NOT (it's shared per office network).
// ---------------------------------------------------------------------------

export function pearlCertNumber(sheet: PearlSheet, submitUtcRaw: string, email: string): string {
  const compact = submitUtcRaw.replace(/\D/g, ""); // YYYYMMDDHHMMSS
  const hash = createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 8);
  return `PEARL-${sheet}-${compact}-${hash}`;
}

// ---------------------------------------------------------------------------
// Sheet parsing: header-driven (column positions are resolved by header text,
// so a re-export with reordered columns still parses).
// ---------------------------------------------------------------------------

const H = {
  name: "First and Last name",
  email: "Best email to send certificate",
  courseDate: "What day, month and year did you take the course?",
  org: "Please Select & Verify the Name of the Organization that Provided the Course",
  courseTitle: "Please Select & Verify the Name of the Course",
  subject: "Please select the Course Subject Matter",
  state: "State of Licensure",
  additionalState: "Additional State of Licensure",
  occupation: "Occupation",
  courseFormat: "What was the Course Format?",
  score: "Score",
  responseType: "Response Type",
  submitDate: "Submit Date (UTC)",
  networkId: "Network ID",
  ending: "Ending",
} as const;

const SUBMIT_TS = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

export type PearlRecord = {
  sheet: PearlSheet;
  rowNumber: number; // 1-based data-row ordinal within the sheet
  certNumber: string; // PEARL-<sheet>-… idempotency key (unique legacy_cert_number)
  networkId: string;
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
  score: number; // raw correct-count out of 5, same semantics as scoreQuiz()
  passed: boolean; // from the Ending verdict text
  endingRecognized: boolean;
  signalsDisagree: boolean; // Ending verdict vs score >= PASS_THRESHOLD
  completedAt: string; // ISO date, guarded
  completedAtSource: "course-date" | "submit-date";
  courseDateRaw: string;
  issuedAtIso: string; // ISO datetime from Submit Date (UTC)
};

export type PearlSkip = { rowNumber: number; name: string; email: string; reason: string };

export type PearlSheetParse = {
  sheet: PearlSheet;
  records: PearlRecord[];
  skipped: PearlSkip[];
  quizQuestions: string[]; // the sheet's 5 quiz-column headers, in order
};

// ---------------------------------------------------------------------------
// Classification against already-present DB rows (pure: the importer hands in
// the existing certificates; nothing here touches the DB).
// ---------------------------------------------------------------------------

export type Classification = "new" | "duplicate-of-existing" | "already-imported";

export type ClassifiedRecord = PearlRecord & { classification: Classification };

export type ExistingCert = {
  legacyCertNumber: string | null;
  attendeeEmail: string;
  completedAt: Date | null;
  issuedAt: Date;
  courseId: string;
};

function utcDateOf(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Split parsed records into new / duplicate-of-existing / already-imported.
 * `existing` are ALL issued_certificates on the two Pearl courses. Certs this
 * importer created (PEARL-… keys) are matched by key; everything else (the
 * original migration's LEGACY-… rows, plus any future native certs) joins a
 * dedup MULTISET on (email, course, effective completion date) — a multiset
 * because the original migration legitimately holds two certs for the same
 * (email, course, date) (shared office emails; same-day retakes), and each can
 * absorb exactly one export row. Passed export rows claim existing certs
 * before failed ones (the migrated rows are all passed=true), earliest
 * submission first, so a failed first attempt can never consume the existing
 * passed cert and let a passing retake import as a duplicate.
 */
export function classifyRecords(
  records: PearlRecord[],
  existing: ExistingCert[],
  courseIdOf: (sheet: PearlSheet) => string,
): ClassifiedRecord[] {
  const pearlKeys = new Set(
    existing.map((e) => e.legacyCertNumber).filter((n): n is string => !!n && n.startsWith("PEARL-")),
  );
  const dedup = new Map<string, number>();
  for (const e of existing) {
    if (e.legacyCertNumber && e.legacyCertNumber.startsWith("PEARL-")) continue; // keyed above
    const date = utcDateOf(e.completedAt ?? e.issuedAt);
    const key = `${e.attendeeEmail.trim().toLowerCase()}|${e.courseId}|${date}`;
    dedup.set(key, (dedup.get(key) ?? 0) + 1);
  }

  const out = new Map<PearlRecord, Classification>();
  const ordered = [...records].sort((a, b) => {
    if (a.passed !== b.passed) return a.passed ? -1 : 1;
    return a.issuedAtIso.localeCompare(b.issuedAtIso);
  });
  for (const r of ordered) {
    if (pearlKeys.has(r.certNumber)) {
      out.set(r, "already-imported");
      continue;
    }
    const key = `${r.attendeeEmail}|${courseIdOf(r.sheet)}|${r.completedAt}`;
    const remaining = dedup.get(key) ?? 0;
    if (remaining > 0) {
      dedup.set(key, remaining - 1);
      out.set(r, "duplicate-of-existing");
    } else {
      out.set(r, "new");
    }
  }
  return records.map((r) => ({ ...r, classification: out.get(r)! }));
}

export function parsePearlSheet(text: string, sheet: PearlSheet): PearlSheetParse {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error(`Sheet ${sheet}: no data rows`);
  const header = rows[0];

  const col = (name: string): number => {
    const i = header.indexOf(name);
    if (i === -1) throw new Error(`Sheet ${sheet}: missing column "${name}"`);
    return i;
  };
  const iName = col(H.name);
  const iEmail = col(H.email);
  const iCourseDate = col(H.courseDate);
  const iOrg = col(H.org);
  const iTitle = col(H.courseTitle);
  const iSubject = col(H.subject);
  const iState = col(H.state);
  const iOccupation = col(H.occupation);
  const iFormat = col(H.courseFormat);
  const iScore = col(H.score);
  const iResponseType = col(H.responseType);
  const iSubmit = col(H.submitDate);
  const iNetworkId = col(H.networkId);
  const iEnding = col(H.ending);

  // All "Additional State of Licensure" columns (the header repeats 4x).
  const additionalStateCols = header
    .map((h, i) => (h === H.additionalState ? i : -1))
    .filter((i) => i !== -1);

  // Quiz columns: everything between "What was the Course Format?" and the
  // first "counter_…" column (the platform's per-question layout).
  const firstCounter = header.findIndex((h) => h.startsWith("counter_"));
  if (firstCounter === -1 || firstCounter <= iFormat) {
    throw new Error(`Sheet ${sheet}: cannot locate quiz columns (no counter_ column after Course Format)`);
  }
  const quizCols = header.slice(iFormat + 1, firstCounter).map((_, k) => iFormat + 1 + k);
  const quizQuestions = quizCols.map((i) => header[i]);
  if (quizQuestions.length === 0) throw new Error(`Sheet ${sheet}: no quiz columns found`);

  const expected = PEARL_SHEETS[sheet];
  const records: PearlRecord[] = [];
  const skipped: PearlSkip[] = [];

  rows.slice(1).forEach((cells, idx) => {
    const rowNumber = idx + 1;
    const cell = (i: number): string => (cells[i] ?? "").trim();
    const name = cell(iName);
    const email = cell(iEmail).toLowerCase();
    const skip = (reason: string) => skipped.push({ rowNumber, name, email, reason });

    if (!name) return skip("blank attendee name");
    if (!email || !email.includes("@")) return skip(`unusable email ${JSON.stringify(cell(iEmail))}`);
    if (cell(iOrg) !== PEARL_ORG_NAME) return skip(`unexpected organization ${JSON.stringify(cell(iOrg))}`);
    if (cell(iTitle) !== expected.courseTitle) return skip(`unexpected course title ${JSON.stringify(cell(iTitle))}`);
    if (cell(iResponseType).toLowerCase() !== "completed") {
      return skip(`response type ${JSON.stringify(cell(iResponseType))} is not "completed"`);
    }

    const submitRaw = cell(iSubmit);
    if (!SUBMIT_TS.test(submitRaw)) return skip(`unparseable Submit Date ${JSON.stringify(submitRaw)}`);
    const issuedAtIso = `${submitRaw.replace(" ", "T")}.000Z`;

    const scoreRaw = cell(iScore);
    const score = Number(scoreRaw);
    if (!Number.isInteger(score) || score < 0 || score > quizQuestions.length) {
      return skip(`bad score ${JSON.stringify(scoreRaw)} (expected 0..${quizQuestions.length})`);
    }

    const { passed, recognized } = derivePassed(cell(iEnding));
    const courseDateRaw = cell(iCourseDate);
    const { date: completedAt, source: completedAtSource } = guardedCompletionDate(
      courseDateRaw,
      submitRaw.slice(0, 10),
    );

    const additionalStates = additionalStateCols.map((i) => cell(i)).filter((s) => s.length > 0);
    const { codes, dropped } = normalizeLicenseStates(JSON.stringify(additionalStates), cell(iState));

    const quizResponses: Record<string, string> = {};
    for (const i of quizCols) quizResponses[header[i]] = cell(i);

    records.push({
      sheet,
      rowNumber,
      certNumber: pearlCertNumber(sheet, submitRaw, email),
      networkId: cell(iNetworkId),
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
      issuedAtIso,
    });
  });

  return { sheet, records, skipped, quizQuestions };
}
