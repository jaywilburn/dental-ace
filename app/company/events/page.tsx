import Link from "next/link";
import { PageHeader } from "@/components/portal-shell";
import { requireDentalAce } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { reviseEvent } from "@/lib/company/resubmit-actions";
import { eventAssetUrls, eventAssetsReady } from "@/lib/events/event-assets";
import type { ApplicationStatus, EventType } from "@prisma/client";

/*
  Events index. Events now run through their own accreditation lifecycle
  (DRAFT -> PENDING -> APPROVED), submitted via the wizard at /company/events/new.
  Approved events expose their assets (Weeks 5-6 / milestone M3).
*/

const STATUS_STYLE: Record<ApplicationStatus, string> = {
  DRAFT: "bg-surface-2 text-text-mid",
  PENDING: "bg-ace-bg text-ace-dark",
  APPROVED: "bg-green-100 text-green-700",
  REJECTED: "bg-red-100 text-red-700",
};

const TYPE_SHORT: Record<EventType, string> = {
  FULL_EVENT_QUIZ: "Full · single use",
  FULL_PER_COURSE: "Full · reused",
  SELECTIVE_INLINE: "Selective · single use",
  SELECTIVE_PER_COURSE: "Selective · reused",
};

/* Every ?error= this page can be redirected to, from ensureEventDraft and
   lib/company/resubmit-actions.ts. Without these the redirects were silent:
   the provider landed here with a query param and no explanation, which is the
   same dead end the attendee form had. */
const EVENT_ERRORS: Record<string, string> = {
  draft_not_found:
    "That event draft could not be opened. It may already have been submitted, or it belongs to another company.",
  multiple_drafts:
    "You have more than one event in progress. Open the one you want from the list below.",
  revise_not_found: "That event could not be found.",
  revise_not_allowed:
    "Only a rejected event can be revised. This one is not rejected.",
  revise_failed: "Could not start the revision. Please try again.",
};

