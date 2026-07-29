/*
  Pure validation for admin billing overrides. No DB, no server-only —
  unit-tested directly. The server actions call these under the company row
  lock, passing the locked balance, so the floor check can't race.

  Both balances adjust in either direction: an admin who grants to the wrong
  balance has to be able to take it back (2026-07-29, after 155 application
  credits were granted to SKF Practice Solutions in place of certificates and
  the panel offered no way to reverse it).
*/

export type OverrideValidation = { ok: true } | { ok: false; error: string };

function validateAdjustment(
  delta: number,
  currentBalance: number,
  limit: number,
  noun: string,
): OverrideValidation {
  if (!Number.isInteger(delta) || delta === 0) {
    return { ok: false, error: "Adjustment must be a non-zero whole number." };
  }
  if (Math.abs(delta) > limit) {
    return { ok: false, error: "Adjustment is too large." };
  }
  if (currentBalance + delta < 0) {
    return {
      ok: false,
      error: `Adjustment would make the ${noun} negative (current balance is ${currentBalance}).`,
    };
  }
  return { ok: true };
}

export function validateAppCreditAdjustment(
  delta: number,
  currentBalance: number,
): OverrideValidation {
  return validateAdjustment(delta, currentBalance, 10000, "credit balance");
}

export function validateCertBalanceAdjustment(
  delta: number,
  currentBalance: number,
): OverrideValidation {
  return validateAdjustment(delta, currentBalance, 100000, "balance");
}
