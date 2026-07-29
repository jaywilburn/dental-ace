import { describe, it, expect } from "vitest";
import {
  validateAppCreditAdjustment,
  validateCertBalanceAdjustment,
} from "@/lib/admin/override-rules";

describe("validateAppCreditAdjustment", () => {
  it("accepts a positive grant", () => {
    expect(validateAppCreditAdjustment(5, 0)).toEqual({ ok: true });
  });

  // The reason this function changed: an admin granted 155 application credits
  // meaning to grant certificates, and the panel had no way to take them back.
  it("accepts a decrease that stays non-negative", () => {
    expect(validateAppCreditAdjustment(-155, 155)).toEqual({ ok: true });
    expect(validateAppCreditAdjustment(-1, 155)).toEqual({ ok: true });
  });

  it("rejects a decrease that would go negative", () => {
    expect(validateAppCreditAdjustment(-156, 155).ok).toBe(false);
    expect(validateAppCreditAdjustment(-1, 0).ok).toBe(false);
  });

  it("names the current balance in the floor error, so the admin can correct it", () => {
    const v = validateAppCreditAdjustment(-156, 155);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.error).toContain("155");
  });

  it("rejects zero and non-integer deltas", () => {
    expect(validateAppCreditAdjustment(0, 10).ok).toBe(false);
    expect(validateAppCreditAdjustment(1.5, 10).ok).toBe(false);
  });

  it("rejects absurdly large adjustments in both directions", () => {
    expect(validateAppCreditAdjustment(10001, 0).ok).toBe(false);
    expect(validateAppCreditAdjustment(-10001, 20000).ok).toBe(false);
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
  it("keeps its own larger cap", () => {
    expect(validateCertBalanceAdjustment(20000, 0)).toEqual({ ok: true });
    expect(validateCertBalanceAdjustment(100001, 0).ok).toBe(false);
  });
});
