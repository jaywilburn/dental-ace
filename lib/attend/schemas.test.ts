import { describe, it, expect } from "vitest";
import { attendeeSubmissionSchema } from "@/lib/attend/schemas";

const valid = {
  token: "11111111-1111-1111-1111-111111111111",
  attendeeName: "Jane Hygienist",
  attendeeEmail: "jane@example.com",
  licenseNumber: "TX-RDH-1",
  licenseType: "RDH",
  licenseStates: ["TX"],
  courseFormat: "LIVE In Person",
  completionDate: "2026-01-15",
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

  it("rejects a missing course format", () => {
    const { courseFormat: _omit, ...withoutFormat } = valid;
    void _omit;
    expect(attendeeSubmissionSchema.safeParse(withoutFormat).success).toBe(false);
  });

  it("rejects when attendance is not affirmed", () => {
    expect(attendeeSubmissionSchema.safeParse({ ...valid, affirmed: false }).success).toBe(false);
  });

  it("rejects a future completion date", () => {
    expect(
      attendeeSubmissionSchema.safeParse({ ...valid, completionDate: "2099-01-01" }).success,
    ).toBe(false);
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
