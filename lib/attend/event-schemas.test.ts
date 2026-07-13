import { describe, it, expect } from "vitest";
import { eventAttendeeSubmissionSchema } from "@/lib/attend/event-schemas";

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

  it("rejects when attendance is not affirmed", () => {
    expect(eventAttendeeSubmissionSchema.safeParse({ ...valid, affirmed: false }).success).toBe(false);
  });
});
