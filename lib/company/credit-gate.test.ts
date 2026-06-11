import { describe, it, expect } from "vitest";
import { hasAvailableCredits, canViewCertificateLog } from "./credit-gate";

describe("hasAvailableCredits", () => {
  it("is false with zero credits in both pools", () => {
    expect(
      hasAvailableCredits({ applicationCredits: 0, expeditedCredits: 0 }),
    ).toBe(false);
  });

  it("is true with standard credits only", () => {
    expect(
      hasAvailableCredits({ applicationCredits: 3, expeditedCredits: 0 }),
    ).toBe(true);
  });

  it("is true with expedited credits only", () => {
    expect(
      hasAvailableCredits({ applicationCredits: 0, expeditedCredits: 1 }),
    ).toBe(true);
  });
});

describe("canViewCertificateLog", () => {
  it("blocks a company with no credits and no issued certificates", () => {
    expect(
      canViewCertificateLog(
        { applicationCredits: 0, expeditedCredits: 0 },
        0,
      ),
    ).toBe(false);
  });

  it("allows a company holding credits even before any cert is issued", () => {
    expect(
      canViewCertificateLog(
        { applicationCredits: 1, expeditedCredits: 0 },
        0,
      ),
    ).toBe(true);
  });

  it("allows a company with issued certificates even at zero balance", () => {
    expect(
      canViewCertificateLog(
        { applicationCredits: 0, expeditedCredits: 0 },
        12,
      ),
    ).toBe(true);
  });
});
