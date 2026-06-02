import { describe, it, expect } from "vitest";
import { chooseCreditPool } from "@/lib/billing/credit-pool";

describe("chooseCreditPool", () => {
  it("uses expedited when opted in and available", () => {
    expect(chooseCreditPool({ useExpedited: true, applicationCredits: 5, expeditedCredits: 2 })).toBe("expedited");
  });

  it("falls back to standard when expedited opted in but none left", () => {
    expect(chooseCreditPool({ useExpedited: true, applicationCredits: 5, expeditedCredits: 0 })).toBe("standard");
  });

  it("uses standard when not opted into expedited", () => {
    expect(chooseCreditPool({ useExpedited: false, applicationCredits: 5, expeditedCredits: 9 })).toBe("standard");
  });

  it("returns none when no credits are available", () => {
    expect(chooseCreditPool({ useExpedited: false, applicationCredits: 0, expeditedCredits: 0 })).toBe("none");
    expect(chooseCreditPool({ useExpedited: true, applicationCredits: 0, expeditedCredits: 0 })).toBe("none");
  });
});
