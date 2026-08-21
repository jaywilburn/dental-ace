import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { PageHeader } from "@/components/portal-shell";
import { requireDentalAce } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { reviseEvent } from "@/lib/company/resubmit-actions";
import { eventAssetUrls, eventAssetsReady } from "@/lib/events/event-assets";
import {
  sessionCourseInfoReadSchema,
  eventSessionApplicationReadSchema,
  eventOrgFields,
} from "@/lib/forms/event/schemas";
import {
  applicationDataReadSchema,
  type ApplicationDataRead,
} from "@/lib/forms/application/schemas";
import {
  courseInfoRows,
  organizationRows,
  creatorRows,
  presenterRows,
  sessionCourseInfoRows,
} from "@/lib/forms/application/detail-rows";
import {
  DetailRowsList,
  DetailSection,
  QuizPreviewCard,
} from "@/components/application-form/detail-section";
import type { ApplicationStatus, EventType } from "@prisma/client";

/*
  Company-facing event detail: everything a CE provider submitted for an event,
  readable after submission (drafts resume through the wizard). Tabbed via
  ?tab= links (server-rendered, no client JS): Event Details (summary + the
  event-level application), Courses (each session's course information), and
  Assets (attendee link, QR, approval letter, marketing logo once approved).
  Viewing never touches credits; guarded by the DentalACE entitlement plus the
  company-ownership check in the query.
*/

const idSchema = z.string().uuid();

const TABS = ["details", "courses", "assets"] as const;
type Tab = (typeof TABS)[number];

const TAB_LABEL: Record<Tab, string> = {
  details: "Event Details",
  courses: "Courses",
  assets: "Assets",
};

const TYPE_LABEL: Record<EventType, string> = {
  FULL_EVENT_QUIZ: "Full attendance · sessions accredited as courses (not reused)",
  FULL_PER_COURSE: "Full attendance · courses reused (per-course accreditation)",
  SELECTIVE_INLINE: "Selective attendance · event only (sessions not reused)",
  SELECTIVE_PER_COURSE: "Selective attendance · courses reused (per-course accreditation)",
};

const STATUS_STYLE: Record<ApplicationStatus, string> = {
  DRAFT: "bg-surface-2 text-text-mid",
  PENDING: "bg-ace-bg text-ace-dark",
  APPROVED: "bg-green-100 text-green-700",
  REJECTED: "bg-red-100 text-red-700",
};

type StoredQuestion = { question?: string; options?: string[]; correctIndex?: number };

function fmtDate(d: Date | null): string | null {
  return d
    ? d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : null;
}

