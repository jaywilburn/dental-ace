import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ComplianceStatus,
  DeficiencyStatus,
  VerificationStatus,
} from "@prisma/client";
import { PageHeader } from "@/components/portal-shell";
import { PortalStatCard } from "@/components/portal-stat-card";
import { requireBoard } from "@/lib/board/scope";
import { prisma } from "@/lib/prisma";
import { getLicenseeDetail } from "@/lib/board/licensee/compliance";
import {
  categoryIcon,
  formatHours,
  formatLabel,
} from "@/lib/protrack/progress";
import {
  licenseTypeLong,
  licenseTypeShort,
  stateName,
} from "@/lib/protrack/reference";

/*
  /board/licensees/[licenseNumber] — full licensee record for the board.

  Scoped to board.state — a TX board user can never resolve a CA license even
  by guessing the number. Shows:
   - identity + license metadata
   - aggregate compliance + per-category progress
   - full CE history (verified + unverified, with the verification badge)
   - any deficiencies recorded against this license from this board's audits
*/

const STATUS_META: Record<
  ComplianceStatus,
  { label: string; className: string }
> = {
  COMPLIANT: { label: "Compliant", className: "bg-green-50 text-green-700" },
  IN_PROGRESS: { label: "In progress", className: "bg-ace-bg text-ace-dark" },
  DEFICIENT: { label: "Deficient", className: "bg-red-50 text-red-700" },
  NO_UPLOAD: { label: "No upload", className: "bg-surface text-text-muted" },
};

const DEFICIENCY_META: Record<
  DeficiencyStatus,
  { label: string; className: string }
> = {
  PENDING: { label: "Pending", className: "bg-red-50 text-red-700" },
  RESOLVED: { label: "Resolved", className: "bg-green-50 text-green-700" },
  ESCALATED: { label: "Escalated", className: "bg-purple/15 text-purple" },
};

const VERIFICATION_META: Record<
  VerificationStatus,
  { label: string; className: string }
> = {
  AUTO: { label: "AADB", className: "bg-ace-bg text-ace-dark" },
  ADA_CERP_ACCEPTED: {
    label: "ADA CERP",
    className: "bg-blue-50 text-blue-700",
  },
  AGD_PACE_ACCEPTED: {
    label: "AGD PACE",
    className: "bg-blue-50 text-blue-700",
  },
  ADMIN_VERIFIED: {
    label: "Verified",
    className: "bg-green-50 text-green-700",
  },
  PENDING: {
    label: "Pending",
    className: "bg-surface text-text-muted",
  },
};

