import { describe, it, expect } from "vitest";
import { decideAttempt, MAX_ATTEMPTS } from "@/lib/attend/lockout";

describe("decideAttempt", () => {
  it("short-circuits when a passing cert already exists", () => {
    expect(decideAttempt({ passedExists: true, failedCount: 0 })).toEqual({
      kind: "already_certified",
    });
  });

  it("allows the first attempt (not final)", () => {
    expect(decideAttempt({ passedExists: false, failedCount: 0 })).toEqual({
      kind: "allowed",
      isFinalAttempt: false,
    });
  });

  it("allows the retake and marks it final", () => {
    expect(decideAttempt({ passedExists: false, failedCount: 1 })).toEqual({
      kind: "allowed",
      isFinalAttempt: true,
    });
  });

  it("locks out after MAX_ATTEMPTS fails", () => {
    expect(decideAttempt({ passedExists: false, failedCount: MAX_ATTEMPTS })).toEqual({
      kind: "locked_out",
    });
  });
});
