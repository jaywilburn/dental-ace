import Link from "next/link";
import { PageHeader } from "@/components/portal-shell";
import { requireStaff } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

const PAGE_SIZE = 25;

/** Narrow an untyped `details` value to a non-empty string, else undefined. */
function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireStaff("ADMIN");
  const { page } = await searchParams;
  const pageNum = Math.max(1, Number(page ?? "1") || 1);

  const [total, entries] = await Promise.all([
    prisma.adminAuditLog.count(),
    prisma.adminAuditLog.findMany({
      orderBy: { createdAt: "desc" },
      skip: (pageNum - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true, action: true, summary: true, createdAt: true, details: true,
        actor: { select: { email: true } },
        target: { select: { id: true, email: true } },
      },
    }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <PageHeader title="Audit Log" subtitle={`${total} admin action${total === 1 ? "" : "s"}`} />
      <div className="overflow-hidden rounded-lg border border-border bg-white">
        {entries.length === 0 ? (
          <p className="px-4 py-10 text-center text-[12px] text-text-muted">No admin actions recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-border bg-surface text-left text-[10px] uppercase tracking-wide text-text-muted">
                  <th className="px-4 py-2 font-semibold">When</th>
                  <th className="px-4 py-2 font-semibold">Actor</th>
                  <th className="px-4 py-2 font-semibold">Action</th>
                  <th className="px-4 py-2 font-semibold">Target</th>
                  <th className="px-4 py-2 font-semibold">Summary</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => {
                  const details =
                    e.details && typeof e.details === "object" && !Array.isArray(e.details)
                      ? (e.details as Record<string, unknown>)
                      : undefined;
                  const targetEmail = e.target?.email ?? details?.email;
                  // Company-scoped actions (rename, balance adjustment) carry no
                  // target user. Link the company instead of rendering a dash.
                  const companyId = str(details?.companyId);
                  const companyName = str(details?.companyName) ?? str(details?.newName);
                  return (
                    <tr key={e.id} className="border-b border-border last:border-b-0 align-top">
                      <td className="px-4 py-2 text-text-muted tabular-nums whitespace-nowrap">
                        {e.createdAt.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
                      </td>
                      <td className="px-4 py-2 text-text-mid">{e.actor.email}</td>
                      <td className="px-4 py-2">
                        <span className="inline-flex items-center rounded-full bg-surface px-2 py-0.5 text-[10px] font-semibold text-text-mid">
                          {e.action}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-text-mid">
                        {e.target ? (
                          <Link href={`/admin/users/${e.target.id}`} className="text-ace-dark underline">
                            {e.target.email}
                          </Link>
                        ) : companyId ? (
                          <Link href={`/admin/companies/${companyId}`} className="text-ace-dark underline">
                            {companyName ?? "Company"}
                          </Link>
                        ) : (
                          (typeof targetEmail === "string" ? targetEmail : "—")
                        )}
                      </td>
                      <td className="px-4 py-2 text-text-mid">{e.summary}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-[12px] text-text-muted">
          <span>Page {pageNum} of {totalPages}</span>
          <div className="flex gap-2">
            {pageNum > 1 && (
              <Link className="rounded-md border border-border px-3 py-1" href={`/admin/audit?page=${pageNum - 1}`}>Previous</Link>
            )}
            {pageNum < totalPages && (
              <Link className="rounded-md border border-border px-3 py-1" href={`/admin/audit?page=${pageNum + 1}`}>Next</Link>
            )}
          </div>
        </div>
      )}
    </>
  );
}
