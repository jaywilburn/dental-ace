import { describe, it, expect } from "vitest";
import { formatCourseId, nextSeqFromLast } from "@/lib/reviewer/course-id";

describe("course-id", () => {
  it("starts at 1 when no prior course exists", () => {
    expect(nextSeqFromLast(null)).toBe(1);
  });

  it("increments from the last sequence", () => {
    expect(nextSeqFromLast("ACE-2026-00041")).toBe(42);
  });

  it("treats an unparseable tail as 0 -> 1", () => {
    expect(nextSeqFromLast("ACE-2026-XYZ")).toBe(1);
  });

  it("formats with year + zero-padded 5-digit sequence", () => {
    expect(formatCourseId(2026, 42)).toBe("ACE-2026-00042");
    expect(formatCourseId(2027, 1)).toBe("ACE-2027-00001");
  });
});
