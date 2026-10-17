import { describe, it, expect } from "vitest";
import {
  pickReportedRows,
  surveyExportCsv,
  surveyExportFilename,
  surveyExportRows,
  type SurveyExportCertRow,
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

  it("only adds removed columns answered by the reported rows", () => {
    const rows = surveyExportRows(QUESTIONS, [
      row({ issuedAt: new Date("2026-10-01T10:00:00Z") }),
      row({
        passed: false,
        issuedAt: new Date("2026-10-01T12:00:00Z"),
        surveyResponses: [{ questionId: OLD, type: "SHORT_TEXT", prompt: "Gone?", value: "x" }],
      }),
    ]);
    expect(rows[0]).toHaveLength(8);
    expect(rows).toHaveLength(2);
  });

  it("tolerates malformed stored responses as no answers", () => {
    const [, data] = surveyExportRows(QUESTIONS, [row({ surveyResponses: { nope: true } })]);
    expect(data.slice(6)).toEqual(["", ""]);
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
