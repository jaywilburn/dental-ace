import { PageHeader } from "@/components/portal-shell";
import { requireStaff } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

/*
  Approved courses history for the REVIEWER role. Lists every accredited
  course with cert-issued count and review attribution.
*/
export default async function ReviewerApprovedPage() {
  await requireStaff("REVIEWER");
  const courses = await prisma.accreditedCourse.findMany({
    include: {
      company: { select: { name: true } },
      application: { select: { reviewedBy: { select: { email: true } } } },
    },
    orderBy: { approvedAt: "desc" },
    take: 100,
  });

  return (
    <>
      <PageHeader
        title="Approved Courses"
        subtitle={`${courses.length} accredited course${courses.length === 1 ? "" : "s"} in the system`}
      />
      <div className="overflow-hidden rounded-lg border border-border bg-white">
        {courses.length === 0 ? (
          <p className="px-4 py-10 text-center text-[12px] text-text-muted">
            No approved courses yet.
          </p>
        ) : (
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-border bg-surface text-left text-[10px] uppercase tracking-wide text-text-muted">
                <th className="px-4 py-2 font-semibold">Course ID</th>
                <th className="px-4 py-2 font-semibold">Company</th>
                <th className="px-4 py-2 font-semibold">Approved</th>
                <th className="px-4 py-2 font-semibold">Expires</th>
                <th className="px-4 py-2 text-right font-semibold">Certs Issued</th>
                <th className="px-4 py-2 font-semibold">Reviewed By</th>
              </tr>
            </thead>
            <tbody>
              {courses.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-b-0">
                  <td className="px-4 py-2 font-mono text-[11px] text-navy">
                    {c.courseIdNumber}
                  </td>
                  <td className="px-4 py-2 text-text-mid">{c.company.name}</td>
                  <td className="px-4 py-2 text-text-muted">
                    {c.approvedAt.toLocaleDateString("en-US", {
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  <td className="px-4 py-2 text-text-muted">
                    {c.expiresAt.toLocaleDateString("en-US", {
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  <td className="px-4 py-2 text-right text-text-mid tabular-nums">
                    {c.certsIssuedCount}
                  </td>
                  <td className="px-4 py-2 text-text-muted">
                    {c.application.reviewedBy?.email ?? "—"}
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
