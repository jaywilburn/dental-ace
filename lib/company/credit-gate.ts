/*
  Pure access decisions for credit-gated company pages (client feedback,
  June 2026: a company with no credits cannot start an application and cannot
  see the certificate area). Kept free of server imports so they unit-test
  without a DB; the redirecting guards live in ./credit-guards.ts.
*/

export type CompanyCredits = {
  applicationCredits: number;
  expeditedCredits: number;
};

/** True when the company holds at least one application credit of either pool. */
export function hasAvailableCredits(credits: CompanyCredits): boolean {
  return credits.applicationCredits + credits.expeditedCredits > 0;
}

/**
 * The Certificate Log is reachable with credits in hand, or once the company
 * has any issued certificates (a company must never lose access to its own
 * issuance records just because its credit balance hit zero).
 */
export function canViewCertificateLog(
  credits: CompanyCredits,
  issuedCertCount: number,
): boolean {
  return hasAvailableCredits(credits) || issuedCertCount > 0;
}
