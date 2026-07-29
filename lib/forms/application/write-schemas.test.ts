import { describe, it, expect } from "vitest";
import {
  step2WriteSchema,
  DETAILED_BIO_PLAIN_MAX,
  DETAILED_BIO_PLAIN_MIN,
} from "@/lib/forms/application/write-schemas";
import { step2Schema } from "@/lib/forms/application/schemas";

const BASE = {
  creatorName: "Dr. Jane Doe",
  credentials: "DDS",
  currentPosition: "Program Director",
  creatorEmail: "jane@example.com",
  creatorPhone: "555-123-4567",
  creatorAddress: "Austin, TX 78701",
  highestDegree: "Doctoral",
  educationPart1: "UT Austin, DDS, 2001",
  educationPart4: "N/A",
  creatorExperience: "20 years placing implants in private practice.",
};

const withBio = (html: string) => ({ ...BASE, detailedBioHtml: html });
const para = (text: string) => `<p>${text}</p>`;

describe("step2WriteSchema visible-text bio rules", () => {
  it("rejects a bio below the visible-text floor", () => {
    const result = step2WriteSchema.safeParse(withBio(para("x".repeat(DETAILED_BIO_PLAIN_MIN - 1))));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["detailedBioHtml"]);
      expect(result.error.issues[0].message).toMatch(/at least 20 characters/);
    }
  });

  it("reports an empty bio once, not twice", () => {
    // step2Schema's .min(1) already says "required"; the floor refine must not
    // stack a second message saying the same thing.
    const result = step2WriteSchema.safeParse(withBio(""));
    expect(result.success).toBe(false);
    if (!result.success) {
      const bioIssues = result.error.issues.filter(
        (i) => i.path[0] === "detailedBioHtml",
      );
      expect(bioIssues).toHaveLength(1);
      expect(bioIssues[0].message).toBe("Detailed bio is required");
    }
  });

  it("accepts a bio at exactly the floor", () => {
    expect(
      step2WriteSchema.safeParse(withBio(para("x".repeat(DETAILED_BIO_PLAIN_MIN)))).success,
    ).toBe(true);
  });

  it("accepts a bio at exactly the visible-text ceiling", () => {
    expect(
      step2WriteSchema.safeParse(withBio(para("x".repeat(DETAILED_BIO_PLAIN_MAX)))).success,
    ).toBe(true);
  });

  it("rejects a bio one character over the ceiling", () => {
    const result = step2WriteSchema.safeParse(
      withBio(para("x".repeat(DETAILED_BIO_PLAIN_MAX + 1))),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/under 5,000 characters of text/);
    }
  });

  it("does not count markup toward the visible-text cap", () => {
    // Heavy formatting, modest visible text: this is the Word-paste shape that
    // used to blow the HTML cap with a message nobody could act on.
    const heavy = Array.from(
      { length: 200 },
      (_, i) => `<p><strong><em>Line ${i} of the bio.</em></strong></p>`,
    ).join("");
    expect(heavy.length).toBeGreaterThan(DETAILED_BIO_PLAIN_MAX);
    expect(step2WriteSchema.safeParse(withBio(heavy)).success).toBe(true);
  });

  it("still enforces the raw HTML ceiling inherited from step2Schema", () => {
    const result = step2WriteSchema.safeParse(withBio(para("x".repeat(30_000))));
    expect(result.success).toBe(false);
  });
});

/*
  The visible-text rules are WRITE-only on purpose: a draft saved before this
  landed must still submit, and the submit gates parse with plain step2Schema.
*/
describe("plain step2Schema stays tolerant for existing drafts", () => {
  it("accepts a bio longer than the new visible-text cap", () => {
    const long = para("x".repeat(DETAILED_BIO_PLAIN_MAX + 1_000));
    expect(step2Schema.safeParse(withBio(long)).success).toBe(true);
    expect(step2WriteSchema.safeParse(withBio(long)).success).toBe(false);
  });

  it("accepts a bio shorter than the new visible-text floor", () => {
    const short = para("Short bio.");
    expect(step2Schema.safeParse(withBio(short)).success).toBe(true);
    expect(step2WriteSchema.safeParse(withBio(short)).success).toBe(false);
  });
});
