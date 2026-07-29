import { describe, it, expect } from "vitest";
import { z } from "zod";
import { normalizeFormText } from "@/lib/forms/normalize";

describe("normalizeFormText", () => {
  it("folds CRLF and lone CR to LF", () => {
    expect(normalizeFormText("a\r\nb\rc\nd")).toBe("a\nb\nc\nd");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeFormText("  hello  ")).toBe("hello");
    expect(normalizeFormText("\r\n\r\n")).toBe("");
  });

  it("returns an empty string for non-string entries", () => {
    expect(normalizeFormText(null)).toBe("");
    expect(normalizeFormText(undefined)).toBe("");
    expect(normalizeFormText(new File([], "x.pdf"))).toBe("");
  });

  it("leaves text without newlines untouched", () => {
    expect(normalizeFormText("Course objectives")).toBe("Course objectives");
  });
});

/*
  The load-bearing case. A <textarea maxlength="2000"> measures newlines as ONE
  character, but form submission posts them as CRLF (TWO). So the browser lets a
  provider fill the box to exactly 2,000 and then posts more than that, failing
  z.string().max(2000) with no visible cause. This is the mechanism behind the
  client's "if too many characters are entered... it erases all of the data".
*/
describe("CRLF inflation (the invisible overflow)", () => {
  const schema = z.string().max(2000);
  // 1,500 chars of text + 500 newlines = exactly 2,000 in the browser's count.
  const browserValue = "x".repeat(1500) + "\n".repeat(500);
  const postedValue = browserValue.replace(/\n/g, "\r\n");

  it("is at exactly the browser cap but over the wire", () => {
    expect(browserValue.length).toBe(2000);
    expect(postedValue.length).toBe(2500);
  });

  it("fails server validation without normalization", () => {
    expect(schema.safeParse(postedValue).success).toBe(false);
  });

  it("passes once normalized, with no content lost", () => {
    const normalized = normalizeFormText(postedValue);
    expect(schema.safeParse(normalized).success).toBe(true);
    // Only the trailing run of newlines is trimmed; the text is intact.
    expect(normalized).toBe("x".repeat(1500));
  });

  it("keeps interior newlines, which is what the multi-line fields need", () => {
    const outline = "1. Intro\r\n2. Practice\r\n3. Review";
    expect(normalizeFormText(outline)).toBe("1. Intro\n2. Practice\n3. Review");
  });
});
