import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/portal-shell";
import { requireStaff } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { approveEvent, rejectEvent } from "@/lib/reviewer/event-actions";
import { reopenEvent } from "@/lib/reviewer/reopen-actions";
import {
  isEventOnly,
  eventOrgFields,
  sessionCourseInfoReadSchema,
  eventSessionApplicationReadSchema,
} from "@/lib/forms/event/schemas";
import {
  applicationDataReadSchema,
  type ApplicationDataRead,
} from "@/lib/forms/application/schemas";
import {
  courseInfoRows,
  creatorRows,
  organizationRows,
  presenterRows,
  sessionCourseInfoRows,
} from "@/lib/forms/application/detail-rows";
import {
  DetailRowsList,
  DetailSection,
  QuizPreviewCard,
} from "@/components/application-form/detail-section";
import type { EventType } from "@prisma/client";

const TYPE_LABEL: Record<EventType, string> = {
  FULL_EVENT_QUIZ: "Full attendance · sessions accredited as courses (not reused)",
  FULL_PER_COURSE: "Full attendance · courses reused",
  SELECTIVE_INLINE: "Selective attendance · event only (sessions not reused)",
  SELECTIVE_PER_COURSE: "Selective attendance · courses reused",
};

type StoredQuestion = { question?: string; options?: string[]; correctIndex?: number };
type QuizItem =
  | { type: "TF"; question: string; correctAnswer: "True" | "False" }
  | { type: "MC"; question: string; options: string[]; correctIndex: number };

