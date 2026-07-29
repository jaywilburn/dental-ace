import Link from "next/link";
import { redirect } from "next/navigation";
import { EventType } from "@prisma/client";
import { PageHeader } from "@/components/portal-shell";
import { FormErrorBanner } from "@/components/application-form/form-controls";
import { requireDentalAce } from "@/lib/auth/session";
import { ensureEventDraft, getEventDraft } from "@/lib/events/event-actions";
import {
  addSessionApplication,
  removeSessionApplication,
} from "@/lib/events/session-actions";
import {
  addInlineSession,
  removeInlineSession,
} from "@/lib/events/inline-session-actions";
import { isEventOnly, eventCreditCost } from "@/lib/forms/event/schemas";
import { prisma } from "@/lib/prisma";

/*
  Event wizard, Sessions step (event-only types). Two builders share this step,
  both a server-rendered list of sessions with Add / Edit / Remove:

  - SELECTIVE_INLINE (Opt 3): each session is an inline EventSession row whose
    full application (course info, creator, presenters) + one MC question are
    captured in a per-session mini-wizard (inline-sessions/[sessionId]/...).
  - FULL_EVENT_QUIZ (Opt 1): each session is a full course application captured
    inline (sessions/[sessionAppId]/...), plus one multiple-choice question.

  Both bill one application credit for the whole event at submit, no matter how
  many sessions are added.
*/
export default async function EventSessionsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; detail?: string; eventId?: string }>;
}) {
  const user = await requireDentalAce();
  const { error, detail, eventId: eventIdParam } = await searchParams;
  const idQ = eventIdParam ? `?eventId=${eventIdParam}` : "";
  const eventId = await ensureEventDraft(eventIdParam);
  const draft = await getEventDraft(eventId);
  if (!draft?.eventType) redirect("/company/events/new/qualifiers");
  if (!isEventOnly(draft.eventType)) {
    redirect("/company/events/new/courses");
  }

  // Non-blocking heads-up only. Deliberately NOT a requireApplicationCredits()
  // gate: that redirects to the buy page, which would eject a provider out of a
  // half-built multi-session draft with no way back to it.
  const credits = user.companyId
    ? (
        await prisma.company.findUnique({
          where: { id: user.companyId },
          select: { applicationCredits: true },
        })
      )?.applicationCredits ?? 0
    : 0;
  const lowCredits =
    credits < eventCreditCost(draft.eventType) ? (
      <div className="mb-4 rounded-md border border-orange-300 bg-orange-50 p-3 text-[12px] text-orange-700 text-pretty">
        You have {credits} application credits. You can build this event now, and
        you will need 1 credit to submit it.{" "}
        <Link href="/company/buy/credits" className="font-semibold underline">
          Buy credits
        </Link>
      </div>
    ) : null;

  // Lightweight inline builder (SELECTIVE_INLINE): each session is a full course
  // application captured through its own mini-wizard, stored on event_sessions.
  if (draft.eventType === EventType.SELECTIVE_INLINE) {
    const inline = draft.sessions.filter((s) => s.courseId === null);
    const completeCount = inline.filter((s) => s.complete).length;

    return (
      <>
        <PageHeader title="New Event" subtitle="Step 3 of 4 — Sessions" />
        {error === "validation" ? <FormErrorBanner detail={detail} /> : null}
        {lowCredits}

        <div className="mb-4 rounded-md border border-ver bg-ver-bg p-3 text-[12px] text-ver-dark text-pretty">
          Because these sessions are offered only at this event, the whole event
          is accredited as a single application. Add each session below and
          complete its full course application (course information, creator, and
          presenters) plus one multiple choice question. Attendees can read each
          session&apos;s details, select the sessions they attended, and answer
          each session&apos;s question; a correct answer earns that session&apos;s
          hours on their certificate. Submitting the event uses one application
          credit for the whole event, no matter how many sessions you add.
        </div>

        <div className="space-y-3">
          {inline.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-surface/50 p-6 text-center text-[12px] text-text-muted">
              No sessions yet. Add your first session to begin.
            </div>
          ) : (
            <ul className="space-y-2">
              {inline.map((s, i) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-white px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium text-navy">
                      <span className="text-text-muted">{i + 1}.</span>{" "}
                      {s.name ?? "Untitled session"}
                    </p>
                    <p className="mt-0.5 text-[11px] text-text-muted">
                      {s.durationHours != null
                        ? `${s.durationHours.toFixed(1)} CE hours`
                        : "Hours not set"}
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
                      href={`/company/events/new/inline-sessions/${s.id}/course`}
                      className="font-semibold text-ace-dark underline"
                    >
                      Edit
                    </Link>
                    <form action={removeInlineSession}>
                      <input type="hidden" name="eventId" value={eventId} />
                      <input type="hidden" name="sessionId" value={s.id} />
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

          <form action={addInlineSession}>
            <input type="hidden" name="eventId" value={eventId} />
            <button
              type="submit"
              className="w-full rounded-lg border border-dashed border-ace/50 bg-ace-bg/40 px-4 py-3 text-[13px] font-semibold text-ace-dark transition-colors hover:bg-ace-bg"
            >
              + Add {inline.length === 0 ? "a" : "another"} session
            </button>
          </form>
        </div>

        <div className="mt-6 flex items-center justify-between">
          <Link
            href={`/company/events/new/qualifiers${idQ}`}
            className="text-[13px] font-semibold text-text-muted hover:text-navy"
          >
            ← Back
          </Link>
          {inline.length > 0 && completeCount === inline.length ? (
            <Link
              href={`/company/events/new/review${idQ}`}
              className="rounded-md bg-navy px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-navy/90"
            >
              Next: Review &amp; Submit
            </Link>
          ) : (
            <span className="text-[11px] text-text-muted">
              {inline.length === 0
                ? "Add at least one session to continue."
                : `${completeCount}/${inline.length} sessions complete — finish each to continue.`}
            </span>
          )}
        </div>
      </>
    );
  }

  // Full-course builder (FULL_EVENT_QUIZ): each session is a full application.
  const sessions = draft.sessionApplications;
  const completeCount = sessions.filter((s) => s.complete).length;

  return (
    <>
      <PageHeader title="New Event" subtitle="Step 3 of 4 — Sessions" />
      {error === "validation" ? <FormErrorBanner detail={detail} /> : null}
      {lowCredits}

      <div className="mb-4 rounded-md border border-ver bg-ver-bg p-3 text-[12px] text-ver-dark text-pretty">
        Because you are not reusing these sessions as standalone courses, each one
        is accredited as its own course. Add every session below and complete its
        full application (course info, creator, presenters, and one multiple
        choice question). Attendees answer one question per session and their
        certificate shows the full event hours. Submitting the event uses one
        application credit for the whole event, no matter how many sessions you
        add.
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
                    className="font-semibold text-ace-dark underline"
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
          href={`/company/events/new/qualifiers${idQ}`}
          className="text-[13px] font-semibold text-text-muted hover:text-navy"
        >
          ← Back
        </Link>
        {sessions.length > 0 && completeCount === sessions.length ? (
          <Link
            href={`/company/events/new/review${idQ}`}
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
