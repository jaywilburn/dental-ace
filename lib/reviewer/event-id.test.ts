import { describe, it, expect } from "vitest";
import { formatEventId, nextSeqFromLast } from "@/lib/reviewer/event-id";

describe("formatEventId", () => {
  it("zero-pads to ACE-EVT-YYYY-#####", () => {
    expect(formatEventId(2026, 1)).toBe("ACE-EVT-2026-00001");
    expect(formatEventId(2026, 42)).toBe("ACE-EVT-2026-00042");
  });
});

describe("nextSeqFromLast (shared with courses)", () => {
  it("starts at 1 when there is no prior event id", () => {
    expect(nextSeqFromLast(null)).toBe(1);
  });
  it("increments the trailing sequence of an event id", () => {
    expect(nextSeqFromLast("ACE-EVT-2026-00007")).toBe(8);
  });
});
