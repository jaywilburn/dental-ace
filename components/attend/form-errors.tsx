/*
  Shared field-error pieces for the public attendee forms (course + event).
  The submit actions return { status: "invalid", fieldErrors } with static
  schema messages keyed by field; these render them as a summary callout plus
  inline per-field text so the attendee is never stuck on a generic banner.
*/

export const ATTEND_FIELD_LABELS: Record<string, string> = {
  attendeeName: "Full name",
  attendeeEmail: "Email",
  completionDate: "Completion date",
  courseFormat: "Course format",
  licenseNumber: "License number",
  licenseType: "License type",
  licenseStates: "State of licensure",
  affirmed: "Attendance confirmation",
  answers: "Quiz answers",
  selectedSessionIds: "Sessions attended",
};

/** Folds token/unknown-field errors (nothing the attendee can edit) into one
 *  generic retry entry so the summary never surfaces internal field names. */
export function toDisplayErrors(fieldErrors: Record<string, string[]>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  let hasUnknown = false;
  for (const [key, msgs] of Object.entries(fieldErrors)) {
    if (key in ATTEND_FIELD_LABELS) out[key] = msgs;
    else hasUnknown = true;
  }
  if (hasUnknown && Object.keys(out).length === 0) {
    out.submission = ["Something went wrong with your submission link. Refresh this page and try again."];
  }
  return out;
}

export function FieldError({ messages }: { messages?: string[] }) {
  if (!messages?.length) return null;
  return <p className="mt-1 text-xs text-red-600">{messages[0]}</p>;
}

export function ErrorSummary({ fieldErrors }: { fieldErrors: Record<string, string[]> }) {
  const entries = Object.entries(fieldErrors);
  if (!entries.length) return null;
  return (
    <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4">
      <h2 className="text-sm font-semibold text-slate-900">Please fix the following</h2>
      <ul className="mt-1 space-y-0.5 text-sm text-slate-700">
        {entries.map(([key, msgs]) => (
          <li key={key}>
            {key in ATTEND_FIELD_LABELS ? (
              <>
                <span className="font-medium">{ATTEND_FIELD_LABELS[key]}:</span> {msgs.join(" ")}
              </>
            ) : (
              msgs.join(" ")
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
