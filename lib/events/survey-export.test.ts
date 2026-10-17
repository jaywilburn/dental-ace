import { describe, it, expect } from "vitest";
import {
  hasSurveyResponses,
  mergeExportedAttendees,
  normalizeEmailKey,
  pickReportedRows,
  surveyExportCsv,
  surveyExportFilename,
  surveyExportRows,
  type SurveyExportCertRow,
  type SurveyExportSurveyOnlyRow,
} from "@/lib/events/survey-export";
import type { SurveyQuestion } from "@/lib/events/survey-schemas";

const Q1 = "a0a0a0a0-0000-4000-8000-000000000001";
const Q2 = "a0a0a0a0-0000-4000-8000-000000000002";
const OLD = "a0a0a0a0-0000-4000-8000-0000000000ff";

const QUESTIONS: SurveyQuestion[] = [
  { id: Q1, type: "SINGLE_CHOICE", prompt: "Satisfied?", required: true, options: ["Yes", "No"] },
  { id: Q2, type: "MULTI_CHOICE", prompt: "Roles?", required: false, options: ["Attendee", "Speaker"] },
];

function row(overrides: Partial<SurveyExportCertRow>): SurveyExportCertRow {
  return {
    attendeeName: "Jane Doe",
    attendeeEmail: "jane@example.com",
    licenseStates: ["TX"],
    passed: true,
    ceHours: 2.5,
    issuedAt: new Date("2026-10-01T15:00:00Z"),
    surveyResponses: [
      { questionId: Q1, type: "SINGLE_CHOICE", prompt: "Satisfied?", value: "Yes" },
    ],
    ...overrides,
  };
}

function surveyOnly(overrides: Partial<SurveyExportSurveyOnlyRow>): SurveyExportSurveyOnlyRow {
  return {
    attendeeName: "Sam Lee",
    attendeeEmail: "sam@example.com",
    createdAt: new Date("2026-10-01T16:00:00Z"),
    responses: [{ questionId: Q1, type: "SINGLE_CHOICE", prompt: "Satisfied?", value: "No" }],
    ...overrides,
  };
}

describe("normalizeEmailKey", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmailKey("  Jane@Example.COM ")).toBe("jane@example.com");
  });
});

describe("pickReportedRows", () => {
  it("keeps the passed attempt over a later failed one (email case-insensitive)", () => {
    const pass = row({ issuedAt: new Date("2026-10-01T10:00:00Z") });
    const laterFail = row({
      attendeeEmail: "JANE@example.com",
      passed: false,
      issuedAt: new Date("2026-10-01T12:00:00Z"),
    });
    expect(pickReportedRows([pass, laterFail])).toEqual([pass]);
    expect(pickReportedRows([laterFail, pass])).toEqual([pass]);
  });
  it("keeps the latest attempt when none passed, and sorts attendees newest first", () => {
    const fail1 = row({ passed: false, issuedAt: new Date("2026-10-01T10:00:00Z") });
    const fail2 = row({ passed: false, issuedAt: new Date("2026-10-01T11:00:00Z") });
    const other = row({ attendeeEmail: "bob@example.com", issuedAt: new Date("2026-10-02T09:00:00Z") });
    expect(pickReportedRows([fail2, other, fail1])).toEqual([other, fail2]);
  });
});

