import Link from "next/link";
import { PageHeader } from "@/components/portal-shell";
import { PortalStatCard } from "@/components/portal-stat-card";
import { requireStaff } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { hasCertificateQuiz } from "@/lib/admin/course-quiz-status";

/*
  AADB super-admin dashboard. Read-only platform stats. Company management and
  overrides live under /admin/companies; staff provisioning under /admin/users.
  Also surfaces active courses that cannot issue certificates for lack of a
  quiz, linking each company to its Courses section (Add quiz lives there).
*/

export default async function AdminDashboard() {
  await requireStaff("ADMIN");

  const [
    companyCount, pendingApplications, certAgg, lowBalanceCount,
    totalUsers, staffUsers, dentalAceUsers, proUsers, verifyUsers, suspendedUsers, unverifiedUsers,
    activeCourses,
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
    // Active standalone courses, checked for a usable certificate quiz below.
    prisma.accreditedCourse.findMany({
      where: { eventId: null, supersededAt: null, expiresAt: { gt: new Date() } },
      select: { quizQuestions: true, company: { select: { id: true, name: true, certBalance: true } } },
    }),
  ]);

  const totalCerts = certAgg._sum.totalCertsIssued ?? 0;
  const lowBalance = Number(lowBalanceCount[0]?.count ?? 0);

  // Companies whose active courses cannot issue certificates (no 5-question
  // quiz; mostly legacy-migrated courses). Companies holding certificates to
  // give sort first: their attendees are the ones hitting the error.
  const missingByCompany = new Map<string, { id: string; name: string; certBalance: number; count: number }>();
  for (const c of activeCourses) {
    if (hasCertificateQuiz(c.quizQuestions)) continue;
    const entry = missingByCompany.get(c.company.id) ?? { ...c.company, count: 0 };
    entry.count += 1;
    missingByCompany.set(c.company.id, entry);
  }
  const missingQuiz = [...missingByCompany.values()].sort(
    (a, b) => Number(b.certBalance > 0) - Number(a.certBalance > 0) || b.count - a.count || a.name.localeCompare(b.name),
  );
  const missingQuizCourses = missingQuiz.reduce((n, c) => n + c.count, 0);
  const quizUrgent = missingQuiz.filter((c) => c.certBalance > 0);
  const quizLater = missingQuiz.filter((c) => c.certBalance <= 0);

  return (
    <>
      <PageHeader title="Admin Dashboard" subtitle="AADB platform operations" />
      {missingQuizCourses > 0 ? (
        <section aria-labelledby="missing-quiz-heading" className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <h2 id="missing-quiz-heading" className="text-balance text-[13px] font-semibold text-amber-900 tabular-nums">
            {missingQuizCourses} active course{missingQuizCourses === 1 ? " is" : "s are"} missing a certificate quiz
          </h2>
          <p className="mt-1 max-w-prose text-pretty text-[12px] text-amber-800">
            Attendees see &ldquo;not configured for certificates&rdquo; on these courses, even when the provider has
            certificates to give. Open a company and use Add quiz under Courses to enter the provider&apos;s 5
            questions (2 true/false, 3 multiple choice). The attendee link works as soon as the quiz is saved.
          </p>

          {quizUrgent.length > 0 ? (
            <>
              <p className="mt-3 text-[11px] font-semibold text-amber-900">Providers with certificates to give</p>
              <ul className="mt-1.5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {quizUrgent.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/admin/companies/${c.id}#courses`}
                      className="flex min-h-11 items-center justify-between gap-3 rounded-md border border-amber-300 bg-white px-3 py-2 text-[12px] hover:bg-amber-100"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-navy">{c.name}</span>
                        <span className="block text-[11px] text-text-muted tabular-nums">
                          {c.count} course{c.count === 1 ? "" : "s"} · {c.certBalance} certs available
                        </span>
                      </span>
                      <span className="shrink-0 font-semibold text-ace-dark" aria-hidden="true">Add quiz &rarr;</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {quizLater.length > 0 ? (
            <details className="group mt-3">
              <summary className="cursor-pointer text-[12px] font-semibold text-amber-900 tabular-nums">
                {quizLater.length} more compan{quizLater.length === 1 ? "y" : "ies"} with no certificates available
              </summary>
              <ul className="mt-2 flex flex-wrap gap-2">
                {quizLater.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/admin/companies/${c.id}#courses`}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-amber-300 bg-white px-2.5 text-[12px] text-navy hover:bg-amber-100"
                    >
                      <span className="font-medium">{c.name}</span>
                      <span className="text-text-muted tabular-nums">{c.count}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </section>
      ) : null}
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
          <Link href="/admin/companies" className="text-ace-dark underline">Companies</Link>, all accounts under{" "}
          <Link href="/admin/users" className="text-ace-dark underline">Users</Link>, review the{" "}
          <Link href="/admin/audit" className="text-ace-dark underline">Audit Log</Link>, and see marketing{" "}
          <Link href="/admin/leads" className="text-ace-dark underline">Leads</Link>.
        </p>
      </div>
    </>
  );
}
