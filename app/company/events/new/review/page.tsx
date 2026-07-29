import Link from "next/link";
import { redirect } from "next/navigation";
import { EventType } from "@prisma/client";
import { PageHeader } from "@/components/portal-shell";
import { FormNav } from "@/components/application-form/form-controls";
import { requireDentalAce } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { ensureEventDraft, getEventDraft, submitEvent } from "@/lib/events/event-actions";
import { isInlineFullCourse, eventCreditCost } from "@/lib/forms/event/schemas";

const TYPE_LABEL: Record<EventType, string> = {
  FULL_EVENT_QUIZ: "Full attendance · sessions accredited as courses (not reused)",
  FULL_PER_COURSE: "Full attendance · courses reused (per-course accreditation)",
  SELECTIVE_INLINE: "Selective attendance · event only (sessions not reused)",
  SELECTIVE_PER_COURSE: "Selective attendance · courses reused (per-course accreditation)",
};

/*
  Event wizard, final step: Review & Submit (step 4 of 4). Event-only types bill
  one application credit for the WHOLE event, no matter how many sessions it
  lists: both FULL_EVENT_QUIZ and SELECTIVE_INLINE capture each session as a
  full course application (the former as a CourseApplication row, the latter
  inline on event_sessions), but the event is accredited as a single
  application. The quote below and the charge in submitEvent both come from
  eventCreditCost so they cannot drift. Per-course types remain free (their
  courses were already paid).
*/
export default async function EventReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireDentalAce();
  const { error } = await searchParams;
  const eventId = await ensureEventDraft();
  const draft = await getEventDraft(eventId);
  if (!draft?.eventType) redirect("/company/events/new/qualifiers");
  const type = draft.eventType;
  const inlineFull = isInlineFullCourse(type); // FULL_EVENT_QUIZ
  const lightweightInline = type === EventType.SELECTIVE_INLINE;
  const eventOnly = inlineFull || lightweightInline;

  // Per-course types attach existing courses; titles for the summary.
  const courseIds = draft.sessions.map((s) => s.courseId).filter(Boolean) as string[];
  const courses = courseIds.length
    ? await prisma.accreditedCourse.findMany({
        where: { id: { in: courseIds } },
        select: { id: true, courseIdNumber: true, application: { select: { courseTitle: true } } },
      })
    : [];

  const sessionApps = draft.sessionApplications;
  const inlineSessions = lightweightInline
    ? draft.sessions.filter((s) => s.courseId === null)
    : [];
  const sessionCount = lightweightInline ? inlineSessions.length : sessionApps.length;
  // Each session's full application + question must pass the strict schemas
  // here (mirrors the submitEvent gate); draft.sessions[].complete already
  // runs isInlineSessionComplete.
  const allComplete = lightweightInline
    ? inlineSessions.length > 0 && inlineSessions.every((s) => s.complete)
    : sessionApps.length > 0 && sessionApps.every((s) => s.complete);
  // Same helper submitEvent charges with, so the quote can never drift from the
  // amount actually taken.
  const creditCost = eventCreditCost(type);
  const inlineHours = lightweightInline
    ? inlineSessions.reduce((sum, s) => sum + (s.durationHours ?? 0), 0)
    : sessionApps.reduce((sum, s) => sum + (s.ceHours ?? 0), 0);
  const displayHours = eventOnly ? inlineHours : draft.totalHours ?? 0;

  const credits = user.companyId
    ? (await prisma.company.findUnique({ where: { id: user.companyId }, select: { applicationCredits: true } }))
        ?.applicationCredits ?? 0
    : 0;

  const backHref = eventOnly
    ? "/company/events/new/sessions"
    : "/company/events/new/courses";

  return (
    <>
      <PageHeader
        title="New Event"
        subtitle="Step 4 of 4 — Review & Submit"
      />
      {error === "rate_limited" ? (
        <div className="mb-4 rounded-md border border-red-300 bg-red-50 px-4 py-2.5 text-[12px] text-red-700">
          Too many submissions. Please wait a moment and try again.
        </div>
      ) : null}
      {error === "credits" ? (
        <div className="mb-4 rounded-md border border-red-300 bg-red-50 px-4 py-2.5 text-[12px] text-red-700">
          Not enough application credits for this event. Buy more credits and try again.
        </div>
      ) : null}

      <div className="space-y-4">
        <div className="rounded-lg border border-border bg-white p-5">
          <h2 className="text-[15px] font-semibold text-navy">{draft.name}</h2>
          <p className="mt-0.5 text-[12px] text-text-muted">{draft.eventDate}</p>
          <dl className="mt-3 space-y-1.5 text-[12px]">
            <div className="flex justify-between gap-4">
              <dt className="text-text-muted">Event type</dt>
              <dd className="text-right font-medium text-navy">{TYPE_LABEL[type]}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-text-muted">Total hours</dt>
              <dd className="font-medium text-navy">{displayHours ? displayHours.toFixed(1) : "—"}</dd>
            </div>
          </dl>
        </div>

        {lightweightInline ? (
          <div className="rounded-lg border border-border bg-white p-5">
            <p className="mb-2 text-[13px] font-semibold text-navy">
              Sessions ({sessionCount}) · full application + one question each
            </p>
            <ul className="space-y-1 text-[12px] text-text-mid">
              {inlineSessions.map((s) => (
                <li key={s.id} className="flex justify-between gap-4">
                  <span>
                    {s.name ?? "(untitled session)"}
                    {!s.complete ? (
                      <span className="ml-2 font-semibold text-orange-600">⚠ incomplete</span>
                    ) : null}
                  </span>
                  <span className="tabular-nums text-text-muted">
                    {s.durationHours != null ? `${s.durationHours.toFixed(1)} hrs` : "—"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : inlineFull ? (
          <div className="rounded-lg border border-border bg-white p-5">
            <p className="mb-2 text-[13px] font-semibold text-navy">
              Sessions ({sessionCount}) — each accredited as a course
            </p>
            <ul className="space-y-1 text-[12px] text-text-mid">
              {sessionApps.map((s) => (
                <li key={s.id} className="flex justify-between gap-4">
                  <span>
                    {s.courseTitle}
                    {!s.complete ? (
                      <span className="ml-2 font-semibold text-orange-600">⚠ incomplete</span>
                    ) : null}
                  </span>
                  <span className="tabular-nums text-text-muted">
                    {s.ceHours != null ? `${s.ceHours.toFixed(1)} hrs` : "—"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-white p-5">
            <p className="mb-2 text-[13px] font-semibold text-navy">Attached courses ({courses.length})</p>
            <ul className="space-y-1 text-[12px] text-text-mid">
              {courses.map((c) => (
                <li key={c.id} className="flex justify-between gap-4">
                  <span>{c.application.courseTitle ?? "(untitled)"}</span>
                  <span className="font-mono text-[11px] text-text-muted">{c.courseIdNumber}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="rounded-md border border-ace/40 bg-ace-bg p-3 text-[12px] text-ace-dark text-pretty">
          {eventOnly
            ? `Submitting this event uses ${creditCost} application credit for the whole event, no matter how many sessions it has. You have ${credits}. It then goes to AADB for review.`
            : "This event attaches courses you already had accredited, so submitting it uses no credits. It then goes to AADB for review."}
        </div>

        {eventOnly && !allComplete ? (
          <div className="rounded-md border border-orange-300 bg-orange-50 p-3 text-[12px] text-orange-700">
            {sessionCount === 0
              ? "Add at least one session before submitting."
              : "Every session must be complete before you can submit."}{" "}
            <Link href={backHref} className="font-semibold underline">
              Back to sessions
            </Link>
          </div>
        ) : (
          <form action={submitEvent}>
            <input type="hidden" name="eventId" value={eventId} />
            <FormNav back={{ href: backHref, label: "Back" }} nextLabel="Submit for Review" />
          </form>
        )}
      </div>
    </>
  );
}
