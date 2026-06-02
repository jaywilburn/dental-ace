import Link from "next/link";
import { PageHeader } from "@/components/portal-shell";
import { requireDentalAce } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { createEvent } from "@/lib/events/actions";

/*
  Events index for the customer. Shows existing events + a small "create"
  form. Event Setup is reachable from the v3 mockup's app form after a
  multi-session Live Event course is approved.
*/
export default async function EventsIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ just?: string }>;
}) {
  const user = await requireDentalAce();
  const { just } = await searchParams;

  const events = user.companyId
    ? await prisma.event.findMany({
        where: { companyId: user.companyId },
        orderBy: { createdAt: "desc" },
        include: { sessions: { select: { courseId: true } } },
        take: 50,
      })
    : [];

  return (
    <>
      <PageHeader
        title="Events"
        subtitle="Tag your approved multi-session courses to a single event so live attendees get one combined certificate."
      />

      {just === "saved" ? (
        <div className="mb-4 rounded-md border border-emerald-400 bg-emerald-50 px-4 py-2.5 text-[13px] text-emerald-700">
          ✓ Sessions saved.
        </div>
      ) : null}

      <div className="grid gap-5 md:grid-cols-[2fr_1fr]">
        <div className="overflow-hidden rounded-lg border border-border bg-white">
          {events.length === 0 ? (
            <p className="px-4 py-10 text-center text-[12px] text-text-muted">
              No events yet. Create one to get started.
            </p>
          ) : (
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-border bg-surface text-left text-[10px] uppercase tracking-wide text-text-muted">
                  <th className="px-4 py-2 font-semibold">Name</th>
                  <th className="px-4 py-2 font-semibold">Date</th>
                  <th className="px-4 py-2 text-right font-semibold">Sessions</th>
                  <th className="px-4 py-2 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id} className="border-b border-border last:border-b-0">
                    <td className="px-4 py-2 font-medium text-navy">{event.name}</td>
                    <td className="px-4 py-2 text-text-mid">{event.eventDate}</td>
                    <td className="px-4 py-2 text-right text-text-mid tabular-nums">
                      {event.sessions.length}
                    </td>
                    <td className="px-4 py-2">
                      <Link
                        href={`/company/events/${event.id}/setup`}
                        className="rounded-md border border-border bg-white px-3 py-1.5 text-[11px] font-semibold text-navy hover:bg-surface"
                      >
                        Setup
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <form
          action={createEvent}
          className="space-y-3 rounded-lg border border-border bg-white p-5"
        >
          <p className="text-[12px] font-semibold text-navy">Create new event</p>
          <label className="block text-[11px] font-semibold text-text-mid">
            Event Name
            <input
              name="name"
              required
              minLength={3}
              className="mt-1 w-full rounded-md border border-border bg-white px-3 py-2 text-[13px] text-navy"
              placeholder="AADB Annual Meeting 2026"
            />
          </label>
          <label className="block text-[11px] font-semibold text-text-mid">
            Event Date(s)
            <input
              name="eventDate"
              required
              minLength={3}
              className="mt-1 w-full rounded-md border border-border bg-white px-3 py-2 text-[13px] text-navy"
              placeholder="June 14-15, 2026"
            />
          </label>
          <button
            type="submit"
            className="w-full rounded-md bg-navy px-4 py-2 text-[13px] font-semibold text-white hover:bg-navy/90"
          >
            + Create event
          </button>
          <p className="text-[10px] text-text-muted">
            Combined-certificate link generation lands in Weeks 5-6 alongside
            the cert engine. For now this records the event + sessions you
            tag.
          </p>
        </form>
      </div>
    </>
  );
}
