import { describe, it, expect } from "vitest";
import {
  attendeeSubmissionSchema,
  flattenFieldErrors,
  isRecentCompletionDate,
} from "@/lib/attend/schemas";

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
  token: "11111111-1111-1111-1111-111111111111",
  attendeeName: "Jane Hygienist",
  attendeeEmail: "jane@example.com",
  licenseNumber: "TX-RDH-1",
  licenseType: "RDH",
  licenseStates: ["TX"],
  courseFormat: "LIVE In Person",
  completionDate: isoUTC(-30 * DAY),
  affirmed: true,
  answers: [
    { type: "TF", answer: "True" },
    { type: "TF", answer: "False" },
    { type: "MC", answer: 1 },
    { type: "MC", answer: 2 },
    { type: "MC", answer: 3 },
  ],
};

describe("attendeeSubmissionSchema", () => {
  it("accepts a valid submission", () => {
    expect(attendeeSubmissionSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts each of the four canonical course formats", () => {
    for (const courseFormat of [
      "LIVE In Person",
      "LIVE Online",
      "On Demand Recording",
      "Self Study/Printed",
    ]) {
      expect(
        attendeeSubmissionSchema.safeParse({ ...valid, courseFormat }).success,
      ).toBe(true);
    }
  });

  it("rejects an unknown course format", () => {
    expect(
      attendeeSubmissionSchema.safeParse({ ...valid, courseFormat: "Live/Online" }).success,
    ).toBe(false);
  });

  it("accepts a missing course format (stale client bundle; action falls back)", () => {
    const { courseFormat: _omit, ...withoutFormat } = valid;
    void _omit;
    const parsed = attendeeSubmissionSchema.safeParse(withoutFormat);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.courseFormat).toBeUndefined();
  });

  it("trims surrounding whitespace from name and email", () => {
    const parsed = attendeeSubmissionSchema.safeParse({
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

  it("rejects a whitespace-only name", () => {
    expect(attendeeSubmissionSchema.safeParse({ ...valid, attendeeName: "   " }).success).toBe(false);
  });

  it("rejects when attendance is not affirmed", () => {
    expect(attendeeSubmissionSchema.safeParse({ ...valid, affirmed: false }).success).toBe(false);
  });

  it("rejects a future completion date", () => {
    expect(
      attendeeSubmissionSchema.safeParse({ ...valid, completionDate: "2099-01-01" }).success,
    ).toBe(false);
  });

  it("accepts today's date in UTC and in the client's local timezone", () => {
    // Replicates the form's todayISO() (local calendar date), which can be one
    // day off from the UTC date depending on the attendee's timezone.
    const t = new Date();
    const localToday = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
    for (const completionDate of [isoUTC(0), localToday]) {
      expect(attendeeSubmissionSchema.safeParse({ ...valid, completionDate }).success).toBe(true);
    }
  });

  it("accepts tomorrow's UTC date (attendee ahead of UTC) but not two days ahead", () => {
    expect(
      attendeeSubmissionSchema.safeParse({ ...valid, completionDate: isoUTC(DAY) }).success,
    ).toBe(true);
    expect(
      attendeeSubmissionSchema.safeParse({ ...valid, completionDate: isoUTC(2 * DAY) }).success,
    ).toBe(false);
  });

  it("accepts a date exactly 10 years ago but rejects 11 years ago", () => {
    expect(
      attendeeSubmissionSchema.safeParse({ ...valid, completionDate: isoYearsAgoUTC(10) }).success,
    ).toBe(true);
    expect(
      attendeeSubmissionSchema.safeParse({ ...valid, completionDate: isoYearsAgoUTC(11) }).success,
    ).toBe(false);
  });

  it("rejects an impossible calendar date", () => {
    expect(isRecentCompletionDate("2026-02-30")).toBe(false);
  });

  it("rejects a malformed completion date", () => {
    expect(
      attendeeSubmissionSchema.safeParse({ ...valid, completionDate: "01/15/2026" }).success,
    ).toBe(false);
  });

  it("rejects the wrong number of answers", () => {
    expect(
      attendeeSubmissionSchema.safeParse({ ...valid, answers: valid.answers.slice(0, 4) }).success,
    ).toBe(false);
  });

  it("rejects an out-of-range MC answer", () => {
    const answers = [...valid.answers];
    answers[2] = { type: "MC", answer: 9 };
    expect(attendeeSubmissionSchema.safeParse({ ...valid, answers }).success).toBe(false);
  });

  it("rejects a non-email", () => {
    expect(attendeeSubmissionSchema.safeParse({ ...valid, attendeeEmail: "nope" }).success).toBe(false);
  });
});

describe("flattenFieldErrors", () => {
  it("keys errors by field with static messages and never echoes the input", () => {
    const parsed = attendeeSubmissionSchema.safeParse({
      ...valid,
      attendeeEmail: "not-an-email-value",
      completionDate: "2099-01-01",
    });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    const fieldErrors = flattenFieldErrors(parsed.error);
    expect(fieldErrors.attendeeEmail?.length).toBeGreaterThan(0);
    expect(fieldErrors.completionDate?.length).toBeGreaterThan(0);
    expect(JSON.stringify(fieldErrors)).not.toContain("not-an-email-value");
  });
});
