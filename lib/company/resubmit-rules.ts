import type { ApplicationStatus } from "@prisma/client";

/*
  Pure decision rules for provider-side revise and resubmit, split out of
  ./resubmit-actions.ts the way lib/reviewer/reopen-rules.ts is, so the parts
  that decide anything are testable without Prisma.
*/

/**
 * A provider may revise only what was actually rejected.
 *
 * PENDING is excluded because it is still being reviewed; letting a provider
 * pull it back mid-review would drop it out of the queue under the reviewer.
 * APPROVED is excluded because it holds a live accreditation. DRAFT needs no
 * revise at all: the wizard already opens it.
 */
export function canRevise(status: ApplicationStatus): boolean {
  return status === "REJECTED";
}

/**
 * Whether this submission line has already paid its application credit.
 *
 * The single gate for free resubmission (client decision 2026-07-29). Submit
 * charges iff this is false. Loose null check on purpose: the column is
 * nullable and a `select` that omits it yields undefined, and both mean "not
 * charged yet".
 */
export function isCreditSettled(creditChargedAt: Date | null | undefined): boolean {
  return creditChargedAt != null;
}

/**
 * What reviseEvent writes to reopen an event for editing.
 *
 * Clears the decision attribution, which no longer stands. Deliberately does
 * NOT touch reviewerNotes (the provider needs to see what to fix while
 * editing), submittedAt (its presence is what keeps ensureEventDraft from
 * implicitly resuming a settled row), or creditChargedAt (clearing it would
 * re-charge the revision, defeating the whole feature).
 */
export function revisePatch(): {
  status: ApplicationStatus;
  reviewedAt: null;
  reviewedById: null;
} {
  return { status: "DRAFT", reviewedAt: null, reviewedById: null };
}
