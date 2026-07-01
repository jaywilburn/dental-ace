import Link from "next/link";
import { PageHeader } from "@/components/portal-shell";
import { requireDentalAce } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { eventAssetUrls } from "@/lib/events/event-assets";
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

export default async function EventsIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ just?: string }>;
}) {
  const user = await requireDentalAce();
  const { just } = await searchParams;

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
  const assets = new Map<string, { qrDownloadUrl: string | null; letterDownloadUrl: string | null }>();
  await Promise.all(
    events
      .filter((e) => e.status === "APPROVED" && e.eventIdNumber && e.approvedAt && e.expiresAt)
      .map(async (e) => {
        assets.set(
          e.id,
          await eventAssetUrls({
            attendeeLinkToken: e.attendeeLinkToken,
            qrCodeUrl: e.qrCodeUrl,
            approvalLetterUrl: e.approvalLetterUrl,
            eventIdNumber: e.eventIdNumber!,
            eventName: e.name,
            companyName: company?.name ?? "",
            totalHours: e.totalHours ? Number(e.totalHours) : 0,
            approvedAt: e.approvedAt!,
            expiresAt: e.expiresAt!,
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
              {events.map((event) => (
                <tr key={event.id} className="border-b border-border last:border-b-0">
                  <td className="px-4 py-2 font-medium text-navy">
                    {event.name || "(untitled draft)"}
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
                        href="/company/events/new"
                        className="rounded-md border border-border bg-white px-3 py-1.5 text-[11px] font-semibold text-navy hover:bg-surface"
                      >
                        Continue
                      </Link>
                    ) : event.status === "APPROVED" ? (
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                        <Link href={`/attend/event/${event.attendeeLinkToken}`} className="text-ace underline">
                          Attendee Link
                        </Link>
                        {assets.get(event.id)?.qrDownloadUrl ? (
                          <a href={assets.get(event.id)!.qrDownloadUrl!} target="_blank" rel="noopener noreferrer" className="text-ace underline">
                            QR Code
                          </a>
                        ) : null}
                        {assets.get(event.id)?.letterDownloadUrl ? (
                          <a href={assets.get(event.id)!.letterDownloadUrl!} target="_blank" rel="noopener noreferrer" className="text-ace underline">
                            Approval Letter
                          </a>
                        ) : null}
                        <a
                          href={`/api/events/${event.id}/badge`}
                          className="text-ace underline"
                          title="Download marketing logo"
                        >
                          Marketing Logo
                        </a>
                      </div>
                    ) : event.eventIdNumber ? (
                      <span className="font-mono text-[11px] text-text-muted">{event.eventIdNumber}</span>
                    ) : (
                      <span className="text-text-muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
