import { describe, it, expect } from "vitest";
import {
  canRevise,
  isCreditSettled,
  revisePatch,
} from "@/lib/company/resubmit-rules";

describe("canRevise", () => {
  it("allows a rejected submission to be revised", () => {
    expect(canRevise("REJECTED")).toBe(true);
  });

  it("refuses one still under review", () => {
    // Pulling a PENDING item back would drop it out of the queue under the
    // reviewer who is looking at it.
    expect(canRevise("PENDING")).toBe(false);
  });

  it("refuses an approved submission", () => {
    expect(canRevise("APPROVED")).toBe(false);
  });

  it("refuses a draft, which the wizard already opens", () => {
    expect(canRevise("DRAFT")).toBe(false);
  });
});

describe("isCreditSettled", () => {
  it("treats a stamp as settled, so the revision is free", () => {
    expect(isCreditSettled(new Date("2026-07-28T21:23:38Z"))).toBe(true);
  });

  // Loose null check on purpose: the column is nullable and a select that omits
  // it yields undefined. Both mean "not charged yet", and a strict === null
  // would silently make every unsettled submission free.
  it("treats null and undefined alike as not yet charged", () => {
    expect(isCreditSettled(null)).toBe(false);
    expect(isCreditSettled(undefined)).toBe(false);
  });
});

describe("revisePatch", () => {
  const patch = revisePatch();

  it("reopens the event for editing and drops the reversed decision", () => {
    expect(patch).toEqual({ status: "DRAFT", reviewedAt: null, reviewedById: null });
  });

  it("never clears creditChargedAt, which is what keeps the revision free", () => {
    expect(patch).not.toHaveProperty("creditChargedAt");
  });

  it("never clears submittedAt, which is what stops a settled row being resumed as new", () => {
    // ensureEventDraft's implicit branch filters submittedAt: null. Clearing it
    // here would make a paid row reusable as a free new submission.
    expect(patch).not.toHaveProperty("submittedAt");
  });

  it("keeps reviewerNotes so the provider can see what to fix", () => {
    expect(patch).not.toHaveProperty("reviewerNotes");
  });
});
