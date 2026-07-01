import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/portal-shell";
import { FormErrorBanner } from "@/components/application-form/form-controls";
import { requireDentalAce } from "@/lib/auth/session";
import { ensureEventDraft, getEventDraft } from "@/lib/events/event-actions";
import {
  addSessionApplication,
  removeSessionApplication,
} from "@/lib/events/session-actions";
import { isInlineFullCourse, isSelective } from "@/lib/forms/event/schemas";

/*
  Event wizard, Sessions step (event-only full-course path, Opt 1 & 3). Each
  session is a full course application captured inline; this page lists them with
  a completeness badge and Add / Edit / Remove. Coverage (FULL vs SELECTIVE) only
  changes the intro copy and later attendee/cert logic.
*/
export default async function EventSessionsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; detail?: string }>;
}) {
  await requireDentalAce();
  const { error, detail } = await searchParams;
  const eventId = await ensureEventDraft();
  const draft = await getEventDraft(eventId);
  if (!draft?.eventType) redirect("/company/events/new/qualifiers");
  if (!isInlineFullCourse(draft.eventType)) {
    redirect("/company/events/new/courses");
  }

  const sessions = draft.sessionApplications;
  const completeCount = sessions.filter((s) => s.complete).length;
  const selective = isSelective(draft.eventType);

  return (
    <>
      <PageHeader title="New Event" subtitle="Step 3 of 4 — Sessions" />
      {error === "validation" ? <FormErrorBanner detail={detail} /> : null}

      <div className="mb-4 rounded-md border border-ver bg-ver-bg p-3 text-[12px] text-ver-dark text-pretty">
        Because you are not reusing these sessions as standalone courses, each one
        is accredited as its own course. Add every session below and complete its
        full application (course info, creator, presenters, and a 5-question
        quiz). {selective
          ? "Attendees pick which sessions they attended and their certificate shows the total hours completed."
          : "Attendees complete every session and their certificate shows the full event hours."}{" "}
        Submitting the event uses one application credit per session.
      </div>

      <div className="space-y-3">
        {sessions.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-surface/50 p-6 text-center text-[12px] text-text-muted">
            No sessions yet. Add your first session to begin.
          </div>
        ) : (
          <ul className="space-y-2">
            {sessions.map((s, i) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-white px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium text-navy">
                    <span className="text-text-muted">{i + 1}.</span> {s.courseTitle}
                  </p>
                  <p className="mt-0.5 text-[11px] text-text-muted">
                    {s.ceHours != null ? `${s.ceHours.toFixed(1)} CE hours` : "Hours not set"}
                    {" · "}
                    {s.complete ? (
                      <span className="font-semibold text-green-700">✓ Complete</span>
                    ) : (
                      <span className="font-semibold text-orange-600">⚠ Incomplete</span>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3 text-[12px]">
                  <Link
                    href={`/company/events/new/sessions/${s.id}/course`}
                    className="font-semibold text-ace underline"
                  >
                    Edit
                  </Link>
                  <form action={removeSessionApplication}>
                    <input type="hidden" name="eventId" value={eventId} />
                    <input type="hidden" name="sessionAppId" value={s.id} />
                    <button
                      type="submit"
                      className="font-semibold text-text-muted hover:text-red-600"
                    >
                      Remove
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}

        <form action={addSessionApplication}>
          <input type="hidden" name="eventId" value={eventId} />
          <button
            type="submit"
            className="w-full rounded-lg border border-dashed border-ace/50 bg-ace-bg/40 px-4 py-3 text-[13px] font-semibold text-ace-dark transition-colors hover:bg-ace-bg"
          >
            + Add {sessions.length === 0 ? "a" : "another"} session
          </button>
        </form>
      </div>

      <div className="mt-6 flex items-center justify-between">
        <Link
          href="/company/events/new/qualifiers"
          className="text-[13px] font-semibold text-text-muted hover:text-navy"
        >
          ← Back
        </Link>
        {sessions.length > 0 && completeCount === sessions.length ? (
          <Link
            href="/company/events/new/review"
            className="rounded-md bg-navy px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-navy/90"
          >
            Next: Review &amp; Submit
          </Link>
        ) : (
          <span className="text-[11px] text-text-muted">
            {sessions.length === 0
              ? "Add at least one session to continue."
              : `${completeCount}/${sessions.length} sessions complete — finish each to continue.`}
          </span>
        )}
      </div>
    </>
  );
}