export default async function CompanyEventDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await requireDentalAce();
  const { id } = await params;
  const { tab: rawTab } = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(rawTab ?? "")
    ? (rawTab as Tab)
    : "details";

  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success || !user.companyId) notFound();

  const event = await prisma.event.findFirst({
    where: { id: parsedId.data, companyId: user.companyId },
    include: {
      company: { select: { name: true } },
      sessions: {
        orderBy: { position: "asc" },
        include: {
          course: {
            select: {
              courseIdNumber: true,
              application: { select: { courseTitle: true, ceHours: true } },
            },
          },
        },
      },
      sessionApplications: {
        orderBy: { sessionPosition: "asc" },
        select: { id: true, sessionPosition: true, applicationData: true },
      },
    },
  });
  if (!event) notFound();
  // Drafts resume through the wizard, same as the list's Continue button.
  if (event.status === "DRAFT") redirect(`/company/events/new?eventId=${event.id}`);

  const data = (event.eventData as Record<string, unknown>) ?? {};
  const orgRows = organizationRows(eventOrgFields(event.eventData));
  const inlineSessions = event.sessions.filter((s) => s.courseId === null);
  const courseBackedSessions = event.sessions.filter((s) => s.courseId !== null);
  // Full-course model: event-only events whose sessions were submitted as full
  // course applications (FULL_EVENT_QUIZ, plus SELECTIVE_INLINE events from
  // before July 2026). Keyed on data shape, matching the reviewer page.
  const sessionApps = event.sessionApplications.map((a) => {
    // Event sessions carry a single MC question, so parse with the event read
    // schema (variable-length quiz); the shared read schema stays strict-5.
    const parsed = eventSessionApplicationReadSchema.safeParse(a.applicationData);
    return { id: a.id, position: a.sessionPosition ?? 0, parsed };
  });
  const showSessionApps = sessionApps.length > 0;

  // SELECTIVE_INLINE event-level application (Course Info + Creator +
  // Presenters, no quiz). Tolerant read; older events simply lack the key.
  const eventAppParsed = data.eventApplication
    ? applicationDataReadSchema.omit({ quiz: true }).safeParse(data.eventApplication)
    : null;
  const eventApp: ApplicationDataRead | null = eventAppParsed?.success
    ? { ...eventAppParsed.data, quiz: [] }
    : null;

  // eventAssetsReady is the single gate for exposing an event's assets; it
  // narrows eventIdNumber/approvedAt/expiresAt to non-null for the call below.
  const approvedAssets =
    tab === "assets" && eventAssetsReady(event)
      ? await eventAssetUrls({
          attendeeLinkToken: event.attendeeLinkToken,
          qrCodeUrl: event.qrCodeUrl,
          approvalLetterUrl: event.approvalLetterUrl,
          eventIdNumber: event.eventIdNumber,
          eventName: event.name,
          companyName: event.company.name,
          totalHours: event.totalHours ? Number(event.totalHours) : 0,
          approvedAt: event.approvedAt,
          expiresAt: event.expiresAt,
        })
      : null;

  return (
    <>
      <PageHeader
        title={event.name || "Event"}
        subtitle={`${event.eventDate}${event.eventType ? ` · ${TYPE_LABEL[event.eventType]}` : ""}`}
        action={
          <Link
            href="/company/events"
            className="rounded-md border border-border bg-white px-3 py-1.5 text-[11px] font-semibold text-navy hover:bg-surface"
          >
            ← Back to Events
          </Link>
        }
      />

      <nav className="mb-5 flex gap-1 border-b border-border" aria-label="Event sections">
        {TABS.map((t) => (
          <Link
            key={t}
            href={`/company/events/${event.id}?tab=${t}`}
            aria-current={tab === t ? "page" : undefined}
            className={
              tab === t
                ? "-mb-px border-b-2 border-ace px-3 py-2 text-[12px] font-semibold text-navy"
                : "-mb-px border-b-2 border-transparent px-3 py-2 text-[12px] font-medium text-text-muted hover:text-navy"
            }
          >
            {TAB_LABEL[t]}
          </Link>
        ))}
      </nav>

      {tab === "details" ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-white p-5 text-[12px]">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-[13px] font-semibold text-navy">Summary</p>
              <span
                className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_STYLE[event.status]}`}
              >
                {event.status}
              </span>
            </div>
            <dl className="space-y-1.5">
              <Row label="Event date" value={event.eventDate || "—"} />
              <Row
                label="Type"
                value={event.eventType ? TYPE_LABEL[event.eventType] : "—"}
              />
              <Row
                label="Total hours"
                value={event.totalHours ? Number(event.totalHours).toFixed(1) : "—"}
              />
              {event.eventIdNumber ? (
                <Row label="Event ID" value={event.eventIdNumber} />
              ) : null}
              {fmtDate(event.submittedAt) ? (
                <Row label="Submitted" value={fmtDate(event.submittedAt)!} />
              ) : null}
              {fmtDate(event.approvedAt) ? (
                <Row label="Approved" value={fmtDate(event.approvedAt)!} />
              ) : null}
              {fmtDate(event.expiresAt) ? (
                <Row label="Expires" value={fmtDate(event.expiresAt)!} />
              ) : null}
            </dl>
            {/* Full org + contact, matching what the reviewer now sees. The
                two summary rows here previously omitted address and phone. */}
            {orgRows.length > 0 ? (
              <div className="mt-4">
                <DetailSection title="Organization & Contact" rows={orgRows} />
              </div>
            ) : null}
            {event.reviewerNotes ? (
              <div
                className={`mt-3 rounded-md border p-3 ${
                  event.status === "REJECTED"
                    ? "border-red-300 bg-red-50"
                    : "border-ace/40 bg-ace-bg"
                }`}
              >
                <p
                  className={`text-[11px] font-semibold ${
                    event.status === "REJECTED" ? "text-red-700" : "text-ace-dark"
                  }`}
                >
                  Reviewer feedback
                  {event.status === "PENDING" ? " (this event is back under review)" : ""}
                </p>
                <p
                  className={`mt-1 whitespace-pre-line text-[12px] leading-relaxed ${
                    event.status === "REJECTED" ? "text-red-700" : "text-ace-dark"
                  }`}
                >
                  {event.reviewerNotes}
                </p>
                {event.status === "REJECTED" ? (
                  <form action={reviseEvent} className="mt-3">
                    <input type="hidden" name="eventId" value={event.id} />
                    <button
                      type="submit"
                      className="rounded-md bg-navy px-4 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-navy/90"
                    >
                      Revise and resubmit
                    </button>
                    <span className="ml-2 text-[11px] text-text-muted">
                      Your original credit still covers this, so no new credit is
                      required.
                    </span>
                  </form>
                ) : null}
              </div>
            ) : null}
          </div>

          {event.eventType === "SELECTIVE_INLINE" && eventApp ? (
            <>
              <DetailSection
                title="Course Information"
                rows={courseInfoRows(eventApp, { outlineLabel: "Event Outline" })}
              />
              <DetailSection title="Course Creator" rows={creatorRows(eventApp)} />
              <DetailSection title="Presenters" rows={presenterRows(eventApp)} />
            </>
          ) : null}
        </div>
      ) : null}

      {tab === "courses" ? (
        <div className="space-y-4">
          {showSessionApps ? (
            <div className="rounded-lg border border-border bg-white p-5">
              <p className="mb-1 text-[13px] font-semibold text-navy">
                Sessions ({sessionApps.length}) · each accredited as its own course
              </p>
              <p className="mb-3 text-[11px] text-text-muted">
                Each session was submitted as a full course application.
              </p>
              <div className="space-y-3">
                {sessionApps.map((s, i) => (
                  <details key={s.id} className="rounded-md border border-border" open={i === 0}>
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
                        <DetailSection
                          title="Course Information"
                          rows={courseInfoRows(s.parsed.data)}
                        />
                        <DetailSection title="Course Creator" rows={creatorRows(s.parsed.data)} />
                        <DetailSection title="Presenters" rows={presenterRows(s.parsed.data)} />
                        <QuizPreviewCard title="Quiz" quiz={s.parsed.data.quiz} />
                      </div>
                    ) : (
                      <p className="border-t border-border p-3 text-[12px] text-red-600">
                        This session&apos;s application could not be displayed. Contact
                        info@dentalace.org if you need it.
                      </p>
                    )}
                  </details>
                ))}
              </div>
            </div>
          ) : event.eventType === "SELECTIVE_INLINE" ? (
            <div className="rounded-lg border border-border bg-white p-5">
              <p className="mb-1 text-[13px] font-semibold text-navy">
                Sessions ({inlineSessions.length}) · course info + one question each
              </p>
              <p className="mb-3 text-[11px] text-text-muted">
                Attendees can read each session&apos;s course information before
                choosing the sessions they attended. A correct answer earns that
                session&apos;s hours on the certificate.
              </p>
              <ul className="space-y-3">
                {inlineSessions.map((s) => {
                  const q = (s.question as StoredQuestion | null) ?? {};
                  // New sessions carry the full front-half application; parse it
                  // as such, else fall back to the legacy step1-only slice.
                  const full = applicationDataReadSchema
                    .omit({ quiz: true })
                    .safeParse(s.courseInfo ?? {});
                  const fullData: ApplicationDataRead | null = full.success
                    ? { ...full.data, quiz: [] }
                    : null;
                  const legacy = fullData
                    ? null
                    : sessionCourseInfoReadSchema.safeParse(s.courseInfo ?? {});
                  const legacyRows =
                    legacy && legacy.success ? sessionCourseInfoRows(legacy.data) : [];
                  return (
                    <li key={s.id} className="rounded-md border border-border p-3 text-[12px]">
                      <p className="font-semibold text-navy">
                        {s.name ?? "(untitled session)"}{" "}
                        <span className="font-normal text-text-muted">
                          · {s.durationHours ? Number(s.durationHours).toFixed(1) : "?"} hrs
                        </span>
                      </p>
                      {fullData ? (
                        <div className="mt-2 space-y-4">
                          <DetailSection title="Course Information" rows={courseInfoRows(fullData)} />
                          <DetailSection title="Course Creator" rows={creatorRows(fullData)} />
                          <DetailSection title="Presenters" rows={presenterRows(fullData)} />
                        </div>
                      ) : legacyRows.length > 0 ? (
                        <div className="mt-2 rounded-md border border-border bg-surface/30">
                          <DetailRowsList rows={legacyRows} />
                        </div>
                      ) : (
                        <p className="mt-2 text-[11px] text-text-muted">
                          This session predates per-session course information.
                        </p>
                      )}
                      {q.question ? (
                        <div className="mt-2">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                            Question
                          </p>
                          <p className="mt-1 text-text-mid">{q.question}</p>
                          <ol className="mt-1 list-inside list-decimal text-text-muted">
                            {(q.options ?? []).map((opt, i) => (
                              <li
                                key={i}
                                className={i === q.correctIndex ? "font-semibold text-green-700" : ""}
                              >
                                {opt}
                                {i === q.correctIndex ? " ✓" : ""}
                              </li>
                            ))}
                          </ol>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : courseBackedSessions.length > 0 ? (
            <div className="rounded-lg border border-border bg-white p-5">
              <p className="mb-3 text-[13px] font-semibold text-navy">
                Attached courses ({courseBackedSessions.length})
              </p>
              <ul className="space-y-1 text-[12px]">
                {courseBackedSessions.map((s) => (
                  <li key={s.id} className="flex justify-between gap-4">
                    <span className="text-text-mid">
                      {s.course?.application.courseTitle ?? "(course)"}
                    </span>
                    <span className="font-mono text-[11px] text-text-muted">
                      {s.course?.courseIdNumber}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="rounded-md border border-border bg-surface px-4 py-3 text-[12px] text-text-muted">
              This event has no session records to show.
            </div>
          )}
        </div>
      ) : null}

      {tab === "assets" ? (
        <div className="space-y-4">
          {approvedAssets ? (
            <div className="rounded-lg border border-border bg-white p-5 text-[12px]">
              <p className="mb-3 text-[13px] font-semibold text-navy">Event assets</p>
              <div className="flex flex-wrap items-start gap-x-6 gap-y-4">
                {approvedAssets.qrViewUrl && approvedAssets.qrDownloadUrl ? (
                  <span className="inline-flex flex-col items-center gap-1">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={approvedAssets.qrViewUrl}
                      alt={`Attendee QR code for ${event.name || event.eventIdNumber}`}
                      width={112}
                      height={112}
                      className="h-28 w-28 rounded-md border border-border bg-white p-1.5"
                    />
                    <a href={approvedAssets.qrDownloadUrl} className="text-ace-dark underline">
                      Download QR
                    </a>
                  </span>
                ) : (
                  <span className="text-text-muted">QR unavailable</span>
                )}
                <div className="space-y-2">
                  <p>
                    <Link
                      href={`/attend/event/${event.attendeeLinkToken}`}
                      className="font-semibold text-ace-dark underline"
                    >
                      Attendee Link
                    </Link>
                    <span className="ml-2 text-text-muted">
                      Share with attendees to claim their certificate.
                    </span>
                  </p>
                  {approvedAssets.letterDownloadUrl ? (
                    <p>
                      <a
                        href={approvedAssets.letterDownloadUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-ace-dark underline"
                      >
                        Approval Letter
                      </a>
                    </p>
                  ) : null}
                  <p>
                    <a
                      href={`/api/events/${event.id}/badge`}
                      className="font-semibold text-ace-dark underline"
                      title="Download marketing logo"
                    >
                      Marketing Logo
                    </a>
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-md border border-border bg-surface px-4 py-3 text-[12px] text-text-muted">
              Assets become available after this event is approved.
            </div>
          )}
        </div>
      ) : null}
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
