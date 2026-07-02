/*
  Pure block/allow decision for hard-deleting a user account. No DB, no
  server-only — unit-tested directly (see deletion-rules.test.ts). The server
  action and the user-detail page both feed it facts from gatherDeletionFacts()
  in lib/admin/deletion.ts.

  Policy: we hard-delete ONLY "clean" accounts (frees the email for re-signup
  during testing). Any account carrying real, irreversible records is blocked
  and must be suspended instead. See the design spec dated 2026-07-01.
*/

export type DeletionFacts = {
  /** Target is the acting admin. */
  isSelf: boolean;
  /** Target is an enabled ADMIN and the only one left. */
  isLastActiveAdmin: boolean;
  /** Target has authored admin-audit-log entries (blocks the required actor FK). */
  hasPerformedAdminActions: boolean;
  /** Target initiated any Verify audit batch. */
  hasInitiatedAudits: boolean;
  /** Target's licenses appear in any audit selection or deficiency. */
  isUnderAudit: boolean;
  /** Target has a ProTrack Pro (Stripe) subscription row. */
  hasProSubscription: boolean;
  /** Target has any ProTrack CE certificate. */
  hasCeCertificates: boolean;
  /** Target's linked company has non-DRAFT applications, courses, issued certs, or billing. */
  companyHasActivity: boolean;
};

export type DeletionDecision = { deletable: true } | { deletable: false; reason: string };

export function evaluateDeletable(facts: DeletionFacts): DeletionDecision {
  if (facts.isSelf) {
    return { deletable: false, reason: "You can't delete your own account." };
  }
  if (facts.isLastActiveAdmin) {
    return { deletable: false, reason: "This is the last active admin, so it can't be deleted." };
  }
  if (facts.hasPerformedAdminActions) {
    return { deletable: false, reason: "This account has performed admin actions. Suspend it instead." };
  }
  if (facts.hasInitiatedAudits) {
    return { deletable: false, reason: "This account has initiated audits. Suspend it instead." };
  }
  if (facts.isUnderAudit) {
    return { deletable: false, reason: "This account appears in an audit. Suspend it instead." };
  }
  if (facts.hasProSubscription) {
    return { deletable: false, reason: "This account has an active subscription. Suspend it instead." };
  }
  if (facts.hasCeCertificates) {
    return { deletable: false, reason: "This account has CE records. Suspend it instead." };
  }
  if (facts.companyHasActivity) {
    return { deletable: false, reason: "This company has accreditation or billing activity. Suspend it instead." };
  }
  return { deletable: true };
}
