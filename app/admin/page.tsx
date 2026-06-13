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

  const [
    companyCount, pendingApplications, certAgg, lowBalanceCount,
    totalUsers, staffUsers, dentalAceUsers, proUsers, verifyUsers, suspendedUsers, unverifiedUsers,
  ] = await Promise.all([
    prisma.company.count(),
    prisma.courseApplication.count({ where: { status: "PENDING" } }),
    prisma.company.aggregate({ _sum: { totalCertsIssued: true } }),
    prisma.$queryRaw<{ count: bigint }[]>`
      select count(*)::bigint as count from public.companies
      where cert_balance <= cert_alert_threshold`,
    prisma.user.count(),
    prisma.user.count({ where: { staffRole: { in: ["REVIEWER", "ADMIN"] } } }),
    prisma.user.count({ where: { companyId: { not: null } } }),
    prisma.user.count({ where: { protrackTier: "PRO" } }),
    prisma.user.count({ where: { verifyAccess: true } }),
    prisma.user.count({ where: { disabledAt: { not: null } } }),
    prisma.user.count({ where: { emailVerifiedAt: null } }),
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

      <h2 className="mt-6 mb-3 text-[13px] font-semibold text-navy">Users</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <PortalStatCard label="Total Users" tone="blue" value={totalUsers} meta="All accounts" />
        <PortalStatCard label="Staff" tone="muted" value={staffUsers} meta="Reviewer / Admin" />
        <PortalStatCard label="DentalACE" tone="gold" value={dentalAceUsers} meta="Company-linked" />
        <PortalStatCard label="ProTrack Pro" tone="green" value={proUsers} meta="Paid tier" />
        <PortalStatCard label="Verify" tone="blue" value={verifyUsers} meta="Board access" />
        <PortalStatCard label="Suspended" tone="muted" value={suspendedUsers} meta="Disabled accounts" />
        <PortalStatCard label="Unverified" tone="gold" value={unverifiedUsers} meta="Email not confirmed" />
      </div>

      <div className="mt-5 rounded-lg border border-border bg-white p-4">
        <p className="text-[13px] text-text-mid">
          Manage providers under{" "}
          <Link href="/admin/companies" className="text-ace underline">Companies</Link>, all accounts under{" "}
          <Link href="/admin/users" className="text-ace underline">Users</Link>, and review the{" "}
          <Link href="/admin/audit" className="text-ace underline">Audit Log</Link>.
        </p>
      </div>
    </>
  );
}
