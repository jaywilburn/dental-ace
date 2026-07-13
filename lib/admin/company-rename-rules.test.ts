import { describe, it, expect } from "vitest";
import { validateCompanyRename } from "@/lib/admin/company-rename-rules";

describe("validateCompanyRename", () => {
  it("accepts a valid new name and returns it trimmed", () => {
    expect(validateCompanyRename("  Limitless on Demand  ", "LearningU")).toEqual({
      ok: true,
      name: "Limitless on Demand",
    });
  });

  it("allows a case-only change (fixing capitalization)", () => {
    expect(validateCompanyRename("LEARNINGU", "LearningU")).toEqual({
      ok: true,
      name: "LEARNINGU",
    });
  });

  it("rejects a name identical to the current one (after trimming)", () => {
    expect(validateCompanyRename("LearningU", "LearningU").ok).toBe(false);
    expect(validateCompanyRename("  LearningU ", "LearningU").ok).toBe(false);
  });

  it("rejects empty and too-short names", () => {
    expect(validateCompanyRename("", "LearningU").ok).toBe(false);
    expect(validateCompanyRename("   ", "LearningU").ok).toBe(false);
    expect(validateCompanyRename("A", "LearningU").ok).toBe(false);
  });

  it("rejects names over 200 characters", () => {
    expect(validateCompanyRename("x".repeat(201), "LearningU").ok).toBe(false);
  });

  it("accepts a name at exactly 200 characters", () => {
    const name = "x".repeat(200);
    expect(validateCompanyRename(name, "LearningU")).toEqual({ ok: true, name });
  });
});
