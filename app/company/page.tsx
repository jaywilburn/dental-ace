import Link from "next/link";
import { PageHeader } from "@/components/portal-shell";
import { PortalStatCard } from "@/components/portal-stat-card";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

/*
  Customer (provider) dashboard. Real numbers from the company's row +
  recent activity rolled up from billing_transactions, course_applications,
  and issued_certificates.

  Layout mirrors logic/dentalace-dev-mockup-suite-v3.html #co-dashboard.
*/
export default async function CompanyDashboard() {
  const user = await requireRole("CUSTOMER");
  if (!user.companyId) {
    return (
      <>
        <PageHeader
          title="Company Dashboard"
          subtitle="No company is linked to your account. Contact AADB at info@dentalace.org."
        />
      </>
    );
  }

  const company = await prisma.company.findUnique({
    where: { id: user.companyId },
    select: {
      name: true,
      applicationCredits: true,
      expeditedCredits: true,
      applicationCreditsExpiresAt: true,
      certBalance: true,
      certAlertThreshold: true,
      totalCertsIssued: true,
    },
  });
  if (!company) {
    return (
      <PageHeader
        title="Company Dashboard"
        subtitle="Company record not found. Contact AADB."
      />
    );
  }

  const [activeCount, pendingCount, recentTxns] = await Promise.all([
    prisma.accreditedCourse.count({ where: { companyId: user.companyId } }),
    prisma.courseApplication.count({
      where: { companyId: user.companyId, status: "PENDING" },
    }),
    prisma.billingTransaction.findMany({
      where: { companyId: user.companyId },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
  ]);

  const totalCredits = company.applicationCredits + company.expeditedCredits;
  const expiresAtLabel = company.applicationCreditsExpiresAt
    ? new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" }).format(
        company.applicationCreditsExpiresAt,
      )
    : "—";
  const lowBalance = company.certBalance <= company.certAlertThreshold;

  return (
    <>
      <PageHeader
        title="Company Dashboard"
        subtitle={`${company.name} · ${activeCount} active course${activeCount === 1 ? "" : "s"}${
          pendingCount > 0 ? ` · ${pendingCount} pending review` : ""
        }`}
        action={
          <Link
            href="/company/applications/new"
            className="rounded-md bg-navy px-3.5 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-navy/90"
          >
            + New Application
          </Link>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <PortalStatCard
          label="App Credits"
          tone="gold"
          value={totalCredits}
          meta={
            company.expeditedCredits > 0
              ? `${company.applicationCredits} standard + ${company.expeditedCredits} expedited · Expires ${expiresAtLabel}`
              : `Expires ${expiresAtLabel}`
          }
        />
        <PortalStatCard
          label="Cert Balance"
          tone="green"
          value={company.certBalance}
          meta="Never expire"
        />
        <PortalStatCard
          label="Active Courses"
          tone="blue"
          value={activeCount}
          meta={pendingCount > 0 ? `${pendingCount} pending review` : "All approved"}
        />
        <PortalStatCard
          label="Total Certs Issued"
          tone="purple"
          value={company.totalCertsIssued.toLocaleString()}
          meta="All time"
        />
      </div>

      <div
        className={`mt-5 rounded-lg border ${lowBalance ? "border-ace bg-ace-bg" : "border-border bg-white"} p-4 sm:flex sm:items-center sm:justify-between sm:gap-4`}
      >
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
            Certificate Balance
          </p>
          <p className="font-serif text-2xl font-bold text-navy tabular-nums">
            {company.certBalance}
          </p>
          <p className="text-[11px] text-text-muted">
            Alert threshold: {company.certAlertThreshold} certs
          </p>
        </div>
        <div className="mt-3 flex items-center gap-2 sm:mt-0">
          <Link
            href="/company/buy/certs"
            className="rounded-md bg-ace px-3 py-1.5 text-[11px] font-semibold text-navy transition-colors hover:bg-ace-light"
          >
            Buy more
          </Link>
          {lowBalance ? (
            <p className="text-[11px] text-ace-dark">
              ⚠ Low balance alert active · email + banner
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-5 overflow-hidden rounded-lg border border-border bg-white">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="text-[12px] font-semibold text-navy">Recent Activity</p>
          <Link
            href="/company/billing"
            className="rounded-md border border-border bg-white px-2.5 py-1 text-[10px] font-semibold text-navy transition-colors hover:bg-surface"
          >
            View all
          </Link>
        </div>
        {recentTxns.length === 0 ? (
          <p className="px-4 py-6 text-center text-[12px] text-text-muted">
            No transactions yet. Buy application credits or a cert bundle to get
            started.
          </p>
        ) : (
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-border bg-surface text-left text-[10px] uppercase tracking-wide text-text-muted">
                <th className="px-4 py-2 font-semibold">Date</th>
                <th className="px-4 py-2 font-semibold">Event</th>
                <th className="px-4 py-2 font-semibold">Details</th>
              </tr>
            </thead>
            <tbody>
              {recentTxns.map((txn) => (
                <tr key={txn.id} className="border-b border-border last:border-b-0">
                  <td className="px-4 py-2 text-text-muted">
                    {new Intl.DateTimeFormat("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    }).format(txn.createdAt)}
                  </td>
                  <td className="px-4 py-2 font-medium text-navy">
                    {labelFor(txn.type)}
                  </td>
                  <td className="px-4 py-2 text-text-mid">
                    {txn.quantity} × {labelFor(txn.type, true)} · $
                    {(txn.amountCents / 100).toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function labelFor(type: string, unit = false): string {
  switch (type) {
    case "APP_CREDIT":
      return unit ? "credit" : "Application credits";
    case "CERT_BUNDLE":
      return unit ? "certificate" : "Certificate bundle";
    case "EXPEDITE":
      return unit ? "expedite add-on" : "Expedite add-on";
    case "ADMIN_OVERRIDE":
      return "Admin override";
    default:
      return type;
  }
}
