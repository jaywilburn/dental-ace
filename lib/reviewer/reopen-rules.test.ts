import { describe, it, expect } from "vitest";
import {
  canReopen,
  isValidReopenReason,
  reopenPatch,
  REOPEN_REASON_MIN,
} from "@/lib/reviewer/reopen-rules";

/*
  Reversing a rejection. On 2026-07-29 a reviewer rejected a complete event
  because the review page hid the application; nothing in the product could
  undo it, so the only remedy was a manual database write.
*/
describe("canReopen", () => {
  it("allows a rejected item back into the queue", () => {
    expect(canReopen("REJECTED")).toBe(true);
  });

  // The load-bearing exclusion. An approved event holds a unique Event ID, a
  // rendered QR and letter, a LIVE attendee link and possibly issued
  // certificates. Flipping it to PENDING kills /attend mid-event and
  // re-approval would allocate a second Event ID.
  it("refuses an approved item", () => {
    expect(canReopen("APPROVED")).toBe(false);
  });

  it("refuses items that were never decided", () => {
    expect(canReopen("PENDING")).toBe(false);
    expect(canReopen("DRAFT")).toBe(false);
  });
});

describe("isValidReopenReason", () => {
  it("requires a real reason, matching the reject guard", () => {
    expect(isValidReopenReason("too short")).toBe(false);
    expect(isValidReopenReason("   ".repeat(20))).toBe(false);
    expect(isValidReopenReason("x".repeat(REOPEN_REASON_MIN))).toBe(true);
    expect(isValidReopenReason("Rejected in error; details were collapsed.")).toBe(true);
  });

  it("does not count surrounding whitespace toward the minimum", () => {
    expect(isValidReopenReason(`  ${"x".repeat(REOPEN_REASON_MIN - 1)}  `)).toBe(false);
  });
});

describe("reopenPatch", () => {
  const patch = reopenPatch();

  it("returns the item to the queue and drops the reversed attribution", () => {
    expect(patch).toEqual({ status: "PENDING", reviewedAt: null, reviewedById: null });
  });

  // These three are deliberately absent. reviewerNotes so the provider still
  // sees what was asked for; submittedAt so the days-pending clock stays
  // honest; creditChargedAt because clearing it would re-charge a revision.
  it("never touches reviewerNotes, submittedAt or creditChargedAt", () => {
    expect(patch).not.toHaveProperty("reviewerNotes");
    expect(patch).not.toHaveProperty("submittedAt");
    expect(patch).not.toHaveProperty("creditChargedAt");
  });
});
