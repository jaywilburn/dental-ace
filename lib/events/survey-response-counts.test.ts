import { describe, it, expect, vi, beforeEach } from "vitest";

/*
  Survey response counts: distinct emails per event across certificate
  attempts with answers and No-CE survey-only submissions, so the count
  matches the one-row-per-email CSV export.
*/

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    issuedCertificate: { groupBy: vi.fn() },
    eventSurveyResponse: { groupBy: vi.fn() },
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import {
  HAS_SURVEY_RESPONSES,
  countDistinctResponders,
  surveyResponseCounts,
} from "@/lib/events/survey-response-counts";

const E1 = "2e5bab85-0000-4000-8000-000000000001";
const E2 = "2e5bab85-0000-4000-8000-000000000002";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("countDistinctResponders", () => {
  it("counts each lowercased email once per event and skips rows without an event", () => {
    const counts = countDistinctResponders([
      { eventId: E1, attendeeEmail: "jane@example.com" },
      { eventId: E1, attendeeEmail: "JANE@example.com " },
      { eventId: E1, attendeeEmail: "sam@example.com" },
      { eventId: E2, attendeeEmail: "jane@example.com" },
      { eventId: null, attendeeEmail: "course@example.com" },
    ]);
    expect(counts).toEqual(new Map([[E1, 2], [E2, 1]]));
  });
});

describe("surveyResponseCounts", () => {
  it("merges certificate answers and survey-only submissions per email", async () => {
    prismaMock.issuedCertificate.groupBy.mockResolvedValue([
      { eventId: E1, attendeeEmail: "jane@example.com" },
      { eventId: E1, attendeeEmail: "bob@example.com" },
    ]);
    prismaMock.eventSurveyResponse.groupBy.mockResolvedValue([
      // Answered on both paths: still one attendee.
      { eventId: E1, attendeeEmail: "jane@example.com" },
      { eventId: E1, attendeeEmail: "sam@example.com" },
      { eventId: E2, attendeeEmail: "sam@example.com" },
    ]);

    const counts = await surveyResponseCounts([E1, E2]);

    expect(counts.get(E1)).toBe(3);
    expect(counts.get(E2)).toBe(1);
    expect(prismaMock.issuedCertificate.groupBy.mock.calls[0][0].where).toEqual({
      eventId: { in: [E1, E2] },
      surveyResponses: HAS_SURVEY_RESPONSES,
    });
    expect(prismaMock.eventSurveyResponse.groupBy.mock.calls[0][0].where).toEqual({
      eventId: { in: [E1, E2] },
    });
  });

  it("skips the queries for no events", async () => {
    expect(await surveyResponseCounts([])).toEqual(new Map());
    expect(prismaMock.issuedCertificate.groupBy).not.toHaveBeenCalled();
    expect(prismaMock.eventSurveyResponse.groupBy).not.toHaveBeenCalled();
  });
});
