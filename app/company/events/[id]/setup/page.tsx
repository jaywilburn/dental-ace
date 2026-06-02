import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/portal-shell";
import { requireDentalAce } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { applicationDataSchema } from "@/lib/forms/application/schemas";
import { saveEventSessions } from "@/lib/events/actions";

/*
  Event Setup — tag approved multi-session Live Event courses to this event.
  Only courses whose application_data has combinedCert=true and
  submitSessionsSeparately=true qualify. Save persists into event_sessions.
*/
export default async function EventSetupPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireDentalAce();
  const { id } = await params;

  const event = await prisma.event.findFirst({
    where: { id, companyId: user.companyId! },
    include: { sessions: { select: { courseId: true } } },
  });
  if (!event) notFound();

  // Pull this company's approved courses and filter to live-event eligible.
  const approvedCourses = await prisma.accreditedCourse.findMany({
    where: { companyId: user.companyId! },
    include: { application: { select: { applicationData: true } } },
    orderBy: { approvedAt: "desc" },
  });
  const eligible = approvedCourses.filter((c) => {
    const parsed = applicationDataSchema.safeParse(c.application.applicationData);
    return (
      parsed.success &&
      parsed.data.deliveryFormat === "Live Event" &&
      parsed.data.combinedCert === true &&
      parsed.data.submitSessionsSeparately === true
    );
  });

  const alreadyTagged = new Set(event.sessions.map((s) => s.courseId));

  return (
    <>
      <PageHeader
        title={`Event Setup — ${event.name}`}
        subtitle={`${event.eventDate} · Tag the approved sessions that make up this event`}
        action={
          <Link
            href="/company/events"
            className="rounded-md border border-border bg-white px-3 py-1.5 text-[11px] font-semibold text-navy hover:bg-surface"
          >
            ← Back to Events
          </Link>
        }
      />

      <form action={saveEventSessions} className="space-y-4">
        <input type="hidden" name="eventId" value={event.id} />

        <div className="overflow-hidden rounded-lg border border-border bg-white">
          {eligible.length === 0 ? (
            <p className="px-4 py-8 text-center text-[12px] text-text-muted">
              No eligible approved sessions yet. Submit individual session
              course applications with delivery format set to <strong>Live Event</strong>
              {" "}and answer <strong>Yes</strong> to combined-cert + sessions-separately
              on Step 1. Once approved, they&apos;ll show up here for tagging.
            </p>
          ) : (
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-border bg-surface text-left text-[10px] uppercase tracking-wide text-text-muted">
                  <th className="px-4 py-2 font-semibold">Tag</th>
                  <th className="px-4 py-2 font-semibold">Course ID</th>
                  <th className="px-4 py-2 font-semibold">Course Title</th>
                  <th className="px-4 py-2 font-semibold">Approved</th>
                </tr>
              </thead>
              <tbody>
                {eligible.map((c) => {
                  const parsed = applicationDataSchema.safeParse(
                    c.application.applicationData,
                  );
                  const title = parsed.success ? parsed.data.courseTitle : "(untitled)";
                  return (
                    <tr key={c.id} className="border-b border-border last:border-b-0">
                      <td className="px-4 py-2">
                        <input
                          type="checkbox"
                          name="courseIds"
                          value={c.id}
                          defaultChecked={alreadyTagged.has(c.id)}
                        />
                      </td>
                      <td className="px-4 py-2 font-mono text-[11px] text-navy">
                        {c.courseIdNumber}
                      </td>
                      <td className="px-4 py-2 font-medium text-navy">{title}</td>
                      <td className="px-4 py-2 text-text-muted">
                        {c.approvedAt.toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="rounded-md border border-ace bg-ace-bg p-3 text-[11px] text-ace-dark">
          The combined-certificate attendee link is reserved at{" "}
          <code className="font-mono text-[10px]">
            /attend/event/{event.id}
          </code>
          . The actual combined-cert PDF rendering ships in Weeks 5-6 alongside
          the certificate engine.
        </div>

        <button
          type="submit"
          disabled={eligible.length === 0}
          className="rounded-md bg-navy px-5 py-2 text-[13px] font-semibold text-white hover:bg-navy/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Save sessions
        </button>
      </form>
    </>
  );
}
