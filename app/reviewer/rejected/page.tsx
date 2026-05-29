import { PageHeader } from "@/components/portal-shell";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

/*
  Rejection history for the REVIEWER role. Shows every REJECTED application
  with reviewer notes (the same text sent in the rejection email).
*/
export default async function ReviewerRejectedPage() {
  await requireRole("REVIEWER");
  const apps = await prisma.courseApplication.findMany({
    where: { status: "REJECTED" },
    include: {
      company: { select: { name: true } },
      reviewedBy: { select: { email: true } },
    },
    orderBy: { reviewedAt: "desc" },
    take: 100,
  });

  return (
    <>
      <PageHeader
        title="Rejected Applications"
        subtitle={`${apps.length} on record`}
      />
      <div className="overflow-hidden rounded-lg border border-border bg-white">
        {apps.length === 0 ? (
          <p className="px-4 py-10 text-center text-[12px] text-text-muted">
            No rejections on record.
          </p>
        ) : (
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-border bg-surface text-left text-[10px] uppercase tracking-wide text-text-muted">
                <th className="px-4 py-2 font-semibold">Date</th>
                <th className="px-4 py-2 font-semibold">Company</th>
                <th className="px-4 py-2 font-semibold">Course</th>
                <th className="px-4 py-2 font-semibold">Reason</th>
                <th className="px-4 py-2 font-semibold">Reviewer</th>
              </tr>
            </thead>
            <tbody>
              {apps.map((app) => (
                <tr key={app.id} className="border-b border-border last:border-b-0">
                  <td className="px-4 py-2 text-text-muted">
                    {app.reviewedAt?.toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    }) ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-text-mid">{app.company.name}</td>
                  <td className="px-4 py-2 font-medium text-navy">
                    {app.courseTitle ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-red-700">{app.reviewerNotes ?? "—"}</td>
                  <td className="px-4 py-2 text-text-muted">
                    {app.reviewedBy?.email ?? "—"}
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
