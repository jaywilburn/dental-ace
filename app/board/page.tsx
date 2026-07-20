import Link from "next/link";
import { PageHeader } from "@/components/portal-shell";
import { PortalStatCard } from "@/components/portal-stat-card";
import { requireBoard } from "@/lib/board/scope";
import { prisma } from "@/lib/prisma";

/*
  Board overview dashboard: snapshot of state-wide licensee counts, active
  audits, open deficiencies, and a CTA to run a new random audit.

  Licensee + certificate counts come from ProTrack tables filtered by
  board.state. Audit + deficiency counts come from Verify's own tables.
*/
export default async function BoardOverviewPage() {
  const { board } = await requireBoard();

  const [licenseeCount, activeBatches, openDeficiencies, recentBatches] =
    await Promise.all([
      prisma.userLicense.count({
        where: { state: board.state },
      }),
      prisma.auditBatch.count({
        where: { boardId: board.id, status: "ACTIVE" },
      }),
      prisma.deficiency.count({
        where: {
          status: "PENDING",
          batch: { boardId: board.id },
        },
      }),
      prisma.auditBatch.findMany({
        where: { boardId: board.id },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          batchCode: true,
          name: true,
          createdAt: true,
          selectedCount: true,
          deficientCount: true,
          status: true,
        },
      }),
    ]);

  // Compliance rate is "selections that came up compliant" across this board's
  // active batches. A board with no audits yet just shows "—".
  const selectionAgg = await prisma.auditSelection.groupBy({
    by: ["complianceStatus"],
    where: { batch: { boardId: board.id } },
    _count: { _all: true },
  });
  const total = selectionAgg.reduce((acc, row) => acc + row._count._all, 0);
  const compliant =
    selectionAgg.find((r) => r.complianceStatus === "COMPLIANT")?._count._all ??
    0;
  const complianceRate =
    total === 0 ? null : Math.round((compliant / total) * 100);

  return (
    <>
      <PageHeader
        title={`${board.name} — Overview`}
        subtitle={`Verify dashboard for ${board.state}. CE audits, deficiency tracking, and compliance reporting.`}
        action={
          <Link
            href="/board/audits/new"
            className="inline-flex items-center gap-2 rounded-md bg-ver px-4 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-ver/90"
          >
            🎲 Run Audit
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <PortalStatCard
          label="Licensees in state"
          value={licenseeCount.toLocaleString()}
          meta="Across all license types"
          tone="blue"
        />
        <PortalStatCard
          label="Active audits"
          value={activeBatches}
          meta={activeBatches === 0 ? "No audits running" : "Open batches"}
          tone="gold"
        />
        <PortalStatCard
          label="Open deficiencies"
          value={openDeficiencies}
          meta="Pending licensee response"
          tone={openDeficiencies > 0 ? "purple" : "muted"}
        />
        <PortalStatCard
          label="Compliance rate"
          value={complianceRate === null ? "—" : `${complianceRate}%`}
          meta={
            complianceRate === null
              ? "Run an audit to see compliance"
              : "Across audited licensees"
          }
          tone="green"
        />
      </div>

      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-serif text-lg font-semibold text-navy">
            Recent audits
          </h2>
          <Link
            href="/board/audits"
            className="text-[11px] font-semibold text-ver hover:underline"
          >
            View all →
          </Link>
        </div>
        {recentBatches.length === 0 ? (
          <EmptyAudits />
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead className="border-b border-border bg-surface text-left text-[10px] uppercase tracking-wide text-text-muted">
                  <tr>
                    <th className="px-4 py-2 font-semibold">Batch</th>
                    <th className="px-4 py-2 font-semibold">Name</th>
                    <th className="px-4 py-2 font-semibold">Run</th>
                    <th className="px-4 py-2 text-right font-semibold">
                      Selected
                    </th>
                    <th className="px-4 py-2 text-right font-semibold">
                      Deficient
                    </th>
                    <th className="px-4 py-2 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentBatches.map((b) => (
                    <tr
                      key={b.id}
                      className="border-b border-border last:border-0"
                    >
                      <td className="px-4 py-2 font-mono text-[11px] text-navy">
                        <Link
                          href={`/board/audits/${b.id}`}
                          className="hover:underline"
                        >
                          {b.batchCode}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-text-mid">{b.name}</td>
                      <td className="px-4 py-2 text-text-muted">
                        {b.createdAt.toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-text-mid">
                        {b.selectedCount}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-text-mid">
                        {b.deficientCount}
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={
                            b.status === "ACTIVE"
                              ? "rounded-full bg-ace-bg px-2 py-0.5 text-[10px] font-semibold text-ace-dark"
                              : "rounded-full bg-surface px-2 py-0.5 text-[10px] font-semibold text-text-muted"
                          }
                        >
                          {b.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </>
  );
}

function EmptyAudits() {
  return (
    <div className="rounded-lg border border-dashed border-border bg-white p-8 text-center">
      <p className="font-serif text-base font-semibold text-navy">
        No audits yet
      </p>
      <p className="mt-1 text-[12px] text-text-muted">
        Run an audit to pick a sample of licensees and snapshot their CE
        compliance.
      </p>
      <Link
        href="/board/audits/new"
        className="mt-4 inline-flex items-center gap-2 rounded-md bg-ver px-4 py-2 text-[12px] font-semibold text-white hover:bg-ver/90"
      >
        🎲 Run your first audit
      </Link>
    </div>
  );
}
