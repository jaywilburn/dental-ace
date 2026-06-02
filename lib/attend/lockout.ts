/*
  Pure attempt/retake/lockout decision. The PRD allows one retake: an attendee
  gets the original attempt plus one more, then is locked out of this course.
  Identity is (course_id + lowercased email); the caller supplies the counts.
*/

export const MAX_ATTEMPTS = 2; // original + one retake

export type PriorAttempts = {
  passedExists: boolean;
  failedCount: number;
};

export type AttemptDecision =
  | { kind: "already_certified" }
  | { kind: "locked_out" }
  | { kind: "allowed"; isFinalAttempt: boolean };

export function decideAttempt(prior: PriorAttempts): AttemptDecision {
  if (prior.passedExists) return { kind: "already_certified" };
  if (prior.failedCount >= MAX_ATTEMPTS) return { kind: "locked_out" };
  return { kind: "allowed", isFinalAttempt: prior.failedCount === MAX_ATTEMPTS - 1 };
}
