import Link from "next/link";
import { PageHeader } from "@/components/portal-shell";
import { requireStaff } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { COURSE_FORMATS } from "@/lib/forms/application/schemas";
import type { Prisma } from "@prisma/client";

/*
  Reviewer queue. Lists PENDING applications across all companies with a
  company search, delivery-format filter, and oldest/newest sort.
*/
export default async function ReviewerQueuePage({
  searchParams,
}: {
  searchParams: Promise<{
    just?: string;
    q?: string;
    format?: string;
    sort?: string;
  }>;
}) {
  await requireStaff("REVIEWER");
  const { just, q, format, sort } = await searchParams;

  const query = (q ?? "").trim();
  const formatFilter =
    format && (COURSE_FORMATS as readonly string[]).includes(format)
      ? format
      : "";
  const sortNewest = sort === "newest";

  const where: Prisma.CourseApplicationWhereInput = {
    status: "PENDING",
    // Inline event-scoped session applications are reviewed as part of their
    // event (see the Pending Events section), never as standalone queue items.
    eventId: null,
    ...(query
      ? { company: { name: { contains: query, mode: "insensitive" } } }
      : {}),
    ...(formatFilter ? { deliveryMethod: formatFilter } : {}),
  };

  const pending = await prisma.courseApplication.findMany({
    where,
    orderBy: [{ submittedAt: sortNewest ? "desc" : "asc" }],
    include: { company: { select: { name: true } } },
    take: 100,
  });

  // Events run through the same review queue (separate table — the columns differ).
  const pendingEvents = await prisma.event.findMany({
    where: { status: "PENDING" },
    orderBy: { submittedAt: "asc" },
    include: { company: { select: { name: true } } },
    take: 100,
  });

  const now = new Date().getTime();
  const fieldClass =
    "rounded-md border border-border bg-white px-3 py-1.5 text-[12px] text-navy outline-none focus:border-ace";

  return (
    <>
      <PageHeader
        title="Review Queue"
        subtitle={`${pending.length} application${pending.length === 1 ? "" : "s"} pending`}
      />

      <form
        method="get"
        className="mb-4 flex flex-wrap items-center gap-2"
      >
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Search company name"
          className={`${fieldClass} min-w-[200px] flex-1`}
        />
        <select name="format" defaultValue={formatFilter} className={fieldClass}>
          <option value="">All formats</option>
          {COURSE_FORMATS.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <select name="sort" defaultValue={sortNewest ? "newest" : "oldest"} className={fieldClass}>
          <option value="oldest">Oldest first</option>
          <option value="newest">Newest first</option>
        </select>
        <button
          type="submit"
          className="rounded-md bg-navy px-3.5 py-1.5 text-[12px] font-semibold text-white hover:bg-navy/90"
        >
          Apply
        </button>
        {query || formatFilter || sortNewest ? (
          <Link
            href="/reviewer"
            className="px-2 py-1.5 text-[12px] font-semibold text-text-muted hover:text-navy"
          >
            Clear
          </Link>
        ) : null}
      </form>

      {just === "approved" ? (
        <div className="mb-4 rounded-md border border-emerald-400 bg-emerald-50 px-4 py-2.5 text-[13px] text-emerald-700">
          ✓ Application approved. Course ID generated, assets uploaded, approval email sent.
        </div>
      ) : null}
      {just === "rejected" ? (
        <div className="mb-4 rounded-md border border-red-300 bg-red-50 px-4 py-2.5 text-[13px] text-red-700">
          ✓ Application rejected. Rejection email sent to the company.
        </div>
      ) : null}

      <div className="overflow-hidden rounded-lg border border-border bg-white">
        {pending.length === 0 ? (
          <p className="px-4 py-10 text-center text-[12px] text-text-muted">
            {query || formatFilter
              ? "No applications match your filters."
              : "Nothing pending. ☕"}
          </p>
        ) : (
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-border bg-surface text-left text-[10px] uppercase tracking-wide text-text-muted">
                <th className="px-4 py-2 font-semibold">Submitted</th>
                <th className="px-4 py-2 font-semibold">Company</th>
                <th className="px-4 py-2 font-semibold">Course Name</th>
                <th className="px-4 py-2 font-semibold">CE</th>
                <th className="px-4 py-2 font-semibold">Format</th>
                <th className="px-4 py-2 font-semibold">Days Pending</th>
                <th className="px-4 py-2 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {pending.map((app) => {
                const submitted = app.submittedAt ?? app.createdAt;
                const days = Math.floor(
                  (now - submitted.getTime()) / (1000 * 60 * 60 * 24),
                );
                return (
                  <tr
                    key={app.id}
                    className="border-b border-border last:border-b-0"
                  >
                    <td className="px-4 py-2 text-text-muted">
                      {submitted.toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </td>
                    <td className="px-4 py-2 text-text-mid">{app.company.name}</td>
                    <td className="px-4 py-2 font-medium text-navy">
                      {app.courseTitle ?? "(untitled)"}
                    </td>
                    <td className="px-4 py-2 text-text-mid tabular-nums">
                      {app.ceHours ? Number(app.ceHours).toFixed(1) : "—"}
                    </td>
                    <td className="px-4 py-2 text-text-mid">{app.deliveryMethod ?? "—"}</td>
                    <td
                      className={`px-4 py-2 font-semibold tabular-nums ${
                        days >= 5 ? "text-red-600" : days >= 3 ? "text-orange-600" : "text-text-muted"
                      }`}
                    >
                      {days} day{days === 1 ? "" : "s"}
                    </td>
                    <td className="px-4 py-2">
                      <Link
                        href={`/reviewer/${app.id}`}
                        className="rounded-md bg-navy px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-navy/90"
                      >
                        Review
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {pendingEvents.length > 0 ? (
        <div className="mt-8">
          <h2 className="mb-2 text-[13px] font-semibold text-navy">
            Pending Events ({pendingEvents.length})
          </h2>
          <div className="overflow-hidden rounded-lg border border-border bg-white">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-border bg-surface text-left text-[10px] uppercase tracking-wide text-text-muted">
                  <th className="px-4 py-2 font-semibold">Submitted</th>
                  <th className="px-4 py-2 font-semibold">Company</th>
                  <th className="px-4 py-2 font-semibold">Event</th>
                  <th className="px-4 py-2 text-right font-semibold">Hours</th>
                  <th className="px-4 py-2 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {pendingEvents.map((ev) => {
                  const submitted = ev.submittedAt ?? ev.createdAt;
                  return (
                    <tr key={ev.id} className="border-b border-border last:border-b-0">
                      <td className="px-4 py-2 text-text-muted">
                        {submitted.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </td>
                      <td className="px-4 py-2 text-text-mid">{ev.company.name}</td>
                      <td className="px-4 py-2 font-medium text-navy">{ev.name}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-text-mid">
                        {ev.totalHours ? Number(ev.totalHours).toFixed(1) : "—"}
                      </td>
                      <td className="px-4 py-2">
                        <Link
                          href={`/reviewer/events/${ev.id}`}
                          className="rounded-md bg-navy px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-navy/90"
                        >
                          Review
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </>
  );
}
