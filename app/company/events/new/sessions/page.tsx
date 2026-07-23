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
  eventApplicationStepRoute,
  isEventOnly,
  mcQuestionSchema,
  nextEventApplicationStep,
  sessionCourseInfoReadSchema,
} from "@/lib/forms/event/schemas";
import {
  CATEGORIES,
  COURSE_FORMATS,
  DELIVERY_FORMATS,
} from "@/lib/forms/application/schemas";
import {
  InlineSessionsForm,
  type SessionDraft,
} from "@/components/events/inline-sessions-form";

/*
  Event wizard, Sessions step (event-only types). Two builders share this step:

  - FULL_EVENT_QUIZ (Opt 1): each session is a full course application captured
    inline; this page lists them with a completeness badge and Add/Edit/Remove.
  - SELECTIVE_INLINE (Opt 3): the event is ONE application; each session is a
    lightweight Session/Question/Answer row (title, CE hours, one MC question).
*/
export default async function EventSessionsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; detail?: string; saved?: string }>;
}) {
  await requireDentalAce();
  const { error, detail, saved } = await searchParams;
  const eventId = await ensureEventDraft();
  const draft = await getEventDraft(eventId);
  if (!draft?.eventType) redirect("/company/events/new/qualifiers");
  if (!isEventOnly(draft.eventType)) {
    redirect("/company/events/new/courses");
  }

  // Lightweight inline builder (SELECTIVE_INLINE). The event-level application
  // content (Course Info -> Creator -> Presenters) comes first; route drafts
  // that have not finished it (including pre-rework drafts) into those steps.
  if (draft.eventType === EventType.SELECTIVE_INLINE) {
    const appStep = nextEventApplicationStep(draft.data.eventApplication);
    if (appStep) redirect(eventApplicationStepRoute(appStep));
    const inline = draft.sessions.filter((s) => s.courseId === null);
    const initial: SessionDraft[] = inline.map((s) => {
      const q = mcQuestionSchema.safeParse(s.question);
      const ci = sessionCourseInfoReadSchema.safeParse(s.courseInfo ?? {});
      const info = ci.success ? ci.data : {};
      return {
        // Legacy fallback: sessions saved before per-session course info
        // existed prefill title/hours from the mirrored columns.
        courseTitle: info.courseTitle ?? s.name ?? "",
        ceCreditHours:
          info.ceCreditHours != null
            ? String(info.ceCreditHours)
            : s.durationHours != null
              ? String(s.durationHours)
              : "1",
        subjectMatter: info.subjectMatter ?? CATEGORIES[0],
        deliveryFormat: info.deliveryFormat ?? COURSE_FORMATS[0],
        primaryDistributionFormat:
          info.primaryDistributionFormat ?? DELIVERY_FORMATS[0],
        shortDescription: info.shortDescription ?? "",
        publicProtectionStatement: info.publicProtectionStatement ?? "",
        courseObjectives: info.courseObjectives ?? "",
        courseOutline: info.courseOutline ?? "",
        question: q.success ? q.data.question : "",
        options: q.success ? q.data.options : ["", "", "", ""],
        correctIndex: q.success ? q.data.correctIndex : 0,
      };
    });
    const completeCount = inline.filter((s) => s.complete).length;

    return (
      <>
        <PageHeader title="New Event" subtitle="Step 6 of 7 — Sessions" />
        {error === "validation" ? <FormErrorBanner detail={detail} /> : null}
        {saved === "1" && completeCount < inline.length ? (
          <div className="mb-4 rounded-md border border-emerald-400 bg-emerald-50 px-4 py-2.5 text-[13px] text-emerald-700">
            ✓ Progress saved. {completeCount} of {inline.length} sessions are
            complete. Finish each session&apos;s course information and
            question to submit.
          </div>
        ) : null}

        <div className="mb-4 rounded-md border border-ver bg-ver-bg p-3 text-[12px] text-ver-dark text-pretty">
          Because these sessions are offered only at this event, the whole event
          is accredited as a single application. Each session carries its own
          course information plus one multiple choice question. Attendees can
          read each session&apos;s details, select the sessions they attended,
          and answer each session&apos;s question; a correct answer earns that
          session&apos;s hours on their certificate, and a wrong answer drops
          that session. Submitting the event uses one application credit per
          session. Your work is saved even if a session is not finished yet.
        </div>

        <InlineSessionsForm
          eventId={eventId}
          initial={initial}
          backHref={eventApplicationStepRoute("presenters")}
        />
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

      <div className="mb-4 rounded-md border border-ver bg-ver-bg p-3 text-[12px] text-ver-dark text-pretty">
        Because you are not reusing these sessions as standalone courses, each one
        is accredited as its own course. Add every session below and complete its
        full application (course info, creator, presenters, and a 5-question
        quiz). Attendees complete every session and their certificate shows the
        full event hours. Submitting the event uses one application credit per
        session.
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