/*
  Reviewer event detail. Event-only events under the full-course model list each
  inline session as its full course application; SELECTIVE_INLINE events under
  the lightweight model carry a FULL application per session (Course Info +
  Creator + Presenters in event_sessions.course_info) plus one MC question each;
  per-course events list their attached courses. Legacy pre-July-2026 events
  additionally have an event-level application under eventData.eventApplication.

  EVERY session's application renders EXPANDED by default. On 2026-07-29 a
  reviewer rejected a complete 8-session event with "Where is the information
  about the company? These are only the test questions", because the course
  info sat behind eight unopened <details> and the org fields were never
  rendered at all. `?expand=collapsed` is the opt-out, not the default, and
  the collapse state is server-rendered (no client JS), mirroring the existing
  ?tab= pattern on the company event page.
*/
export default async function ReviewEventPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; expand?: string }>;
}) {
  await requireStaff("REVIEWER");
  const { id } = await params;
  const { error, expand } = await searchParams;
  const expanded = expand !== "collapsed";

  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      company: { select: { name: true } },
      sessions: {
        orderBy: { position: "asc" },
        include: {
          course: { select: { courseIdNumber: true, application: { select: { courseTitle: true, ceHours: true } } } },
        },
      },
      sessionApplications: {
        orderBy: { sessionPosition: "asc" },
        select: { id: true, sessionPosition: true, applicationData: true },
      },
    },
  });
  if (!event) notFound();

  const data = (event.eventData as Record<string, unknown>) ?? {};
  const quiz = (data.quiz as QuizItem[] | undefined) ?? [];
  const pending = event.status === "PENDING";
  const eventOnly = event.eventType ? isEventOnly(event.eventType) : false;

  // Full-course model: parse each session's full application for display.
  const sessionApps = event.sessionApplications.map((a) => {
    // Event sessions carry a single MC question, so parse with the event read
    // schema (variable-length quiz); the shared read schema stays strict-5.
    const parsed = eventSessionApplicationReadSchema.safeParse(a.applicationData);
    return { id: a.id, position: a.sessionPosition ?? 0, parsed };
  });
  const showSessionApps = eventOnly && sessionApps.length > 0;

  // Lightweight SELECTIVE_INLINE events carry the event-level application
  // content (Course Info + Creator + Presenters, no quiz — the per-session
  // questions replace it) under eventData.eventApplication. Tolerant read;
  // events approved before the step existed simply lack the key.
  const eventAppParsed = data.eventApplication
    ? applicationDataReadSchema.omit({ quiz: true }).safeParse(data.eventApplication)
    : null;
  const eventApp: ApplicationDataRead | null = eventAppParsed?.success
    ? { ...eventAppParsed.data, quiz: [] }
    : null;
  const statedHours = eventApp?.ceCreditHours ?? null;
  const operativeHours = event.totalHours != null ? Number(event.totalHours) : null;

  // Org/contact lives on eventData for events (there is no application blob).
  const orgRows = organizationRows(eventOrgFields(event.eventData));

  // Pre-parse each inline session once: the list needs both the rendered rows
  // and a per-session completeness summary, and parsing twice would drift.
  const inlineSessions = event.sessions.map((s, i) => {
    const full = applicationDataReadSchema.omit({ quiz: true }).safeParse(s.courseInfo ?? {});
    const fullData: ApplicationDataRead | null = full.success
      ? { ...full.data, quiz: [] }
      : null;
    const legacy = fullData ? null : sessionCourseInfoReadSchema.safeParse(s.courseInfo ?? {});
    const legacyRows = legacy && legacy.success ? sessionCourseInfoRows(legacy.data) : [];
    const q = (s.question as StoredQuestion | null) ?? {};
    return {
      row: s,
      index: i,
      anchor: `session-${i + 1}`,
      q,
      fullData,
      legacyRows,
      presenterCount: fullData?.presenters?.length ?? 0,
      hasQuestion: Boolean(q.question && (q.options ?? []).length > 0),
    };
  });

  return (
    <>
      <PageHeader
        title={`Review Event — ${event.name}`}
        subtitle={`${event.company.name} · ${event.eventDate}`}
        action={
          <Link href="/reviewer" className="rounded-md border border-border bg-white px-3 py-1.5 text-[11px] font-semibold text-navy hover:bg-surface">
            ← Back to Queue
          </Link>
        }
      />

      <div className="space-y-4">
        <div className="rounded-lg border border-border bg-white p-5 text-[12px]">
          <dl className="space-y-1.5">
            <Row label="Status" value={event.status} />
            <Row label="Type" value={event.eventType ? TYPE_LABEL[event.eventType] : "—"} />
            <Row label="Total hours" value={event.totalHours ? Number(event.totalHours).toFixed(1) : "—"} />
            {event.eventIdNumber ? <Row label="Event ID" value={event.eventIdNumber} /> : null}
          </dl>
        </div>

        {/* The provider's org + contact, the same section the standalone
            application review shows. Previously only name/admin appeared, as
            two rows inside the status box, so address and phone were invisible. */}
        {orgRows.length > 0 ? (
          <DetailSection title="Organization & Contact" rows={orgRows} />
        ) : (
          <div className="rounded-lg border border-orange-300 bg-orange-50 p-4 text-[12px] text-orange-700">
            This event has no organization or contact details recorded.
          </div>
        )}

        {showSessionApps ? (
          <div className="rounded-lg border border-border bg-white p-5">
            <p className="mb-1 text-[13px] font-semibold text-navy">
              Sessions ({sessionApps.length}) — each accredited as its own course
            </p>
            <p className="mb-3 flex flex-wrap items-baseline justify-between gap-2 text-[11px] text-text-muted">
              <span>
                Approving the event accredits every session below (one Course ID
                each) and issues the combined event ID.
              </span>
              <Link
                href={`/reviewer/events/${event.id}${expanded ? "?expand=collapsed" : ""}`}
                className="font-semibold text-ace-dark underline"
              >
                {expanded ? "Collapse all sessions" : "Expand all sessions"}
              </Link>
            </p>
            <div className="space-y-3">
              {/* open={expanded}, not open={i === 0}: opening only the first
                  session is what let a reviewer miss 7 of 8 applications. */}
              {sessionApps.map((s, i) => (
                <details key={s.id} className="rounded-md border border-border" open={expanded}>
                  <summary className="cursor-pointer px-3 py-2 text-[12px] font-semibold text-navy">
                    {i + 1}.{" "}
                    {s.parsed.success ? s.parsed.data.courseTitle : "Session (unreadable)"}
                    {s.parsed.success ? (
                      <span className="font-normal text-text-muted">
                        {" "}· {s.parsed.data.ceCreditHours.toFixed(1)} hrs
                      </span>
                    ) : null}
                  </summary>
                  {s.parsed.success ? (
                    <div className="space-y-4 border-t border-border p-3">
                      <DetailSection title="Course Information" rows={courseInfoRows(s.parsed.data)} />
                      <DetailSection title="Course Creator" rows={creatorRows(s.parsed.data)} />
                      <DetailSection title="Presenters" rows={presenterRows(s.parsed.data)} />
                      <QuizPreviewCard title="Quiz" quiz={s.parsed.data.quiz} />
                    </div>
                  ) : (
                    <p className="border-t border-border p-3 text-[12px] text-red-600">
                      This session&apos;s application could not be read.
                    </p>
                  )}
                </details>
              ))}
            </div>
          </div>
        ) : event.eventType === "SELECTIVE_INLINE" ? (
          <>
            {eventApp ? (
              <>
                {/* Only the two pre-July-2026 events have an event-level
                    application. Label it so a reviewer does not mistake it for
                    the whole submission. */}
                <DetailSection
                  title="Event-level application (legacy)"
                  rows={courseInfoRows(eventApp, { outlineLabel: "Event Outline" })}
                />
                <DetailSection title="Course Creator (legacy)" rows={creatorRows(eventApp)} />
                <DetailSection title="Presenters (legacy)" rows={presenterRows(eventApp)} />
              </>
            ) : (
              // Rendering nothing here made the page look empty above the
              // questions, which is how a complete submission read as "only the
              // test questions".
              <div className="rounded-lg border border-ver bg-ver-bg p-4 text-[12px] text-ver-dark text-pretty">
                This event&apos;s course information is captured{" "}
                <strong>per session</strong>. Each of the {inlineSessions.length}{" "}
                sessions below carries its own full application (Course
                Information, Course Creator, and Presenters) plus one multiple
                choice question. They are expanded below.
              </div>
            )}
            <div className="rounded-lg border border-border bg-white p-5">
              <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-[13px] font-semibold text-navy">
                  Sessions ({inlineSessions.length}) · each with a full course
                  application and one question
                </p>
                <Link
                  href={`/reviewer/events/${event.id}${expanded ? "?expand=collapsed" : ""}`}
                  className="text-[11px] font-semibold text-ace-dark underline"
                >
                  {expanded ? "Collapse all sessions" : "Expand all sessions"}
                </Link>
              </div>
              <p className="mb-3 text-[11px] text-text-muted">
                Attendees answer one question per attended session; a correct
                answer earns that session&apos;s hours on the certificate.
                {statedHours != null && operativeHours != null && statedHours !== operativeHours
                  ? ` Certificate hours come from the session durations below (${operativeHours.toFixed(1)} total), not the stated CE Credit Hours.`
                  : ""}
              </p>

              {/* Jump list: 8 fully-expanded sessions is a long page. */}
              {inlineSessions.length > 1 ? (
                <p className="mb-3 text-[11px] text-text-muted">
                  Jump to:{" "}
                  {inlineSessions.map((s, i) => (
                    <span key={s.row.id}>
                      {i > 0 ? " · " : ""}
                      <a href={`#${s.anchor}`} className="text-ace-dark underline">
                        {i + 1}. {s.row.name ?? "(untitled)"}
                      </a>
                    </span>
                  ))}
                </p>
              ) : null}

              <ul className="space-y-3">
                {inlineSessions.map((s) => (
                  <li
                    key={s.row.id}
                    id={s.anchor}
                    className="scroll-mt-4 rounded-md border border-border p-3 text-[12px]"
                  >
                    <p className="font-semibold text-navy">
                      {s.index + 1}. {s.row.name}{" "}
                      <span className="font-normal text-text-muted">
                        · {s.row.durationHours ? Number(s.row.durationHours).toFixed(1) : "?"} hrs
                      </span>
                    </p>

                    {/* Completeness ribbon: makes "these are only the test
                        questions" impossible to conclude at a glance. */}
                    <p className="mt-1 text-[11px] text-text-muted">
                      {s.fullData ? (
                        <>
                          <span className="text-green-700">Course info ✓</span> ·{" "}
                          <span className="text-green-700">Creator ✓</span> ·{" "}
                          <span className="text-green-700">
                            Presenters ({s.presenterCount}) ✓
                          </span>
                        </>
                      ) : s.legacyRows.length > 0 ? (
                        <span className="text-green-700">Course info ✓</span>
                      ) : (
                        <span className="text-orange-600">No course information</span>
                      )}
                      {" · "}
                      {s.hasQuestion ? (
                        <span className="text-green-700">Question ✓</span>
                      ) : (
                        <span className="text-orange-600">No question</span>
                      )}
                    </p>

                    <p className="mt-2 text-text-mid">{s.q.question}</p>
                    <ol className="mt-1 list-inside list-decimal text-text-muted">
                      {(s.q.options ?? []).map((opt, i) => (
                        <li key={i} className={i === s.q.correctIndex ? "font-semibold text-green-700" : ""}>
                          {opt}{i === s.q.correctIndex ? " ✓" : ""}
                        </li>
                      ))}
                    </ol>

                    {s.fullData ? (
                      <details open={expanded} className="mt-2 rounded-md border border-border">
                        <summary className="cursor-pointer px-3 py-2 text-[12px] font-semibold text-navy">
                          Full course application: Course Information, Course
                          Creator, and {s.presenterCount}{" "}
                          {s.presenterCount === 1 ? "presenter" : "presenters"}
                        </summary>
                        <div className="space-y-4 border-t border-border bg-white p-3">
                          <DetailSection title="Course Information" rows={courseInfoRows(s.fullData)} />
                          <DetailSection title="Course Creator" rows={creatorRows(s.fullData)} />
                          <DetailSection title="Presenters" rows={presenterRows(s.fullData)} />
                        </div>
                      </details>
                    ) : s.legacyRows.length > 0 ? (
                      <details open={expanded} className="mt-2 rounded-md border border-border">
                        <summary className="cursor-pointer px-3 py-2 text-[12px] font-semibold text-navy">
                          Course information
                        </summary>
                        <div className="border-t border-border bg-white">
                          <DetailRowsList rows={s.legacyRows} />
                        </div>
                      </details>
                    ) : (
                      <p className="mt-2 text-[11px] text-text-muted">
                        This session predates per-session course information.
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </>
        ) : event.eventType !== "FULL_EVENT_QUIZ" ? (
          <div className="rounded-lg border border-border bg-white p-5">
            <p className="mb-3 text-[13px] font-semibold text-navy">Attached courses</p>
            <ul className="space-y-1 text-[12px]">
              {event.sessions.map((s) => (
                <li key={s.id} className="flex justify-between gap-4">
                  <span className="text-text-mid">{s.course?.application.courseTitle ?? "(course)"}</span>
                  <span className="font-mono text-[11px] text-text-muted">{s.course?.courseIdNumber}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-white p-5">
            <p className="mb-3 text-[13px] font-semibold text-navy">Event Quiz (legacy)</p>
            <ol className="space-y-3 text-[12px]">
              {quiz.map((q, i) => (
                <li key={i}>
                  <p className="font-semibold text-navy">Q{i + 1}. {q.question}</p>
                  {q.type === "TF" ? (
                    <p className="text-text-muted">Correct: <span className="font-semibold text-green-700">{q.correctAnswer}</span></p>
                  ) : (
                    <ol className="list-inside list-decimal text-text-muted">
                      {q.options.map((opt, j) => (
                        <li key={j} className={j === q.correctIndex ? "font-semibold text-green-700" : ""}>
                          {opt}{j === q.correctIndex ? " ✓" : ""}
                        </li>
                      ))}
                    </ol>
                  )}
                </li>
              ))}
            </ol>
          </div>
        )}

        {pending ? (
          <div className="grid gap-4 md:grid-cols-2">
            <form action={approveEvent} className="rounded-lg border border-green-300 bg-green-50/40 p-4">
              <input type="hidden" name="eventId" value={event.id} />
              <p className="mb-2 text-[13px] font-semibold text-navy">Approve</p>
              <textarea
                name="reviewerNotes"
                placeholder="Optional notes"
                className="w-full rounded-md border border-border bg-white px-3 py-2 text-[12px]"
                rows={2}
              />
              <button type="submit" className="mt-2 w-full rounded-md bg-green-700 px-4 py-2 text-[13px] font-semibold text-white hover:bg-green-800">
                Approve event
              </button>
            </form>
            <form action={rejectEvent} className="rounded-lg border border-red-300 bg-red-50/40 p-4">
              <input type="hidden" name="eventId" value={event.id} />
              <p className="mb-2 text-[13px] font-semibold text-navy">Reject</p>
              {error === "reason_required" ? (
                <p className="mb-1 text-[11px] text-red-600">Please give a reason (at least 10 characters).</p>
              ) : null}
              <textarea
                name="reason"
                placeholder="Reason for rejection (sent to the company)"
                className="w-full rounded-md border border-border bg-white px-3 py-2 text-[12px]"
                rows={2}
                required
              />
              <button type="submit" className="mt-2 w-full rounded-md bg-red-700 px-4 py-2 text-[13px] font-semibold text-white hover:bg-red-800">
                Reject event
              </button>
            </form>
          </div>
        ) : event.status === "REJECTED" ? (
          <div className="rounded-lg border border-border bg-white p-5">
            <p className="mb-1 text-[13px] font-semibold text-navy">
              This event was rejected
            </p>
            {event.reviewerNotes ? (
              <p className="mb-3 whitespace-pre-line text-[12px] text-text-mid">
                Reason given: {event.reviewerNotes}
              </p>
            ) : null}
            <p className="mb-3 text-[11px] text-text-muted text-pretty">
              If the decision was wrong, put it back in the queue. The provider
              is told it is under review again, the rejection reason is kept,
              and no credit is charged either way.
            </p>
            {error === "reason_required" ? (
              <p className="mb-2 text-[11px] font-semibold text-red-600">
                Give a reason of at least 10 characters.
              </p>
            ) : null}
            <form action={reopenEvent} className="space-y-2">
              <input type="hidden" name="eventId" value={event.id} />
              <label className="block text-[11px] font-semibold text-text-mid">
                Why are you reopening this? (recorded in the audit log, not sent
                to the provider)
              </label>
              <textarea
                name="reason"
                required
                minLength={10}
                rows={2}
                className="w-full rounded-md border border-border px-3 py-2 text-[12px] text-navy outline-none focus:border-ace focus:ring-2 focus:ring-ace/30"
                placeholder="e.g. The application was complete; the details were collapsed on the review page."
              />
              <button
                type="submit"
                className="rounded-md bg-navy px-4 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-navy/90"
              >
                Reopen for review
              </button>
            </form>
          </div>
        ) : (
          <div className="rounded-md border border-border bg-surface px-4 py-3 text-[12px] text-text-muted">
            This event is {event.status.toLowerCase()}.{event.reviewerNotes ? ` Notes: ${event.reviewerNotes}` : ""}
          </div>
        )}
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-text-muted">{label}</dt>
      <dd className="text-right font-medium text-navy">{value}</dd>
    </div>
  );
}
