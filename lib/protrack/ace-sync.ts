import "server-only";
import { prisma } from "@/lib/prisma";
import {
  attachIssuedCertToMatchingAccount,
  ISSUED_SELECT,
  toCeCertData,
  type CertClaimResult,
} from "@/lib/protrack/ace-sync-core";

/*
  ACE → ProTrack auto-sync.

  When a DentalACE-issued certificate was issued to a licensee's own account
  email, it appears in their ProTrack dashboard automatically as a trusted,
  AUTO-verified certificate. This module is the single home for that logic.

  - syncIssuedCertsForLicensee: backfill, run at email verification (matches the
    account's own, now-proven email) and re-runnable.
  - claimIssuedCertificate: attaches ONE issued cert to the matching account,
    called only from /api/protrack/claim-certificate after the recipient proved
    control of attendeeEmail by clicking the signed claim link in the cert email.

  SECURITY: matching is by attendeeEmail ONLY, never by license number. License
  numbers are user-supplied at registration / add-license and are effectively
  public (state-board lookups), so matching on them would let anyone harvest
  another person's CE history by claiming their license number (IDOR). The
  account email is the only attacker-non-arbitrary key we have here.

  Email ownership is proven on BOTH paths (neither auto-attaches from a merely
  self-reported email): the backfill runs in /api/auth/verify-email, only after
  the account holder clicked their own verification link; the forward attach
  (claimIssuedCertificate) runs only from the claim route, reached by clicking a
  signed link mailed to attendeeEmail, so the clicker proved control of that
  inbox first.

  The mapping and the attach itself live in ace-sync-core.ts (no "server-only",
  no app Prisma singleton) so a one-off script can run them inside its own
  transaction. Both dedupe on ce_certificates.issuedCertificateId (unique) via
  createMany skipDuplicates, so they are safe to re-run. Prisma queries here run as the
  privileged DB role and intentionally read issued_certificates across companies;
  this is the one sanctioned cross-company read.
*/

/**
 * Backfill every DentalACE certificate that matches this licensee's email or any
 * of their license numbers. Returns the number of new ProTrack certificates
 * created. Idempotent.
 */
export async function syncIssuedCertsForLicensee(
  licenseeId: string,
): Promise<number> {
  const user = await prisma.user.findUnique({
    where: { id: licenseeId },
    select: { email: true },
  });
  if (!user) return 0;

  // Match by the account's own email only — never by user-supplied license
  // number (see SECURITY note above).
  const issued = await prisma.issuedCertificate.findMany({
    where: {
      passed: true,
      attendeeEmail: { equals: user.email, mode: "insensitive" },
    },
    select: ISSUED_SELECT,
  });
  if (issued.length === 0) return 0;

  const result = await prisma.ceCertificate.createMany({
    data: issued.map((i) => toCeCertData(i, licenseeId)),
    skipDuplicates: true,
  });
  return result.count;
}

export type { CertClaimResult };

/**
 * Attach ONE freshly-issued DentalACE certificate to the ProTrack account that
 * owns its attendeeEmail. Call ONLY after the recipient proved control of that
 * email (the claim route verifies a signed link mailed to attendeeEmail — see
 * SECURITY note above). Idempotent via the unique issuedCertificateId +
 * skipDuplicates. Returns:
 *   - attached:   a matching account exists and now has the cert,
 *   - no_account: nobody has registered that email yet (route them to sign-up;
 *                 the verification backfill picks it up when they do),
 *   - invalid:    the id is unknown or the cert did not pass.
 */
export async function claimIssuedCertificate(
  issuedCertId: string,
): Promise<CertClaimResult> {
  return attachIssuedCertToMatchingAccount(prisma, issuedCertId);
}
