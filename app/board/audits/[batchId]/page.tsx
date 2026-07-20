import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/portal-shell";
import { PortalStatCard } from "@/components/portal-stat-card";
import { requireBoard } from "@/lib/board/scope";
import { prisma } from "@/lib/prisma";
import { ComplianceStatus } from "@prisma/client";
import { licenseTypeShort } from "@/lib/protrack/reference";

/*
  /board/audits/[batchId] — audit results page.

  Shows every selection in the batch with status pills and a summary header.
  Bulk-send is a follow-up commit; for now this is read-only with a link to
  the notice composer that will be wired next.
*/

type ComplianceMeta = {
  label: string;
  className: string;
};

const COMPLIANCE_META: Record<ComplianceStatus, ComplianceMeta> = {
  COMPLIANT: {
    label: "Compliant",
    className: "bg-green-50 text-green-700",
  },
  IN_PROGRESS: {
    label: "In progress",
    className: "bg-ace-bg text-ace-dark",
  },
  DEFICIENT: {
    label: "Deficient",
    className: "bg-red-50 text-red-700",
  },
  NO_UPLOAD: {
    label: "No upload",
    className: "bg-surface text-text-muted",
  },
};

export default async function AuditBatchPage({
  params,
}: {
  params: Promise<{ batchId: string }>;
}) {
  const { board } = await requireBoard();
  const { batchId } = await params;

  const batch = await prisma.auditBatch.findFirst({
    where: { id: batchId, boardId: board.id },
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
      initiatedBy: { select: { firstName: true, lastName: true, email: true } },
    },
  });
  if (!batch) notFound();

  const selections = await prisma.auditSelection.findMany({
    where: { batchId: batch.id },
    orderBy: [{ complianceStatus: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      ceHoursCompleted: true,
      ceHoursRequired: true,
      complianceStatus: true,
      userLicense: {
        select: {
          licenseNumber: true,
          licenseType: true,
          user: { select: { firstName: true, lastName: true, email: true } },
        },
      },
    },
  });

  const compliantCount = selections.filter(
    (s) => s.complianceStatus === ComplianceStatus.COMPLIANT,
  ).length;
  const compliancePct =
    selections.length === 0
      ? 0
      : Math.round((compliantCount / selections.length) * 100);

  const initiatedByLabel = batch.initiatedBy.firstName
    ? `${batch.initiatedBy.firstName} ${batch.initiatedBy.lastName ?? ""}`.trim()
    : batch.initiatedBy.email;

  return (
    <>
      <PageHeader
        title={batch.name}
        subtitle={`${batch.batchCode} · ${batch.samplePercent}% sample · ${
          batch.licenseType ? licenseTypeShort(batch.licenseType) : "All license types"
        } · ${batch.renewalCycle}`}
        action={
          <div className="flex items-center gap-2">
            <a
              href={`/board/audits/${batch.id}/export`}
              className="inline-flex items-center gap-2 rounded-md border border-border bg-white px-3 py-2 text-[12px] font-semibold text-text-mid transition-colors hover:border-ver hover:text-navy"
            >
              📄 Download PDF
            </a>
            {batch.deficientCount > 0 ? (
              <Link
                href={`/board/notices/send?batch=${batch.id}`}
                className="inline-flex items-center gap-2 rounded-md bg-ver px-4 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-ver/90"
              >
                ✉️ Send notices ({batch.deficientCount})
              </Link>
            ) : null}
          </div>
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-4">
        <PortalStatCard
          label="Selected"
          value={batch.selectedCount}
          meta={`Run ${batch.createdAt.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}`}
          tone="blue"
        />
        <PortalStatCard
          label="Compliant"
          value={compliantCount}
          meta={`${compliancePct}% of sample`}
          tone="green"
        />
        <PortalStatCard
          label="Deficient"
          value={batch.deficientCount}
          meta="Notices not yet sent"
          tone={batch.deficientCount > 0 ? "purple" : "muted"}
        />
        <PortalStatCard
          label="Initiated by"
          value={
            <span className="text-[15px] font-semibold text-navy">
              {initiatedByLabel}
            </span>
          }
          meta={batch.status}
          tone="gold"
        />
      </div>

      {selections.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border bg-white p-8 text-center text-[12px] text-text-muted">
          No selections in this batch.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead className="border-b border-border bg-surface text-left text-[10px] uppercase tracking-wide text-text-muted">
                <tr>
                  <th className="px-4 py-2 font-semibold">License</th>
                  <th className="px-4 py-2 font-semibold">Name</th>
                  <th className="px-4 py-2 font-semibold">Type</th>
                  <th className="px-4 py-2 text-right font-semibold">Completed</th>
                  <th className="px-4 py-2 text-right font-semibold">Required</th>
                  <th className="px-4 py-2 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {selections.map((s) => {
                  const meta = COMPLIANCE_META[s.complianceStatus];
                  const name = s.userLicense.user.firstName
                    ? `${s.userLicense.user.firstName} ${s.userLicense.user.lastName ?? ""}`.trim()
                    : s.userLicense.user.email;
                  return (
                    <tr key={s.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-2 font-mono text-[11px] text-navy">
                        {s.userLicense.licenseNumber}
                      </td>
                      <td className="px-4 py-2 text-text-mid">{name}</td>
                      <td className="px-4 py-2 text-text-muted">
                        {licenseTypeShort(s.userLicense.licenseType)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-text-mid">
                        {Number(s.ceHoursCompleted).toFixed(1)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-text-muted">
                        {Number(s.ceHoursRequired).toFixed(1)}
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
