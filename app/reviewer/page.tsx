import Link from "next/link";
import { PageHeader } from "@/components/portal-shell";
import { requireStaff } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

/*
  Reviewer queue. Lists all PENDING applications across all companies.
  Expedited rows are sorted to the top and highlighted gold.
*/
export default async function ReviewerQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ just?: string }>;
}) {
  await requireStaff("REVIEWER");
  const { just } = await searchParams;

  const pending = await prisma.courseApplication.findMany({
    where: { status: "PENDING" },
    orderBy: [{ isExpedited: "desc" }, { submittedAt: "asc" }],
    include: { company: { select: { name: true } } },
    take: 100,
  });

  const expeditedCount = pending.filter((a) => a.isExpedited).length;
  const now = Date.now();

  return (
    <>
      <PageHeader
        title="Review Queue"
        subtitle={`${pending.length} application${pending.length === 1 ? "" : "s"} pending${expeditedCount > 0 ? ` · ${expeditedCount} expedited` : ""}`}
      />

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
            Nothing pending. ☕
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
                    className={`border-b border-border last:border-b-0 ${
                      app.isExpedited ? "bg-ace-bg/40" : ""
                    }`}
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
                      {app.isExpedited ? (
                        <span className="ml-1 rounded bg-ace-bg px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-ace">
                          Expedited
                        </span>
                      ) : null}
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
                        className={`rounded-md px-3 py-1.5 text-[11px] font-semibold ${
                          app.isExpedited
                            ? "bg-ace text-navy hover:bg-ace-light"
                            : "bg-navy text-white hover:bg-navy/90"
                        }`}
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
    </>
  );
}
