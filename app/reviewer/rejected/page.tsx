import Link from "next/link";
import { PageHeader } from "@/components/portal-shell";
import { requireStaff } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

/*
  Rejection history for the REVIEWER role, for BOTH applications and events,
  with the reviewer notes that were emailed to the provider.

  Events were missing here until 2026-07-29. They appear in exactly one list,
  the pending queue, so the moment one was decided it fell out of that query and
  showed up nowhere else. A rejected SELECTIVE_INLINE event was doubly invisible
  because it creates no CourseApplication rows either, leaving the emailed deep
  link as the only way back to it.
*/
export default async function ReviewerRejectedPage() {
  await requireStaff("REVIEWER");
  const [apps, events] = await Promise.all([
    prisma.courseApplication.findMany({
      where: { status: "REJECTED" },
      include: {
        company: { select: { name: true } },
        reviewedBy: { select: { email: true } },
      },
      orderBy: { reviewedAt: "desc" },
      take: 100,
    }),
    // Events carry reviewedBy directly; there is no application to read it from.
    prisma.event.findMany({
      where: { status: "REJECTED" },
      include: {
        company: { select: { name: true } },
        reviewedBy: { select: { email: true } },
        _count: { select: { sessions: true } },
      },
      orderBy: { reviewedAt: "desc" },
      take: 100,
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Rejected Applications"
        subtitle={`${apps.length} application${apps.length === 1 ? "" : "s"} and ${events.length} event${events.length === 1 ? "" : "s"} on record`}
      />
      <h2 className="mb-2 text-[13px] font-semibold text-navy">
        Rejected Applications ({apps.length})
      </h2>
      <div className="overflow-hidden rounded-lg border border-border bg-white">
        {apps.length === 0 ? (
          <p className="px-4 py-10 text-center text-[12px] text-text-muted">
            No rejections on record.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-border bg-surface text-left text-[10px] uppercase tracking-wide text-text-muted">
                  <th className="px-4 py-2 font-semibold">Date</th>
                  <th className="px-4 py-2 font-semibold">Company</th>
                  <th className="px-4 py-2 font-semibold">Course</th>
                  <th className="px-4 py-2 font-semibold">Reason</th>
                  <th className="px-4 py-2 font-semibold">Reviewer</th>
                  <th className="px-4 py-2 font-semibold" />
                </tr>
              </thead>
              <tbody>
                {apps.map((app) => (
                  <tr key={app.id} className="border-b border-border last:border-b-0">
                    <td className="px-4 py-2 text-text-muted">
                      {app.reviewedAt?.toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      }) ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-text-mid">{app.company.name}</td>
                    <td className="px-4 py-2 font-medium text-navy">
                      {app.courseTitle ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-red-700">{app.reviewerNotes ?? "—"}</td>
                    <td className="px-4 py-2 text-text-muted">
                      {app.reviewedBy?.email ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Link
                        href={`/reviewer/${app.id}`}
                        className="whitespace-nowrap text-ace-dark underline"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <h2 className="mb-2 mt-6 text-[13px] font-semibold text-navy">
        Rejected Events ({events.length})
      </h2>
      <div className="overflow-hidden rounded-lg border border-border bg-white">
        {events.length === 0 ? (
          <p className="px-4 py-10 text-center text-[12px] text-text-muted">
            No rejected events on record.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-border bg-surface text-left text-[10px] uppercase tracking-wide text-text-muted">
                  <th className="px-4 py-2 font-semibold">Date</th>
                  <th className="px-4 py-2 font-semibold">Company</th>
                  <th className="px-4 py-2 font-semibold">Event</th>
                  <th className="px-4 py-2 font-semibold">Reason</th>
                  <th className="px-4 py-2 font-semibold">Reviewer</th>
                  <th className="px-4 py-2 font-semibold" />
                </tr>
              </thead>
              <tbody>
                {events.map((ev) => (
                  <tr key={ev.id} className="border-b border-border last:border-b-0">
                    <td className="px-4 py-2 text-text-muted">
                      {ev.reviewedAt?.toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      }) ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-text-mid">{ev.company.name}</td>
                    <td className="px-4 py-2 font-medium text-navy">
                      {ev.name || "—"}
                      <span className="ml-1 font-normal text-text-muted">
                        · {ev._count.sessions} session
                        {ev._count.sessions === 1 ? "" : "s"}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-red-700">{ev.reviewerNotes ?? "—"}</td>
                    <td className="px-4 py-2 text-text-muted">
                      {ev.reviewedBy?.email ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Link
                        href={`/reviewer/events/${ev.id}`}
                        className="whitespace-nowrap text-ace-dark underline"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
