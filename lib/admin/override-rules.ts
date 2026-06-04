/*
  Pure validation for admin billing overrides. No DB, no server-only —
  unit-tested directly. The server actions call these (the cert-balance check
  runs under the company row lock with the locked balance).
*/

export type OverrideValidation = { ok: true } | { ok: false; error: string };

export function validateAppCreditGrant(quantity: number): OverrideValidation {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return { ok: false, error: "Quantity must be a positive whole number." };
  }
  if (quantity > 10000) {
    return { ok: false, error: "Quantity is too large." };
  }
  return { ok: true };
}

export function validateCertBalanceAdjustment(
  delta: number,
  currentBalance: number,
): OverrideValidation {
  if (!Number.isInteger(delta) || delta === 0) {
    return { ok: false, error: "Adjustment must be a non-zero whole number." };
  }
  if (Math.abs(delta) > 100000) {
    return { ok: false, error: "Adjustment is too large." };
  }
  if (currentBalance + delta < 0) {
    return { ok: false, error: "Adjustment would make the balance negative." };
  }
  return { ok: true };
}
