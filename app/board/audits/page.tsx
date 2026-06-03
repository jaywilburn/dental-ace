import Link from "next/link";
import { PageHeader } from "@/components/portal-shell";
import { requireBoard } from "@/lib/board/scope";
import { prisma } from "@/lib/prisma";
import { licenseTypeShort } from "@/lib/protrack/reference";

export default async function AuditsHistoryPage() {
  const { board } = await requireBoard();

  const batches = await prisma.auditBatch.findMany({
    where: { boardId: board.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      batchCode: true,
      name: true,
      samplePercent: true,
      licenseType: true,
      renewalCycle: true,
      selectedCount: true,
      deficientCount: true,
      status: true,
      createdAt: true,
    },
  });

  return (
    <>
      <PageHeader
        title="Audit history"
        subtitle="Every audit run for your board, with sample size and outcome."
        action={
          <Link
            href="/board/audits/new"
            className="inline-flex items-center gap-2 rounded-md bg-ver px-4 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-ver/90"
          >
            🎲 Run audit
          </Link>
        }
      />

      {batches.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-white p-8 text-center">
          <p className="font-serif text-base font-semibold text-navy">
            No audits yet
          </p>
          <p className="mt-1 text-[12px] text-text-muted">
            Run your first random audit to snapshot CE compliance for a sample
            of in-state licensees.
          </p>
          <Link
            href="/board/audits/new"
            className="mt-4 inline-flex items-center gap-2 rounded-md bg-ver px-4 py-2 text-[12px] font-semibold text-white hover:bg-ver/90"
          >
            🎲 Run your first audit
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-white">
          <table className="w-full text-[12px]">
            <thead className="border-b border-border bg-surface text-left text-[10px] uppercase tracking-wide text-text-muted">
              <tr>
                <th className="px-4 py-2 font-semibold">Batch</th>
                <th className="px-4 py-2 font-semibold">Name</th>
                <th className="px-4 py-2 font-semibold">License type</th>
                <th className="px-4 py-2 font-semibold">Cycle</th>
                <th className="px-4 py-2 text-right font-semibold">Sample</th>
                <th className="px-4 py-2 text-right font-semibold">Selected</th>
                <th className="px-4 py-2 text-right font-semibold">Deficient</th>
                <th className="px-4 py-2 font-semibold">Run</th>
                <th className="px-4 py-2 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => (
                <tr key={b.id} className="border-b border-border last:border-0">
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
                    {b.licenseType ? licenseTypeShort(b.licenseType) : "All"}
                  </td>
                  <td className="px-4 py-2 text-text-muted">{b.renewalCycle}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-text-mid">
                    {b.samplePercent}%
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-text-mid">
                    {b.selectedCount}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-text-mid">
                    {b.deficientCount}
                  </td>
                  <td className="px-4 py-2 text-text-muted">
                    {b.createdAt.toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
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
      )}
    </>
  );
}
