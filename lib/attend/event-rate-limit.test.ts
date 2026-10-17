import { describe, it, expect, vi } from "vitest";

/*
  The event attendee link's two throttles: the No-CE survey submit has its
  own bucket, so it can never use up the certificate budget (or vice versa).
  The in-memory limiter stays REAL.
*/

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => ({ get: () => "203.0.113.7, 10.0.0.1" })),
}));

import { eventAttendRateLimit, eventAttendRateLimitKey } from "@/lib/attend/event-rate-limit";

const TOKEN = "eeeeeeee-eeee-4eee-8eee-000000000001";

describe("eventAttendRateLimitKey", () => {
  it("keeps the certificate key unchanged and suffixes the survey key", () => {
    expect(eventAttendRateLimitKey("1.2.3.4", TOKEN, "certificate")).toBe(`attend-event:1.2.3.4:${TOKEN}`);
    expect(eventAttendRateLimitKey("1.2.3.4", TOKEN, "survey")).toBe(`attend-event:1.2.3.4:${TOKEN}:survey`);
  });
});

describe("eventAttendRateLimit", () => {
  it("gives the survey submit its own 5-per-window budget", async () => {
    for (let i = 0; i < 5; i++) expect((await eventAttendRateLimit(TOKEN, "survey")).ok).toBe(true);
    expect((await eventAttendRateLimit(TOKEN, "survey")).ok).toBe(false);
    // The certificate budget is untouched by the survey traffic above.
    for (let i = 0; i < 5; i++) expect((await eventAttendRateLimit(TOKEN)).ok).toBe(true);
    expect((await eventAttendRateLimit(TOKEN)).ok).toBe(false);
  });
});
