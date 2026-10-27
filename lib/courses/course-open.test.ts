import { describe, it, expect } from "vitest";
import { isCourseClosed } from "@/lib/courses/course-open";

const NOW = new Date("2026-10-27T12:00:00Z");
const FUTURE = new Date("2027-01-01T00:00:00Z");
const PAST = new Date("2026-01-01T00:00:00Z");

describe("isCourseClosed", () => {
  it("is open for a live, unexpired course", () => {
    expect(isCourseClosed({ expiresAt: FUTURE, retiredAt: null }, NOW)).toBe(false);
  });
  it("is closed once expired", () => {
    expect(isCourseClosed({ expiresAt: PAST, retiredAt: null }, NOW)).toBe(true);
  });
  it("is closed when retired, even before expiry", () => {
    expect(isCourseClosed({ expiresAt: FUTURE, retiredAt: PAST }, NOW)).toBe(true);
  });
});
