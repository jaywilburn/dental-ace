import { describe, it, expect } from "vitest";
import { validateCourseRename } from "@/lib/admin/course-rename-rules";

describe("validateCourseRename", () => {
  it("accepts a valid new title and returns it trimmed", () => {
    expect(validateCourseRename("  DIBS AI Clinical Training  ", "DIBS Clinical Training")).toEqual({
      ok: true,
      title: "DIBS AI Clinical Training",
    });
  });

  it("allows a case-only change (fixing capitalization)", () => {
    expect(validateCourseRename("DIBS AI CLINICAL TRAINING", "DIBS AI Clinical Training")).toEqual({
      ok: true,
      title: "DIBS AI CLINICAL TRAINING",
    });
  });

  it("rejects a title identical to the current one (after trimming)", () => {
    expect(validateCourseRename("DIBS AI Clinical Training", "DIBS AI Clinical Training").ok).toBe(false);
    expect(validateCourseRename("  DIBS AI Clinical Training ", "DIBS AI Clinical Training").ok).toBe(false);
  });

  it("accepts any valid title when the course has no current title", () => {
    expect(validateCourseRename("DIBS AI Clinical Training", null)).toEqual({
      ok: true,
      title: "DIBS AI Clinical Training",
    });
  });

  it("rejects empty, whitespace-only and too-short titles", () => {
    expect(validateCourseRename("", "Old").ok).toBe(false);
    expect(validateCourseRename("   ", "Old").ok).toBe(false);
    expect(validateCourseRename("AB", "Old").ok).toBe(false);
    // Whitespace padding does not count toward the minimum.
    expect(validateCourseRename("  AB  ", "Old").ok).toBe(false);
  });

  it("rejects titles over 200 characters", () => {
    expect(validateCourseRename("x".repeat(201), "Old").ok).toBe(false);
  });

  it("accepts a title at exactly 200 characters", () => {
    const title = "x".repeat(200);
    expect(validateCourseRename(title, "Old")).toEqual({ ok: true, title });
  });
});