describe("mergeExportedAttendees", () => {
  it("pairs the reported attempt with the latest answered attempt (email case-insensitive)", () => {
    const pass = row({ issuedAt: new Date("2026-10-01T12:00:00Z"), surveyResponses: null });
    const older = row({ passed: false, issuedAt: new Date("2026-10-01T08:00:00Z") });
    const newer = row({
      attendeeEmail: "JANE@example.com",
      passed: false,
      issuedAt: new Date("2026-10-01T10:00:00Z"),
    });
    const [only, ...rest] = mergeExportedAttendees([older, pass, newer]);
    expect(rest).toEqual([]);
    expect(only).toMatchObject({ submittedAt: pass.issuedAt, result: "Passed", responses: newer.surveyResponses });
  });
  it("treats SQL NULL, JSON null and undefined as no answers", () => {
    expect(hasSurveyResponses({ surveyResponses: null })).toBe(false);
    expect(hasSurveyResponses({ surveyResponses: undefined })).toBe(false);
    expect(hasSurveyResponses({ surveyResponses: [] })).toBe(true);
    expect(mergeExportedAttendees([row({ surveyResponses: null })])).toEqual([]);
  });
  it("never lets a newer survey-only row replace a certificate attendee's answers (spoofing)", () => {
    // Anyone can submit the public No-CE form with a certificate attendee's
    // email. It must show as its own row, never as that attendee's answers.
    const pass = row({ issuedAt: new Date("2026-10-01T12:00:00Z") });
    const spoof = surveyOnly({
      attendeeName: "Not Jane",
      attendeeEmail: "JANE@example.com",
      createdAt: new Date("2026-10-02T09:00:00Z"),
      responses: [{ questionId: Q1, type: "SINGLE_CHOICE", prompt: "Satisfied?", value: "No" }],
    });
    expect(mergeExportedAttendees([pass], [spoof])).toEqual([
      {
        submittedAt: spoof.createdAt,
        attendeeName: "Not Jane",
        attendeeEmail: "JANE@example.com",
        licenseStates: "",
        result: "No CE requested",
        hours: "",
        responses: spoof.responses,
      },
      {
        submittedAt: pass.issuedAt,
        attendeeName: "Jane Doe",
        attendeeEmail: "jane@example.com",
        licenseStates: "TX",
        result: "Passed",
        hours: "2.5",
        responses: pass.surveyResponses,
      },
    ]);
  });
  it("never fills an unanswered certificate attendee from a survey-only row", () => {
    const pass = row({ surveyResponses: null });
    const answered = surveyOnly({ attendeeEmail: "jane@example.com" });
    const out = mergeExportedAttendees([pass], [answered]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ result: "No CE requested", responses: answered.responses });
  });
  it("reports survey-only attendees as No CE requested from their latest submission", () => {
    const first = surveyOnly({ createdAt: new Date("2026-10-01T09:00:00Z"), attendeeName: "Sam" });
    const second = surveyOnly({
      attendeeEmail: "SAM@example.com",
      createdAt: new Date("2026-10-01T11:00:00Z"),
      attendeeName: "Sam Lee",
      responses: [],
    });
    expect(mergeExportedAttendees([], [second, first])).toEqual([
      {
        submittedAt: second.createdAt,
        attendeeName: "Sam Lee",
        attendeeEmail: "SAM@example.com",
        licenseStates: "",
        result: "No CE requested",
        hours: "",
        responses: [],
      },
    ]);
  });
  it("dedupes survey-only rows among themselves even when the email also has an attempt", () => {
    const pass = row({});
    const first = surveyOnly({ attendeeEmail: "jane@example.com", createdAt: new Date("2026-10-01T09:00:00Z") });
    const latest = surveyOnly({ attendeeEmail: "Jane@Example.com", createdAt: new Date("2026-10-03T09:00:00Z") });
    const out = mergeExportedAttendees([pass], [first, latest]);
    expect(out.map((a) => a.result)).toEqual(["No CE requested", "Passed"]);
    expect(out[0].submittedAt).toBe(latest.createdAt);
  });
  it("sorts both kinds of attendee newest first", () => {
    const pass = row({ issuedAt: new Date("2026-10-01T12:00:00Z") });
    const newer = surveyOnly({ createdAt: new Date("2026-10-01T13:00:00Z") });
    const older = surveyOnly({ attendeeEmail: "old@example.com", createdAt: new Date("2026-09-01T13:00:00Z") });
    expect(mergeExportedAttendees([pass], [older, newer]).map((a) => a.attendeeEmail)).toEqual([
      "sam@example.com",
      "jane@example.com",
      "old@example.com",
    ]);
  });
});

