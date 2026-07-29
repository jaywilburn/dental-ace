import type { ApplicationStatus } from "@prisma/client";

/*
  Pure decision rules for reversing a review decision, split out from the server
  action the way lib/admin/override-rules.ts is, so they are unit-testable
  without Prisma.

  Context: on 2026-07-29 a reviewer rejected a complete event because the page
  hid the application. There was no way to undo it. Approve and reject both
  hard-throw unless the item is PENDING, and no admin override existed, so the
  only remedy was a manual database write.
*/

/** Minimum characters for the reason recorded on the audit row. Mirrors the
 *  reject guard, so reversing a decision is as accountable as making one. */
export const REOPEN_REASON_MIN = 10;

/**
 * Only a REJECTED item can be reopened.
 *
 * APPROVED is deliberately excluded. An approved event holds a unique Event ID
 * from a monotonic per-year sequence, a rendered QR and approval letter in
 * storage, a live attendee link, and possibly issued certificates; for
 * FULL_EVENT_QUIZ it has also minted AccreditedCourse rows. Flipping it to
 * PENDING would kill /attend/event/[token] mid-event, and re-approving would
 * allocate a second Event ID. Undoing an approval is a separate revoke feature
 * with its own guards, not this one.
 */
export function canReopen(status: ApplicationStatus): boolean {
  return status === "REJECTED";
}

export function isValidReopenReason(reason: string): boolean {
  return reason.trim().length >= REOPEN_REASON_MIN;
}

/**
 * What a reopen writes.
 *
 * Clears the decision attribution, because the decision no longer stands and
 * leaving it would misattribute a reversed call on the rejected list and the
 * detail page.
 *
 * Deliberately does NOT touch:
 *  - reviewerNotes    the provider still needs to see what was asked for
 *  - submittedAt      keeps the true "days pending" clock; AADB has genuinely
 *                     had this since the original submit, and an inflated
 *                     counter is correct urgency, not a bug
 *  - creditChargedAt  never cleared, anywhere; it is what keeps a revision free
 */
export function reopenPatch(): {
  status: ApplicationStatus;
  reviewedAt: null;
  reviewedById: null;
} {
  return { status: "PENDING", reviewedAt: null, reviewedById: null };
}
