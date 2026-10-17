import { SURVEY_FORM_KEY } from "@/lib/events/survey-schemas";

/*
  Stage flow of the event attendee form (components/attend/event-attendee-form.tsx).
  PURE, so the flow is unit-tested without rendering.

  Without an active survey the flow is exactly the certificate flow:
    identity -> affirm -> [select] -> quiz -> review
  With one, the survey comes FIRST and a built-in "Do you need CE credit?"
  step decides the rest (not every attendee needs CE):
    survey -> needsCe -> (Yes) identity -> affirm -> [select] -> quiz -> review
                      -> (No)  contact (name + email, submits the survey only)
  Until the attendee answers needsCe the flow stops there. The survey and
  needsCe stay at indices 0 and 1 whatever the answer, so switching Yes/No
  never moves the attendee or drops their survey answers.
*/

export type AttendStage =
  | "survey"
  | "needsCe"
  | "contact"
  | "identity"
  | "affirm"
  | "select"
  | "quiz"
  | "review";

export function deriveStages({
  selective,
  hasSurvey,
  needsCe,
}: {
  selective: boolean;
  hasSurvey: boolean;
  /** The attendee's CE answer; null until answered. Ignored without a survey. */
  needsCe: boolean | null;
}): AttendStage[] {
  const certificate: AttendStage[] = [
    "identity",
    "affirm",
    ...(selective ? (["select"] as const) : []),
    "quiz",
    "review",
  ];
  if (!hasSurvey) return certificate;
  const head: AttendStage[] = ["survey", "needsCe"];
  if (needsCe === null) return head;
  return needsCe ? [...head, ...certificate] : [...head, "contact"];
}

// Which stage each server-validated field lives on, so an invalid submission
// can jump back to the first stage the attendee needs to fix.
const FIELD_STAGE: Record<string, AttendStage> = {
  attendeeName: "identity",
  attendeeEmail: "identity",
  completionDate: "identity",
  courseFormat: "identity",
  licenseNumber: "identity",
  licenseType: "identity",
  licenseStates: "identity",
  affirmed: "affirm",
  selectedSessionIds: "select",
  answers: "quiz",
};

/**
 * The stage a server field error belongs to. Survey errors are keyed
 * "survey.<questionId>" (or "survey" for an unreadable or outdated payload).
 * On the No-CE path name and email live on the contact step.
 */
export function stageOfField(field: string, needsCe: boolean | null): AttendStage | undefined {
  if (field === SURVEY_FORM_KEY || field.startsWith(`${SURVEY_FORM_KEY}.`)) return "survey";
  if (needsCe === false && (field === "attendeeName" || field === "attendeeEmail")) return "contact";
  return FIELD_STAGE[field];
}

/**
 * The index of the earliest stage with a failing field, or null when none of
 * the errors maps to a stage in this flow (token or unknown fields, or a stage
 * this mode does not have, e.g. "select" in full mode).
 */
export function firstFailingStep(
  steps: readonly AttendStage[],
  fieldErrors: Record<string, string[]>,
  needsCe: boolean | null,
): number | null {
  const indices = Object.keys(fieldErrors)
    .map((k) => {
      const st = stageOfField(k, needsCe);
      return st ? steps.indexOf(st) : -1;
    })
    .filter((i) => i >= 0);
  return indices.length ? Math.min(...indices) : null;
}
