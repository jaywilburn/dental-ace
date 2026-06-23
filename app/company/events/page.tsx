import Link from "next/link";
import { PageHeader } from "@/components/portal-shell";
import { requireDentalAce } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import {
  applicationDataReadSchema,
  isLiveFormat,
} from "@/lib/forms/application/schemas";
import { createEvent } from "@/lib/events/actions";

/*
  Events index for the customer. Shows existing events + a small "create"
  form. Event Setup needs at least one approved live-format course with
  combinedCert + submitSessionsSeparately; when none exists yet, a banner
  explains how to get one instead of leaving the feature looking broken.
*/
export default async function EventsIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ just?: string }>;
}) {
  const user = await requireDentalAce();
  const { just } = await searchParams;

  const [events, approvedCourses] = user.companyId
    ? await Promise.all([
        prisma.event.findMany({
          where: { companyId: user.companyId },
          orderBy: { createdAt: "desc" },
          include: { sessions: { select: { courseId: true } } },
          take: 50,
        }),
        prisma.accreditedCourse.findMany({
          where: { companyId: user.companyId },
          select: { application: { select: { applicationData: true } } },
        }),
      ])
    : [[], []];

  const hasEligibleCourse = approvedCourses.some((c) => {
    const parsed = applicationDataReadSchema.safeParse(
      c.application.applicationData,
    );
    return (
      parsed.success &&
      isLiveFormat(parsed.data.deliveryFormat) &&
      parsed.data.combinedCert === true &&
      parsed.data.submitSessionsSeparately === true
    );
  });

  return (
    <>
      <PageHeader
        title="Events"
        subtitle="Tag your approved multi-session courses to a single event so live attendees get one combined certificate."
      />

      {!hasEligibleCourse ? (
        <div className="mb-4 rounded-md border border-ace bg-ace-bg px-4 py-3 text-[12px] leading-relaxed text-ace-dark">
          <p className="font-semibold">No event-eligible courses yet</p>
          <p>
            Events need at least one approved course with a live delivery
            format (Live/In Person or Live/Online) where you answered Yes to
            the combined-certificate and sessions-submitted-separately
            questions on Step 2 (Course Information).{" "}
            <Link
              href="/company/applications/new"
              className="font-semibold underline"
            >
              Start an application
            </Link>
            . You can still create the event now and tag sessions once they are
            approved.
          </p>
        </div>
      ) : null}

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
