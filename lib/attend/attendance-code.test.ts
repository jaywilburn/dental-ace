import { describe, it, expect } from "vitest";
import { codesMatch, duplicateCodeIds, normalizeAttendanceCode } from "@/lib/attend/attendance-code";

describe("normalizeAttendanceCode", () => {
  it("lowercases and strips surrounding and inner spaces", () => {
    expect(normalizeAttendanceCode(" AbC 12 ")).toBe("abc12");
  });
  it("strips tabs, newlines, non-breaking and ideographic spaces", () => {
    expect(normalizeAttendanceCode("AB C\tD\nE　F")).toBe("abcdef");
  });
  it("folds full-width characters to ASCII", () => {
    expect(normalizeAttendanceCode("ＡＢＣ１２")).toBe("abc12");
  });
  it("keeps hyphens and other punctuation", () => {
    expect(normalizeAttendanceCode("AB-12")).toBe("ab-12");
  });
  it("returns an empty string for blank input", () => {
    expect(normalizeAttendanceCode("")).toBe("");
    expect(normalizeAttendanceCode("    ")).toBe("");
  });
});

describe("codesMatch", () => {
  it("matches across case and spacing", () => {
    expect(codesMatch(" abc 12 ", "ABC12")).toBe(true);
  });
  it("matches full-width input against an ASCII code", () => {
    expect(codesMatch("ＡＢＣ１２", "abc12")).toBe(true);
  });
  it("treats hyphens as significant", () => {
    expect(codesMatch("AB12", "AB-12")).toBe(false);
  });
  it("never matches an empty answer, even against an empty code", () => {
    expect(codesMatch("", "")).toBe(false);
    expect(codesMatch("   ", "ABCD")).toBe(false);
  });
  it("rejects a different code", () => {
    expect(codesMatch("ABCD", "ABCE")).toBe(false);
  });
});

describe("duplicateCodeIds", () => {
  it("flags every entry sharing a normalised code", () => {
    const dupes = duplicateCodeIds([
      { id: "a", code: "ABC 123" },
      { id: "b", code: "abc123" },
      { id: "c", code: "XYZ9" },
    ]);
    expect([...dupes].sort()).toEqual(["a", "b"]);
  });
  it("returns an empty set when every code is distinct", () => {
    expect(duplicateCodeIds([{ id: "a", code: "AB-12" }, { id: "b", code: "AB12" }]).size).toBe(0);
    expect(duplicateCodeIds([]).size).toBe(0);
  });
});