export default async function LicenseeDetailPage({
  params,
}: {
  params: Promise<{ licenseNumber: string }>;
}) {
  const { board } = await requireBoard();
  const { licenseNumber: raw } = await params;
  const licenseNumber = decodeURIComponent(raw);

  const detail = await getLicenseeDetail(board.state, licenseNumber);
  if (!detail) notFound();

  // Full cert history (verified + unverified, ordered newest first).
  const certs = await prisma.ceCertificate.findMany({
    where: { licenseeId: detail.user.id },
    orderBy: { completedAt: "desc" },
    select: {
      id: true,
      courseTitle: true,
      provider: true,
      category: true,
      hours: true,
      deliveryFormat: true,
      completedAt: true,
      verificationStatus: true,
      source: true,
    },
  });

  // Deficiencies recorded against this license from this board's audits.
  const deficiencies = await prisma.deficiency.findMany({
    where: {
      userLicenseId: detail.license.id,
      batch: { boardId: board.id },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      missingHours: true,
      missingCategories: true,
      deadlineAt: true,
      createdAt: true,
      resolvedAt: true,
      noticesSentCount: true,
      batch: { select: { id: true, batchCode: true, name: true } },
    },
  });

  const fullName = detail.user.firstName
    ? `${detail.user.firstName} ${detail.user.lastName ?? ""}`.trim()
    : detail.user.email;

  const statusMeta = STATUS_META[detail.complianceStatus];

  const progress = detail.progress;
  const pctTone =
    detail.complianceStatus === ComplianceStatus.COMPLIANT
      ? "green"
      : detail.complianceStatus === ComplianceStatus.IN_PROGRESS
        ? "gold"
        : "purple";

  return (
    <>
      <PageHeader
        title={fullName}
        subtitle={`${detail.license.licenseNumber} · ${licenseTypeLong(
          detail.license.licenseType,
        )} · ${stateName(detail.license.state)}`}
        action={
          <Link
            href="/board/licensees"
            className="rounded-md border border-border bg-white px-3 py-1.5 text-[11px] font-semibold text-text-mid hover:border-ver"
          >
            ← All licensees
          </Link>
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-4">
        <PortalStatCard
          label="CE hours earned"
          value={formatHours(progress.totalEarned)}
          meta={`of ${formatHours(progress.totalRequired)} required`}
          tone="blue"
        />
        <PortalStatCard
          label="Progress"
          value={`${progress.pct}%`}
          meta={
            progress.remaining > 0
              ? `${formatHours(progress.remaining)} hrs to go`
              : "Requirement met"
          }
          tone={pctTone}
        />
        <PortalStatCard
          label="Status"
          value={
            <span
              className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusMeta.className}`}
            >
              {statusMeta.label}
            </span>
          }
          meta={`${detail.verifiedCertCount} verified · ${detail.unverifiedCertCount} pending`}
          tone="muted"
        />
        <PortalStatCard
          label="Renewal"
          value={detail.license.renewalDate.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
          meta={detail.user.email}
          tone="gold"
        />
      </div>

      {/* Per-category progress */}
      {progress.categories.length > 0 ? (
        <div className="mb-5 overflow-hidden rounded-lg border border-border bg-white">
          <div className="border-b border-border bg-surface px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
            Category requirements ·{" "}
            {licenseTypeShort(detail.license.licenseType)} · {stateName(
              detail.license.state,
            )}
          </div>
          <table className="w-full text-[12px]">
            <thead className="border-b border-border bg-surface text-left text-[10px] uppercase tracking-wide text-text-muted">
              <tr>
                <th className="px-4 py-2 font-semibold">Category</th>
                <th className="px-4 py-2 font-semibold">Format</th>
                <th className="px-4 py-2 text-right font-semibold">Earned</th>
                <th className="px-4 py-2 text-right font-semibold">Required</th>
                <th className="px-4 py-2 font-semibold">Progress</th>
              </tr>
            </thead>
            <tbody>
              {progress.categories.map((c) => {
                const pct =
                  c.required > 0
                    ? Math.min(100, Math.round((c.earned / c.required) * 100))
                    : 100;
                return (
                  <tr key={c.name} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 text-navy">
                      <span className="mr-1.5">{categoryIcon(c.name)}</span>
                      {c.name}
                    </td>
                    <td className="px-4 py-2 text-text-muted">
                      {formatLabel(c.format)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-text-mid">
                      {formatHours(c.earned)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-text-muted">
                      {formatHours(c.required)}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-32 overflow-hidden rounded-full bg-surface">
                          <div
                            className={`h-full ${
                              c.status === "complete"
                                ? "bg-green-500"
                                : c.status === "in_progress"
                                  ? "bg-ace"
                                  : "bg-border"
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-[10px] tabular-nums text-text-muted">
                          {pct}%
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mb-5 rounded-lg border border-dashed border-border bg-white p-4 text-[12px] text-text-muted">
          No state requirement seeded for{" "}
          {licenseTypeShort(detail.license.licenseType)} in {stateName(
            detail.license.state,
          )}{" "}
          — compliance shows raw hours only.
        </div>
      )}

      {/* Deficiencies from this board's audits */}
      {deficiencies.length > 0 ? (
        <div className="mb-5 overflow-hidden rounded-lg border border-border bg-white">
          <div className="border-b border-border bg-surface px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
            Deficiencies in your audits ({deficiencies.length})
          </div>
          <table className="w-full text-[12px]">
            <thead className="border-b border-border bg-surface text-left text-[10px] uppercase tracking-wide text-text-muted">
              <tr>
                <th className="px-4 py-2 font-semibold">Batch</th>
                <th className="px-4 py-2 font-semibold">Status</th>
                <th className="px-4 py-2 text-right font-semibold">Missing</th>
                <th className="px-4 py-2 font-semibold">Missing categories</th>
                <th className="px-4 py-2 text-right font-semibold">Notices</th>
                <th className="px-4 py-2 font-semibold">Deadline</th>
                <th className="px-4 py-2 font-semibold">Recorded</th>
              </tr>
            </thead>
            <tbody>
              {deficiencies.map((d) => {
                const meta = DEFICIENCY_META[d.status];
                const missingCats = Array.isArray(d.missingCategories)
                  ? (d.missingCategories as string[])
                  : [];
                return (
                  <tr key={d.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 font-mono text-[11px] text-navy">
                      <Link
                        href={`/board/audits/${d.batch.id}`}
                        className="hover:underline"
                      >
                        {d.batch.batchCode}
                      </Link>
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${meta.className}`}
                      >
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-text-mid">
                      {Number(d.missingHours).toFixed(1)} hrs
                    </td>
                    <td className="px-4 py-2 text-[11px] text-text-muted">
                      {missingCats.length === 0 ? "—" : missingCats.join(", ")}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-text-mid">
                      {d.noticesSentCount}
                    </td>
                    <td className="px-4 py-2 text-text-muted">
                      {d.deadlineAt
                        ? d.deadlineAt.toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })
                        : "—"}
                    </td>
                    <td className="px-4 py-2 text-text-muted">
                      {d.createdAt.toLocaleDateString("en-US", {
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
        </div>
      ) : null}

      {/* Full CE history */}
      <div className="overflow-hidden rounded-lg border border-border bg-white">
        <div className="border-b border-border bg-surface px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
          CE history ({certs.length})
        </div>
        {certs.length === 0 ? (
          <p className="p-6 text-center text-[12px] text-text-muted">
            No CE certificates uploaded yet.
          </p>
        ) : (
          <table className="w-full text-[12px]">
            <thead className="border-b border-border bg-surface text-left text-[10px] uppercase tracking-wide text-text-muted">
              <tr>
                <th className="px-4 py-2 font-semibold">Completed</th>
                <th className="px-4 py-2 font-semibold">Course</th>
                <th className="px-4 py-2 font-semibold">Provider</th>
                <th className="px-4 py-2 font-semibold">Category</th>
                <th className="px-4 py-2 text-right font-semibold">Hours</th>
                <th className="px-4 py-2 font-semibold">Format</th>
                <th className="px-4 py-2 font-semibold">Source</th>
              </tr>
            </thead>
            <tbody>
              {certs.map((c) => {
                const vm = VERIFICATION_META[c.verificationStatus];
                return (
                  <tr key={c.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 text-text-muted">
                      {c.completedAt.toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-4 py-2 text-navy">{c.courseTitle}</td>
                    <td className="px-4 py-2 text-text-mid">{c.provider}</td>
                    <td className="px-4 py-2 text-text-muted">{c.category}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-text-mid">
                      {Number(c.hours).toFixed(1)}
                    </td>
                    <td className="px-4 py-2 text-[11px] text-text-muted">
                      {c.deliveryFormat ?? "—"}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${vm.className}`}
                      >
                        {vm.label}
                      </span>
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
