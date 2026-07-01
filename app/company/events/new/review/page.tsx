import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/portal-shell";
import { FormNav } from "@/components/application-form/form-controls";
import { requireDentalAce } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { ensureEventDraft, getEventDraft, submitEvent } from "@/lib/events/event-actions";
import { isInlineFullCourse } from "@/lib/forms/event/schemas";
import type { EventType } from "@prisma/client";

const TYPE_LABEL: Record<EventType, string> = {
  FULL_EVENT_QUIZ: "Full attendance · sessions accredited as courses (not reused)",
  FULL_PER_COURSE: "Full attendance · courses reused (per-course accreditation)",
  SELECTIVE_INLINE: "Selective attendance · sessions accredited as courses (not reused)",
  SELECTIVE_PER_COURSE: "Selective attendance · courses reused (per-course accreditation)",
};

/*
  Event wizard, Step 4 — Review & Submit. Event-only types now bill one
  application credit per inline session (each is a full course application);
  per-course types remain free (their courses were already paid).
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
  const inlineFull = isInlineFullCourse(type);

  // Per-course types attach existing courses; titles for the summary.
  const courseIds = draft.sessions.map((s) => s.courseId).filter(Boolean) as string[];
  const courses = courseIds.length
    ? await prisma.accreditedCourse.findMany({
        where: { id: { in: courseIds } },
        select: { id: true, courseIdNumber: true, application: { select: { courseTitle: true } } },
      })
    : [];

  const sessionApps = draft.sessionApplications;
  const sessionCount = sessionApps.length;
  const allComplete = sessionCount > 0 && sessionApps.every((s) => s.complete);
  const creditCost = inlineFull ? sessionCount : 0;
  const inlineHours = sessionApps.reduce((sum, s) => sum + (s.ceHours ?? 0), 0);
  const displayHours = inlineFull ? inlineHours : draft.totalHours ?? 0;

  const credits = user.companyId
    ? (await prisma.company.findUnique({ where: { id: user.companyId }, select: { applicationCredits: true } }))
        ?.applicationCredits ?? 0
    : 0;

  const backHref = inlineFull
    ? "/company/events/new/sessions"
    : "/company/events/new/courses";

  return (
    <>
      <PageHeader title="New Event" subtitle="Step 4 of 4 — Review & Submit" />
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

        {inlineFull ? (
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
          {inlineFull
            ? `Submitting this event uses ${creditCost} application credit${creditCost === 1 ? "" : "s"} (one per session; you have ${credits}). It then goes to AADB for review.`
            : "This event attaches courses you already had accredited, so submitting it uses no credits. It then goes to AADB for review."}
        </div>

        {inlineFull && !allComplete ? (
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
