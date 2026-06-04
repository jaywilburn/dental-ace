import { describe, it, expect } from "vitest";
import { validateAppCreditGrant, validateCertBalanceAdjustment } from "@/lib/admin/override-rules";

describe("validateAppCreditGrant", () => {
  it("accepts a positive whole quantity", () => {
    expect(validateAppCreditGrant(5)).toEqual({ ok: true });
  });
  it("rejects zero, negative, and non-integer", () => {
    expect(validateAppCreditGrant(0).ok).toBe(false);
    expect(validateAppCreditGrant(-3).ok).toBe(false);
    expect(validateAppCreditGrant(1.5).ok).toBe(false);
  });
  it("rejects absurdly large quantities", () => {
    expect(validateAppCreditGrant(10001).ok).toBe(false);
  });
});

describe("validateCertBalanceAdjustment", () => {
  it("accepts a positive increase", () => {
    expect(validateCertBalanceAdjustment(50, 0)).toEqual({ ok: true });
  });
  it("accepts a decrease that stays non-negative", () => {
    expect(validateCertBalanceAdjustment(-10, 25)).toEqual({ ok: true });
    expect(validateCertBalanceAdjustment(-25, 25)).toEqual({ ok: true });
  });
  it("rejects a decrease that would go negative", () => {
    expect(validateCertBalanceAdjustment(-26, 25).ok).toBe(false);
  });
  it("rejects zero and non-integer deltas", () => {
    expect(validateCertBalanceAdjustment(0, 25).ok).toBe(false);
    expect(validateCertBalanceAdjustment(2.5, 25).ok).toBe(false);
  });
});