export default async function EventsIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ just?: string; error?: string }>;
}) {
  const user = await requireDentalAce();
  const { just, error } = await searchParams;

  const company = user.companyId
    ? await prisma.company.findUnique({ where: { id: user.companyId }, select: { name: true } })
    : null;
  const events = user.companyId
    ? await prisma.event.findMany({
        where: { companyId: user.companyId },
        orderBy: { createdAt: "desc" },
        include: { sessions: { select: { courseId: true } } },
        take: 50,
      })
    : [];

  // Signed download URLs (self-healing) for approved events' QR + approval letter.
  const assets = new Map<
    string,
    { qrViewUrl: string | null; qrDownloadUrl: string | null; letterDownloadUrl: string | null }
  >();
  await Promise.all(
    // eventAssetsReady narrows eventIdNumber/approvedAt/expiresAt to non-null.
    events.filter(eventAssetsReady).map(async (e) => {
      assets.set(
        e.id,
        await eventAssetUrls({
          attendeeLinkToken: e.attendeeLinkToken,
          qrCodeUrl: e.qrCodeUrl,
          approvalLetterUrl: e.approvalLetterUrl,
          eventIdNumber: e.eventIdNumber,
          eventName: e.name,
          companyName: company?.name ?? "",
          totalHours: e.totalHours ? Number(e.totalHours) : 0,
          approvedAt: e.approvedAt,
          expiresAt: e.expiresAt,
        }),
      );
    }),
  );

  return (
    <>
      <PageHeader
        title="Events"
        subtitle="Accredit a multi-session event. Attendees receive one certificate for the event."
        action={
          <Link
            href="/company/events/new"
            className="rounded-md bg-navy px-3.5 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-navy/90"
          >
            + New Event
          </Link>
        }
      />

      {just === "submitted" ? (
        <div className="mb-4 rounded-md border border-emerald-400 bg-emerald-50 px-4 py-2.5 text-[13px] text-emerald-700">
          ✓ Event submitted for review.
        </div>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="mb-4 rounded-md border border-red-300 bg-red-50 px-4 py-2.5 text-[12px] text-red-700"
        >
          {EVENT_ERRORS[error] ?? "Something went wrong. Please try again."}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-lg border border-border bg-white">
        {events.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <p className="text-[13px] font-semibold text-navy">No events yet</p>
            <p className="mx-auto mt-1 max-w-md text-[12px] text-text-muted text-pretty">
              Create an event to bundle multiple sessions into a single
              accredited certificate for your attendees.
            </p>
            <Link
              href="/company/events/new"
              className="mt-4 inline-block rounded-md bg-navy px-4 py-2 text-[12px] font-semibold text-white hover:bg-navy/90"
            >
              Create your first event
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-border bg-surface text-left text-[10px] uppercase tracking-wide text-text-muted">
                  <th className="px-4 py-2 font-semibold">Name</th>
                  <th className="px-4 py-2 font-semibold">Date</th>
                  <th className="px-4 py-2 font-semibold">Type</th>
                  <th className="px-4 py-2 text-right font-semibold">Sessions</th>
                  <th className="px-4 py-2 font-semibold">Status</th>
                  <th className="px-4 py-2 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => {
                  const asset = assets.get(event.id);
                  return (
                  <tr key={event.id} className="border-b border-border last:border-b-0">
                    <td className="px-4 py-2 font-medium text-navy">
                      {event.status === "DRAFT" ? (
                        event.name || "(untitled draft)"
                      ) : (
                        <Link
                          href={`/company/events/${event.id}`}
                          className="hover:underline"
                        >
                          {event.name || "(untitled)"}
                        </Link>
                      )}
                    </td>
                    <td className="px-4 py-2 text-text-mid">{event.eventDate || "—"}</td>
                    <td className="px-4 py-2 text-text-mid">
                      {event.eventType ? TYPE_SHORT[event.eventType] : "—"}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-text-mid">
                      {event.sessions.length}
                    </td>
                    <td className="px-4 py-2">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_STYLE[event.status]}`}>
                        {event.status}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      {event.status === "DRAFT" ? (
                        <Link
                          href={`/company/events/new?eventId=${event.id}`}
                          className="rounded-md border border-border bg-white px-3 py-1.5 text-[11px] font-semibold text-navy hover:bg-surface"
                        >
                          Continue
                        </Link>
                      ) : eventAssetsReady(event) ? (
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[11px]">
                          <Link href={`/attend/event/${event.attendeeLinkToken}`} className="text-ace-dark underline">
                            Attendee Link
                          </Link>
                          {asset?.qrViewUrl && asset?.qrDownloadUrl ? (
                            <span className="inline-flex flex-col items-center gap-1">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={asset.qrViewUrl}
                                alt={`Attendee QR code for ${event.name || event.eventIdNumber}`}
                                width={112}
                                height={112}
                                className="h-28 w-28 rounded-md border border-border bg-white p-1.5"
                              />
                              <a href={asset.qrDownloadUrl} className="text-ace-dark underline">
                                Download QR
                              </a>
                            </span>
                          ) : (
                            <span className="text-text-muted">QR unavailable</span>
                          )}
                          {asset?.letterDownloadUrl ? (
                            <a href={asset.letterDownloadUrl} target="_blank" rel="noopener noreferrer" className="text-ace-dark underline">
                              Approval Letter
                            </a>
                          ) : null}
                          <a
                            href={`/api/events/${event.id}/badge`}
                            className="text-ace-dark underline"
                            title="Download marketing logo"
                          >
                            Marketing Logo
                          </a>
                        </div>
                      ) : event.status === "REJECTED" ? (
                        <div className="flex flex-col items-start gap-1">
                          <form action={reviseEvent}>
                            <input type="hidden" name="eventId" value={event.id} />
                            <button
                              type="submit"
                              className="rounded-md bg-navy px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-navy/90"
                            >
                              Revise and resubmit
                            </button>
                          </form>
                          <span className="text-[10px] text-text-muted">
                            No credit required
                          </span>
                          <Link
                            href={`/company/events/${event.id}`}
                            className="text-[11px] text-ace-dark underline"
                          >
                            View feedback
                          </Link>
                        </div>
                      ) : event.eventIdNumber ? (
                        <span className="font-mono text-[11px] text-text-muted">{event.eventIdNumber}</span>
                      ) : (
                        <span className="text-text-muted">—</span>
                      )}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
