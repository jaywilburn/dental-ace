import { describe, it, expect, vi, beforeEach } from "vitest";

/*
  The shared survey CSV response: the answered-email set uses the same
  "has answers" filter as the response counts, and every attempt of those
  attendees is loaded so a pass without answers still reports as passed.
*/

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    issuedCertificate: { findMany: vi.fn() },
    eventSurveyResponse: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { surveyExportResponse } from "@/lib/events/survey-export-response";
import { HAS_SURVEY_RESPONSES } from "@/lib/events/survey-response-counts";

const EVENT = { id: "2e5bab85-0000-4000-8000-000000000001", name: "AADB Annual Meeting", survey: [] };
const Q1 = "a0a0a0a0-0000-4000-8000-000000000001";

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.eventSurveyResponse.findMany.mockResolvedValue([]);
});

describe("surveyExportResponse", () => {
  it("loads every attempt of answering attendees and reports an unanswered pass as Passed", async () => {
    prismaMock.issuedCertificate.findMany
      .mockResolvedValueOnce([{ attendeeEmail: "jane@example.com" }])
      .mockResolvedValueOnce([
        {
          attendeeName: "Jane Doe",
          attendeeEmail: "jane@example.com",
          licenseStates: ["TX"],
          passed: true,
          ceHours: 2,
          issuedAt: new Date("2026-10-01T12:00:00Z"),
          surveyResponses: null,
        },
        {
          attendeeName: "Jane Doe",
          attendeeEmail: "jane@example.com",
          licenseStates: ["TX"],
          passed: false,
          ceHours: 2,
          issuedAt: new Date("2026-10-01T10:00:00Z"),
          surveyResponses: [{ questionId: Q1, type: "SHORT_TEXT", prompt: "Thoughts?", value: "Great" }],
        },
      ]);

    const res = await surveyExportResponse(EVENT);

    const [answeredQuery, rowsQuery] = prismaMock.issuedCertificate.findMany.mock.calls.map((c) => c[0]);
    expect(answeredQuery.where).toEqual({ eventId: EVENT.id, surveyResponses: HAS_SURVEY_RESPONSES });
    expect(rowsQuery.where).toEqual({
      eventId: EVENT.id,
      attendeeEmail: { in: ["jane@example.com"], mode: "insensitive" },
    });
    expect(rowsQuery.where).not.toHaveProperty("surveyResponses");

    expect(res.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("Content-Disposition")).toBe(
      'attachment; filename="aadb-annual-meeting-survey-responses.csv"',
    );
    const lines = (await res.text()).split("\r\n");
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain('"Passed","2"');
    expect(lines[1]).toContain('"Great"');
  });

  it("merges No-CE survey-only submissions, loading attempts for their emails too", async () => {
    prismaMock.issuedCertificate.findMany
      .mockResolvedValueOnce([{ attendeeEmail: "jane@example.com" }])
      .mockResolvedValueOnce([
        {
          attendeeName: "Jane Doe",
          attendeeEmail: "jane@example.com",
          licenseStates: ["TX"],
          passed: true,
          ceHours: 2,
          issuedAt: new Date("2026-10-01T12:00:00Z"),
          surveyResponses: [{ questionId: Q1, type: "SHORT_TEXT", prompt: "Thoughts?", value: "Great" }],
        },
      ]);
    prismaMock.eventSurveyResponse.findMany.mockResolvedValueOnce([
      {
        attendeeName: "Sam Lee",
        attendeeEmail: "sam@example.com",
        createdAt: new Date("2026-10-02T09:00:00Z"),
        responses: [{ questionId: Q1, type: "SHORT_TEXT", prompt: "Thoughts?", value: "Useful" }],
      },
      {
        attendeeName: "Jane Doe",
        attendeeEmail: "jane@example.com",
        createdAt: new Date("2026-09-30T09:00:00Z"),
        responses: [],
      },
    ]);

    const res = await surveyExportResponse(EVENT);

    const surveyOnlyQuery = prismaMock.eventSurveyResponse.findMany.mock.calls[0][0];
    expect(surveyOnlyQuery.where).toEqual({ eventId: EVENT.id });
    expect(surveyOnlyQuery.take).toBe(10_000);
    const rowsQuery = prismaMock.issuedCertificate.findMany.mock.calls[1][0];
    expect(rowsQuery.where.attendeeEmail.in).toEqual(["jane@example.com", "sam@example.com"]);

    const lines = (await res.text()).split("\r\n");
    expect(lines).toHaveLength(4);
    expect(lines[1]).toContain('"sam@example.com","","No CE requested","","Useful"');
    // Jane's attempt is newer than her survey-only row, so its answers stand.
    expect(lines[2]).toContain('"Passed","2","Great"');
  });

  it("skips the attempts query when nobody answered", async () => {
    prismaMock.issuedCertificate.findMany.mockResolvedValueOnce([]);
    const res = await surveyExportResponse(EVENT);
    expect(prismaMock.issuedCertificate.findMany).toHaveBeenCalledTimes(1);
    expect((await res.text()).split("\r\n")).toHaveLength(2);
  });
});
