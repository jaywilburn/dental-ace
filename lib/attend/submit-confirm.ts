/*
  Copy for the "are you sure?" step in front of the attendee Submit button.

  A selective event issues ONE certificate per (event, email): once it exists,
  submitEventAttendance returns already_certified and the attendee cannot come
  back to add sessions. At Smile Together (October 2026) people submitted after
  their first session and were locked out of the rest, so the form now says so
  before the submission is final. Full-attendance events have nothing to add
  later, so they submit without the extra step (null).
*/

export type SubmitConfirmCopy = {
  title: string;
  body: string[];
  confirmLabel: string;
  cancelLabel: string;
};

export function submitConfirmCopy(mode: "full" | "selective"): SubmitConfirmCopy | null {
  if (mode !== "selective") return null;
  return {
    title: "Submit for your certificate?",
    body: [
      "You can only submit once for this event. After you submit, you will not be able to come back and add more sessions.",
      "If you plan to attend more sessions, wait and submit after your last one.",
    ],
    confirmLabel: "Yes, submit now",
    cancelLabel: "Not yet",
  };
}
