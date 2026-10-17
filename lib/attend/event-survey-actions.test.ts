import { describe, it, expect, vi, beforeEach } from "vitest";

/*
  submitEventSurveyOnly: the No-CE path of a survey-first event link. Loading
  is stubbed; activeSurvey, validateSurveyResponses and the in-memory rate
  limiter stay REAL. Each case uses a fresh token because the limiter allows 5
  submissions per token.
*/

const { loadEventByToken, prismaMock } = vi.hoisted(() => ({
  loadEventByToken: vi.fn(),
  prismaMock: {
    eventSurveyResponse: { create: vi.fn() },
    issuedCertificate: { findMany: vi.fn(), create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/attend/event-quiz", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/attend/event-quiz")>()),
  loadEventByToken,
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => ({ get: () => "127.0.0.1" })),
}));

import { submitEventSurveyOnly } from "@/lib/attend/event-survey-actions";
import { SURVEY_STALE_MESSAGE, parseStoredSurvey, surveyVersion } from "@/lib/events/survey-schemas";

const Q_SINGLE = "d1d1d1d1-0000-4000-8000-000000000001";
const Q_LONG = "d1d1d1d1-0000-4000-8000-000000000003";
const SURVEY = [
  { id: Q_SINGLE, type: "SINGLE_CHOICE", prompt: "Satisfied?", required: true, options: ["Yes", "No"] },
  { id: Q_LONG, type: "LONG_TEXT", prompt: "Comments?", required: false },
];
const VERSION = surveyVersion(parseStoredSurvey(SURVEY));

let tokenSeq = 0;
const nextToken = () => `ffffffff-ffff-4fff-8fff-${String(++tokenSeq).padStart(12, "0")}`;

function input(overrides: Record<string, unknown> = {}) {
  return {
    token: nextToken(),
    attendeeName: "  Jane Doe ",
    attendeeEmail: " Jane@Example.com ",
    survey: { [Q_SINGLE]: "Yes", [Q_LONG]: " Loved it " },
    surveyVersion: VERSION,
    ...overrides,
  };
}

function mockEvent(overrides: Record<string, unknown> = {}) {
  loadEventByToken.mockResolvedValue({
    id: "event-1",
    companyId: "company-1",
    name: "AADB Annual Meeting",
    status: "APPROVED",
    expiresAt: new Date(Date.now() + 864e5),
    survey: SURVEY,
    // A zero cert balance does not block the survey: nothing is issued.
    company: { certBalance: 0, surveyEnabled: true },
    ...overrides,
  });
}

describe("submitEventSurveyOnly", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.eventSurveyResponse.create.mockResolvedValue({ id: "resp-1" });
    mockEvent();
  });

  it("records the answers with a trimmed name and lowercased email, and never touches certificates", async () => {
    const result = await submitEventSurveyOnly(input());

    expect(result).toEqual({ status: "recorded" });
    expect(prismaMock.eventSurveyResponse.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.eventSurveyResponse.create.mock.calls[0][0].data).toEqual({
      eventId: "event-1",
      attendeeName: "Jane Doe",
      attendeeEmail: "jane@example.com",
      responses: [
        { questionId: Q_SINGLE, type: "SINGLE_CHOICE", prompt: "Satisfied?", value: "Yes" },
        { questionId: Q_LONG, type: "LONG_TEXT", prompt: "Comments?", value: "Loved it" },
      ],
    });
    expect(prismaMock.issuedCertificate.findMany).not.toHaveBeenCalled();
    expect(prismaMock.issuedCertificate.create).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("records an all-optional survey left blank as an empty answer list", async () => {
    mockEvent({ survey: [SURVEY[1]] });
    const version = surveyVersion(parseStoredSurvey([SURVEY[1]]));
    const result = await submitEventSurveyOnly(input({ survey: {}, surveyVersion: version }));
    expect(result).toEqual({ status: "recorded" });
    expect(prismaMock.eventSurveyResponse.create.mock.calls[0][0].data.responses).toEqual([]);
  });

  it("asks for a reload when the survey changed after the page loaded", async () => {
    const result = await submitEventSurveyOnly(input({ surveyVersion: "0badc0de" }));
    expect(result).toEqual({ status: "invalid", fieldErrors: { survey: [SURVEY_STALE_MESSAGE] } });
    expect(prismaMock.eventSurveyResponse.create).not.toHaveBeenCalled();
  });

  it("returns a missing required answer keyed by question", async () => {
    const result = await submitEventSurveyOnly(input({ survey: { [Q_LONG]: "Great" } }));
    expect(result.status).toBe("invalid");
    if (result.status !== "invalid") return;
    expect(Object.keys(result.fieldErrors)).toEqual([`survey.${Q_SINGLE}`]);
    expect(prismaMock.eventSurveyResponse.create).not.toHaveBeenCalled();
  });

  it("returns name and email errors without loading the event", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const result = await submitEventSurveyOnly(input({ attendeeName: " ", attendeeEmail: "nope" }));
      expect(result.status).toBe("invalid");
      if (result.status !== "invalid") return;
      expect(Object.keys(result.fieldErrors).sort()).toEqual(["attendeeEmail", "attendeeName"]);
      expect(loadEventByToken).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it("rate limits after 5 submissions on one link", async () => {
    const token = nextToken();
    for (let i = 0; i < 5; i++) {
      expect(await submitEventSurveyOnly(input({ token }))).toEqual({ status: "recorded" });
    }
    const result = await submitEventSurveyOnly(input({ token }));
    expect(result.status).toBe("rate_limited");
    expect(prismaMock.eventSurveyResponse.create).toHaveBeenCalledTimes(5);
  });

  it.each([
    ["an unknown link", null],
    ["an event that is not approved", { status: "PENDING" }],
    ["an expired event", { expiresAt: new Date(Date.now() - 1000) }],
  ])("rejects %s as inactive", async (_label, override) => {
    if (override === null) loadEventByToken.mockResolvedValue(null);
    else mockEvent(override);
    const result = await submitEventSurveyOnly(input());
    expect(result).toEqual({ status: "event_inactive" });
    expect(prismaMock.eventSurveyResponse.create).not.toHaveBeenCalled();
  });

  it.each([
    ["the company has surveys switched off", { company: { certBalance: 5, surveyEnabled: false } }],
    ["the event has no survey questions", { survey: [] }],
  ])("asks for a reload when %s", async (_label, override) => {
    mockEvent(override);
    const result = await submitEventSurveyOnly(input());
    expect(result).toEqual({ status: "invalid", fieldErrors: { survey: [SURVEY_STALE_MESSAGE] } });
    expect(prismaMock.eventSurveyResponse.create).not.toHaveBeenCalled();
  });
});
