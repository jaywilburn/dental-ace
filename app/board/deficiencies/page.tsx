import Link from "next/link";
import { PageHeader } from "@/components/portal-shell";
import { requireBoard } from "@/lib/board/scope";
import { prisma } from "@/lib/prisma";
import { DeficiencyStatus } from "@prisma/client";
import { licenseTypeShort } from "@/lib/protrack/reference";

/*
  /board/deficiencies — every open deficiency across the board's audits.

  Filters: ?status=PENDING|RESOLVED|ESCALATED|ALL (default PENDING).
  No paging yet; once a board accumulates 100+ open deficiencies, add cursor
  pagination + a search-by-license-number input.
*/

const STATUS_META: Record<
  DeficiencyStatus,
  { label: string; className: string }
> = {
  PENDING: { label: "Pending", className: "bg-red-50 text-red-700" },
  RESOLVED: { label: "Resolved", className: "bg-green-50 text-green-700" },
  ESCALATED: { label: "Escalated", className: "bg-purple/15 text-purple" },
};

const FILTERS: Array<{ value: string; label: string }> = [
  { value: "PENDING", label: "Pending" },
  { value: "RESOLVED", label: "Resolved" },
  { value: "ESCALATED", label: "Escalated" },
  { value: "ALL", label: "All" },
];

export default async function DeficienciesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { board } = await requireBoard();
  const { status: statusParam } = await searchParams;
  const status = (statusParam ?? "PENDING").toUpperCase();

  const statusFilter: { status?: DeficiencyStatus } =
    status === "ALL"
      ? {}
      : status === "RESOLVED" || status === "ESCALATED" || status === "PENDING"
        ? { status: status as DeficiencyStatus }
        : { status: DeficiencyStatus.PENDING };

  const deficiencies = await prisma.deficiency.findMany({
    where: { ...statusFilter, batch: { boardId: board.id } },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      missingHours: true,
      missingCategories: true,
      noticesSentCount: true,
      deadlineAt: true,
      status: true,
      createdAt: true,
      batch: { select: { id: true, batchCode: true } },
      userLicense: {
        select: {
          licenseNumber: true,
          licenseType: true,
          user: { select: { firstName: true, lastName: true, email: true } },
        },
      },
    },
  });

  const activeFilter = status === "ALL" ? "ALL" : status;

  return (
    <>
      <PageHeader
        title="Deficiencies"
        subtitle="Open deficiencies across all of your board's audits. Filter by status to focus."
      />

      <div className="mb-4 flex flex-wrap gap-1">
        {FILTERS.map((f) => (
          <Link
            key={f.value}
            href={`/board/deficiencies?status=${f.value}`}
            className={
              "rounded-full px-3 py-1 text-[11px] font-semibold transition " +
              (activeFilter === f.value
                ? "bg-ver text-white"
                : "border border-border bg-white text-text-mid hover:border-ver hover:text-navy")
            }
          >
            {f.label}
          </Link>
        ))}
      </div>

      {deficiencies.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-white p-8 text-center">
          <p className="font-serif text-base font-semibold text-navy">
            No deficiencies in this view
          </p>
          <p className="mt-1 text-[12px] text-text-muted">
            {activeFilter === "PENDING"
              ? "Run an audit to surface open deficiencies."
              : "Switch filters above to see other statuses."}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead className="border-b border-border bg-surface text-left text-[10px] uppercase tracking-wide text-text-muted">
                <tr>
                  <th className="px-4 py-2 font-semibold">License</th>
                  <th className="px-4 py-2 font-semibold">Name</th>
                  <th className="px-4 py-2 font-semibold">Type</th>
                  <th className="px-4 py-2 font-semibold">Batch</th>
                  <th className="px-4 py-2 text-right font-semibold">Missing hrs</th>
                  <th className="px-4 py-2 font-semibold">Missing categories</th>
                  <th className="px-4 py-2 text-right font-semibold">Notices</th>
                  <th className="px-4 py-2 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {deficiencies.map((d) => {
                  const meta = STATUS_META[d.status];
                  const name = d.userLicense.user.firstName
                    ? `${d.userLicense.user.firstName} ${d.userLicense.user.lastName ?? ""}`.trim()
                    : d.userLicense.user.email;
                  const missingCats = Array.isArray(d.missingCategories)
                    ? (d.missingCategories as string[])
                    : [];
                  return (
                    <tr key={d.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-2 font-mono text-[11px] text-navy">
                        {d.userLicense.licenseNumber}
                      </td>
                      <td className="px-4 py-2 text-text-mid">{name}</td>
                      <td className="px-4 py-2 text-text-muted">
                        {licenseTypeShort(d.userLicense.licenseType)}
                      </td>
                      <td className="px-4 py-2 font-mono text-[11px] text-text-muted">
                        <Link
                          href={`/board/audits/${d.batch.id}`}
                          className="hover:underline"
                        >
                          {d.batch.batchCode}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-text-mid">
                        {Number(d.missingHours).toFixed(1)}
                      </td>
                      <td className="px-4 py-2 text-[11px] text-text-muted">
                        {missingCats.length === 0 ? "—" : missingCats.join(", ")}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-text-mid">
                        {d.noticesSentCount}
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${meta.className}`}
                        >
                          {meta.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