describe("surveyExportRows", () => {
  it("writes the fixed columns then the current questions, joining multi-choice with '; '", () => {
    const rows = surveyExportRows(QUESTIONS, [
      row({
        licenseStates: ["TX", "OK"],
        surveyResponses: [
          { questionId: Q1, type: "SINGLE_CHOICE", prompt: "Satisfied?", value: "No" },
          { questionId: Q2, type: "MULTI_CHOICE", prompt: "Roles?", value: ["Attendee", "Speaker"] },
        ],
      }),
    ]);
    expect(rows).toEqual([
      ["Submitted at", "Name", "Email", "License states", "Result", "Hours credited", "Satisfied?", "Roles?"],
      [
        "2026-10-01T15:00:00.000Z",
        "Jane Doe",
        "jane@example.com",
        "TX; OK",
        "Passed",
        "2.5",
        "No",
        "Attendee; Speaker",
      ],
    ]);
  });

  it("reports a failed attempt as Not passed with 0 hours credited", () => {
    const [, data] = surveyExportRows(QUESTIONS, [row({ passed: false, ceHours: 3 })]);
    expect(data.slice(4, 6)).toEqual(["Not passed", "0"]);
  });

  it("leaves unanswered questions blank and reads stored Decimal-like hours", () => {
    const [, data] = surveyExportRows(QUESTIONS, [row({ ceHours: { toString: () => "1.50" } })]);
    expect(data[5]).toBe("1.5");
    expect(data.slice(6)).toEqual(["Yes", ""]);
  });

  it("adds removed questions after the current ones, labelled with their saved prompt", () => {
    const rows = surveyExportRows(QUESTIONS, [
      row({
        surveyResponses: [
          { questionId: Q1, type: "SINGLE_CHOICE", prompt: "Old wording?", value: "Yes" },
          { questionId: OLD, type: "LONG_TEXT", prompt: "Favorite part?", value: "The panel" },
        ],
      }),
      row({ attendeeEmail: "bob@example.com", issuedAt: new Date("2026-09-30T15:00:00Z") }),
    ]);
    // A reworded question keeps its current column (matched by id).
    expect(rows[0].slice(6)).toEqual(["Satisfied?", "Roles?", "Favorite part? (removed)"]);
    expect(rows[1].slice(6)).toEqual(["Yes", "", "The panel"]);
    expect(rows[2].slice(6)).toEqual(["Yes", "", ""]);
  });

  it("only adds removed columns answered by the exported answers", () => {
    const rows = surveyExportRows(QUESTIONS, [
      row({ issuedAt: new Date("2026-10-01T12:00:00Z") }),
      row({
        passed: false,
        issuedAt: new Date("2026-10-01T10:00:00Z"),
        surveyResponses: [{ questionId: OLD, type: "SHORT_TEXT", prompt: "Gone?", value: "x" }],
      }),
    ]);
    expect(rows[0]).toHaveLength(8);
    expect(rows).toHaveLength(2);
  });

  it("reports a pass with no answers as Passed, with answers from the latest answered attempt", () => {
    const rows = surveyExportRows(QUESTIONS, [
      row({
        passed: true,
        ceHours: 2,
        issuedAt: new Date("2026-10-01T12:00:00Z"),
        surveyResponses: null,
      }),
      row({
        passed: false,
        issuedAt: new Date("2026-10-01T10:00:00Z"),
        surveyResponses: [{ questionId: Q1, type: "SINGLE_CHOICE", prompt: "Satisfied?", value: "No" }],
      }),
      row({
        passed: false,
        issuedAt: new Date("2026-10-01T09:00:00Z"),
        surveyResponses: [{ questionId: Q1, type: "SINGLE_CHOICE", prompt: "Satisfied?", value: "Yes" }],
      }),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toEqual([
      "2026-10-01T12:00:00.000Z",
      "Jane Doe",
      "jane@example.com",
      "TX",
      "Passed",
      "2",
      "No",
      "",
    ]);
  });

  it("leaves out attendees with no answered attempt", () => {
    const rows = surveyExportRows(QUESTIONS, [
      row({ attendeeEmail: "bob@example.com", surveyResponses: null }),
      row({}),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[1][2]).toBe("jane@example.com");
  });

  it("tolerates malformed stored responses as no answers", () => {
    const [, data] = surveyExportRows(QUESTIONS, [row({ surveyResponses: { nope: true } })]);
    expect(data.slice(6)).toEqual(["", ""]);
  });

  it("writes a survey-only attendee as No CE requested with blank states and hours", () => {
    const rows = surveyExportRows(QUESTIONS, [row({})], [surveyOnly({})]);
    expect(rows).toHaveLength(3);
    expect(rows[1]).toEqual([
      "2026-10-01T16:00:00.000Z",
      "Sam Lee",
      "sam@example.com",
      "",
      "No CE requested",
      "",
      "No",
      "",
    ]);
    expect(rows[2].slice(4, 6)).toEqual(["Passed", "2.5"]);
  });

  it("returns just the header when there are no responses", () => {
    expect(surveyExportRows(QUESTIONS, [])).toHaveLength(1);
  });
});

describe("surveyExportFilename", () => {
  it("slugs the event name", () => {
    expect(surveyExportFilename("AADB 2026 Annual Meeting: Fall!")).toBe(
      "aadb-2026-annual-meeting-fall-survey-responses.csv",
    );
    expect(surveyExportFilename("Café Séance")).toBe("cafe-seance-survey-responses.csv");
  });
  it("falls back when nothing usable remains", () => {
    expect(surveyExportFilename("!!!")).toBe("event-survey-responses.csv");
  });
});

describe("surveyExportCsv", () => {
  it("quotes every cell, guards formulas and ends with CRLF", () => {
    const csv = surveyExportCsv(QUESTIONS, [row({ attendeeName: "=HYPERLINK(\"x\")" })]);
    const lines = csv.split("\r\n");
    expect(lines).toHaveLength(3);
    expect(lines[2]).toBe("");
    expect(lines[1]).toContain(`"'=HYPERLINK(""x"")"`);
    expect(lines[0].startsWith('"Submitted at","Name"')).toBe(true);
  });
});
