import { describe, it, expect } from "vitest";
import { hasAvailableCredits, canViewCertificateLog } from "./credit-gate";

describe("hasAvailableCredits", () => {
  it("is false with zero credits", () => {
    expect(hasAvailableCredits({ applicationCredits: 0 })).toBe(false);
  });

  it("is true with application credits", () => {
    expect(hasAvailableCredits({ applicationCredits: 3 })).toBe(true);
  });
});

describe("canViewCertificateLog", () => {
  it("blocks a company with no credits and no issued certificates", () => {
    expect(canViewCertificateLog({ applicationCredits: 0 }, 0)).toBe(false);
  });

  it("allows a company holding credits even before any cert is issued", () => {
    expect(canViewCertificateLog({ applicationCredits: 1 }, 0)).toBe(true);
  });

  it("allows a company with issued certificates even at zero balance", () => {
    expect(canViewCertificateLog({ applicationCredits: 0 }, 12)).toBe(true);
  });
});
