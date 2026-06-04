import Link from "next/link";
import { PageHeader } from "@/components/portal-shell";
import { PortalStatCard } from "@/components/portal-stat-card";
import { requireStaff } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

/*
  AADB super-admin dashboard. Read-only platform stats. Company management and
  overrides live under /admin/companies; staff provisioning under /admin/users.
*/

export default async function AdminDashboard() {
  await requireStaff("ADMIN");

  const [companyCount, pendingApplications, certAgg, lowBalanceCount] = await Promise.all([
    prisma.company.count(),
    prisma.courseApplication.count({ where: { status: "PENDING" } }),
    prisma.company.aggregate({ _sum: { totalCertsIssued: true } }),
    prisma.$queryRaw<{ count: bigint }[]>`
      select count(*)::bigint as count from public.companies
      where cert_balance <= cert_alert_threshold`,
  ]);

  const totalCerts = certAgg._sum.totalCertsIssued ?? 0;
  const lowBalance = Number(lowBalanceCount[0]?.count ?? 0);

  return (
    <>
      <PageHeader title="Admin Dashboard" subtitle="AADB platform operations" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <PortalStatCard label="Companies" tone="blue" value={companyCount} meta="Provider accounts" />
        <PortalStatCard label="Certs Issued" tone="purple" value={totalCerts.toLocaleString()} meta="All time" />
        <PortalStatCard label="Pending Review" tone="gold" value={pendingApplications} meta="Applications" />
        <PortalStatCard label="Low Balance" tone="green" value={lowBalance} meta="At or under threshold" />
      </div>
      <div className="mt-5 rounded-lg border border-border bg-white p-4">
        <p className="text-[13px] text-text-mid">
          Manage providers under{" "}
          <Link href="/admin/companies" className="text-ace underline">Companies</Link>{" "}
          and provision reviewers or admins under{" "}
          <Link href="/admin/users" className="text-ace underline">Staff Users</Link>.
        </p>
      </div>
    </>
  );
}
