import { describe, it, expect } from "vitest";
import { eventAttendeeSubmissionSchema } from "@/lib/attend/event-schemas";
import { flattenFieldErrors } from "@/lib/attend/schemas";

const DAY = 864e5;
// yyyy-mm-dd for the UTC calendar date msFromNow from now.
const isoUTC = (msFromNow: number) => new Date(Date.now() + msFromNow).toISOString().slice(0, 10);
// yyyy-mm-dd for the same UTC month/day `years` back.
const isoYearsAgoUTC = (years: number) => {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear() - years, n.getUTCMonth(), n.getUTCDate(), 12))
    .toISOString()
    .slice(0, 10);
};

const valid = {
  token: "22222222-2222-2222-2222-222222222222",
  attendeeName: "Jane Hygienist",
  attendeeEmail: "jane@example.com",
  licenseNumber: "TX-RDH-1",
  licenseType: "RDH",
  licenseStates: ["TX"],
  courseFormat: "LIVE In Person",
  completionDate: isoUTC(-30 * DAY),
  selectedSessionIds: [],
  affirmed: true,
  answers: [{ type: "MC", answer: 0 }],
};

describe("eventAttendeeSubmissionSchema", () => {
  it("accepts a valid submission", () => {
    expect(eventAttendeeSubmissionSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts a missing course format (stale client bundle; action falls back)", () => {
    const { courseFormat: _omit, ...withoutFormat } = valid;
    void _omit;
    const parsed = eventAttendeeSubmissionSchema.safeParse(withoutFormat);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.courseFormat).toBeUndefined();
  });

  it("rejects an unknown course format", () => {
    expect(
      eventAttendeeSubmissionSchema.safeParse({ ...valid, courseFormat: "Live/Online" }).success,
    ).toBe(false);
  });

  it("trims surrounding whitespace from name and email", () => {
    const parsed = eventAttendeeSubmissionSchema.safeParse({
      ...valid,
      attendeeName: " Jane Hygienist ",
      attendeeEmail: " jane@example.com ",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.attendeeName).toBe("Jane Hygienist");
      expect(parsed.data.attendeeEmail).toBe("jane@example.com");
    }
  });

  it("accepts tomorrow's UTC date (attendee ahead of UTC) but not two days ahead", () => {
    expect(
      eventAttendeeSubmissionSchema.safeParse({ ...valid, completionDate: isoUTC(DAY) }).success,
    ).toBe(true);
    expect(
      eventAttendeeSubmissionSchema.safeParse({ ...valid, completionDate: isoUTC(2 * DAY) }).success,
    ).toBe(false);
  });

  it("rejects a completion date 11 years back", () => {
    expect(
      eventAttendeeSubmissionSchema.safeParse({ ...valid, completionDate: isoYearsAgoUTC(11) })
        .success,
    ).toBe(false);
  });

  it("rejects an empty answers array", () => {
    expect(eventAttendeeSubmissionSchema.safeParse({ ...valid, answers: [] }).success).toBe(false);
  });

  it("accepts an attendance-code answer and trims it", () => {
    const parsed = eventAttendeeSubmissionSchema.parse({
      ...valid,
      answers: [{ type: "MC", answer: 0 }, { type: "CODE", answer: "  AbC 12 " }],
    });
    expect(parsed.answers[1]).toEqual({ type: "CODE", answer: "AbC 12" });
  });

  it("rejects an attendance-code answer over 100 characters", () => {
    expect(
      eventAttendeeSubmissionSchema.safeParse({
        ...valid,
        answers: [{ type: "CODE", answer: "x".repeat(101) }],
      }).success,
    ).toBe(false);
  });

  it("rejects when attendance is not affirmed", () => {
    expect(eventAttendeeSubmissionSchema.safeParse({ ...valid, affirmed: false }).success).toBe(false);
  });
});

describe("eventAttendeeSubmissionSchema email typo guard", () => {
  it("rejects a non-existent TLD with a did-you-mean message on the email field", () => {
    const parsed = eventAttendeeSubmissionSchema.safeParse({ ...valid, attendeeEmail: "jane@yahoo.con" });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(flattenFieldErrors(parsed.error).attendeeEmail).toEqual([
      "Check your email address. Did you mean jane@yahoo.com?",
    ]);
  });

  it("accepts a provider misspelling and real .cm/.co TLDs", () => {
    for (const attendeeEmail of ["jane@gmial.com", "jane@example.cm", "jane@example.co"]) {
      expect(eventAttendeeSubmissionSchema.safeParse({ ...valid, attendeeEmail }).success).toBe(true);
    }
  });
});
