import { redirect } from "next/navigation";
import { PageHeader } from "@/components/portal-shell";
import { FormNav } from "@/components/application-form/form-controls";
import { requireDentalAce } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { ensureEventDraft, getEventDraft, submitEvent } from "@/lib/events/event-actions";
import { isEventOnly } from "@/lib/forms/event/schemas";
import type { EventType } from "@prisma/client";

const TYPE_LABEL: Record<EventType, string> = {
  FULL_EVENT_QUIZ: "Full attendance · single use (one event application, 5-question quiz)",
  FULL_PER_COURSE: "Full attendance · courses reused (per-course accreditation)",
  SELECTIVE_INLINE: "Selective attendance · single use (inline sessions)",
  SELECTIVE_PER_COURSE: "Selective attendance · courses reused (per-course accreditation)",
};

/*
  Event wizard, Step 4 — Review & Submit. Shows the event summary and submits it
  to the reviewer queue. Event-level types (Opt 1 & 3) consume 1 application
  credit on submit; per-course types are free (their courses were already paid).
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

  // Titles for attached courses (per-course types).
  const courseIds = draft.sessions.map((s) => s.courseId).filter(Boolean) as string[];
  const courses = courseIds.length
    ? await prisma.accreditedCourse.findMany({
        where: { id: { in: courseIds } },
        select: { id: true, courseIdNumber: true, application: { select: { courseTitle: true } } },
      })
    : [];
  const consumesCredit = isEventOnly(type);
  const credits = user.companyId
    ? (await prisma.company.findUnique({ where: { id: user.companyId }, select: { applicationCredits: true } }))
        ?.applicationCredits ?? 0
    : 0;

  return (
    <>
      <PageHeader title="New Event" subtitle="Step 4 of 4 — Review & Submit" />
      {error === "rate_limited" ? (
        <div className="mb-4 rounded-md border border-red-300 bg-red-50 px-4 py-2.5 text-[12px] text-red-700">
          Too many submissions. Please wait a moment and try again.
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
              <dd className="font-medium text-navy">{draft.totalHours ? Number(draft.totalHours).toFixed(1) : "—"}</dd>
            </div>
          </dl>
        </div>

        {type === "SELECTIVE_INLINE" ? (
          <div className="rounded-lg border border-border bg-white p-5">
            <p className="mb-2 text-[13px] font-semibold text-navy">Sessions ({draft.sessions.length})</p>
            <ul className="space-y-1 text-[12px] text-text-mid">
              {draft.sessions.map((s) => (
                <li key={s.id} className="flex justify-between gap-4">
                  <span>{s.name ?? "(unnamed)"}</span>
                  <span className="tabular-nums text-text-muted">{s.durationHours?.toFixed(1)} hrs</span>
                </li>
              ))}
            </ul>
          </div>
        ) : type !== "FULL_EVENT_QUIZ" ? (
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
        ) : null}

        <div className="rounded-md border border-ace/40 bg-ace-bg p-3 text-[12px] text-ace-dark text-pretty">
          {consumesCredit
            ? `Submitting this event uses 1 application credit (you have ${credits}). It then goes to AADB for review.`
            : "This event attaches courses you already had accredited, so submitting it uses no credits. It then goes to AADB for review."}
        </div>

        <form action={submitEvent}>
          <input type="hidden" name="eventId" value={eventId} />
          <FormNav
            back={{
              href:
                type === "FULL_EVENT_QUIZ"
                  ? "/company/events/new/quiz"
                  : type === "SELECTIVE_INLINE"
                    ? "/company/events/new/sessions"
                    : "/company/events/new/courses",
              label: "Back",
            }}
            nextLabel="Submit for Review"
          />
        </form>
      </div>
    </>
  );
}
