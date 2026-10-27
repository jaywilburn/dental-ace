import { describe, it, expect } from "vitest";
import { parseRetireCourseForm, RETIRE_REASON_MAX, totalAfterRetire } from "@/lib/admin/course-retire-rules";

const COURSE = "ffae9010-1846-4fc9-b973-031819165c61";

describe("parseRetireCourseForm", () => {
  it("trims the reason", () => {
    expect(parseRetireCourseForm({ courseId: COURSE, reason: "  Not this company's course  " })).toEqual({
      ok: true,
      data: { courseId: COURSE, reason: "Not this company's course" },
    });
  });

  it("refuses a blank or whitespace-only reason", () => {
    for (const reason of ["", "   ", null]) {
      const r = parseRetireCourseForm({ courseId: COURSE, reason });
      expect(r.ok).toBe(false);
    }
    const r = parseRetireCourseForm({ courseId: COURSE, reason: "   " });
    expect(r.ok === false && r.error).toBe("Enter a reason for retiring this course.");
  });

  it("refuses a reason over the limit but accepts one at it", () => {
    expect(parseRetireCourseForm({ courseId: COURSE, reason: "x".repeat(RETIRE_REASON_MAX) }).ok).toBe(true);
    expect(parseRetireCourseForm({ courseId: COURSE, reason: "x".repeat(RETIRE_REASON_MAX + 1) }).ok).toBe(false);
  });

  it("refuses a malformed course id with a generic message", () => {
    expect(parseRetireCourseForm({ courseId: "not-a-uuid", reason: "ok" })).toEqual({
      ok: false,
      error: "Invalid retire request.",
    });
  });
});

describe("totalAfterRetire", () => {
  it("subtracts the hidden certificates", () => {
    expect(totalAfterRetire(68, 16)).toBe(52);
  });
  it("floors at zero", () => {
    expect(totalAfterRetire(10, 16)).toBe(0);
    expect(totalAfterRetire(0, 0)).toBe(0);
  });
});
