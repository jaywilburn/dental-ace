import Link from "next/link";
import { PageHeader } from "@/components/portal-shell";
import { requireStaff } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

const PAGE_SIZE = 25;

export default async function AdminCompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  await requireStaff("ADMIN");
  const { q, page } = await searchParams;
  const pageNum = Math.max(1, Number(page ?? "1") || 1);
  const query = (q ?? "").trim();

  const where: Prisma.CompanyWhereInput = query
    ? { name: { contains: query, mode: "insensitive" } }
    : {};

  const [total, companies] = await Promise.all([
    prisma.company.count({ where }),
    prisma.company.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (pageNum - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true, name: true, contactEmail: true, applicationCredits: true,
        expeditedCredits: true, certBalance: true, totalCertsIssued: true,
      },
    }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <PageHeader title="Companies" subtitle={`${total} provider account${total === 1 ? "" : "s"}`} />
      <form className="mb-4" action="/admin/companies" method="get">
        <input type="search" name="q" defaultValue={query} placeholder="Search company name"
          className="w-full max-w-sm rounded-md border border-border px-3 py-2 text-[13px]" />
      </form>
      <div className="overflow-hidden rounded-lg border border-border bg-white">
        {companies.length === 0 ? (
          <p className="px-4 py-10 text-center text-[12px] text-text-muted">No companies found.</p>
        ) : (
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-border bg-surface text-left text-[10px] uppercase tracking-wide text-text-muted">
                <th className="px-4 py-2 font-semibold">Company</th>
                <th className="px-4 py-2 font-semibold">Contact</th>
                <th className="px-4 py-2 font-semibold">App Credits</th>
                <th className="px-4 py-2 font-semibold">Cert Balance</th>
                <th className="px-4 py-2 font-semibold">Certs Issued</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-b-0">
                  <td className="px-4 py-2 font-medium text-navy">
                    <Link href={`/admin/companies/${c.id}`} className="text-ace underline">{c.name}</Link>
                  </td>
                  <td className="px-4 py-2 text-text-muted">{c.contactEmail ?? "·"}</td>
                  <td className="px-4 py-2 text-text-mid tabular-nums">
                    {c.applicationCredits}{c.expeditedCredits > 0 ? ` (+${c.expeditedCredits} exp)` : ""}
                  </td>
                  <td className="px-4 py-2 text-text-mid tabular-nums">{c.certBalance}</td>
                  <td className="px-4 py-2 text-text-muted tabular-nums">{c.totalCertsIssued}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-[12px] text-text-muted">
          <span>Page {pageNum} of {totalPages}</span>
          <div className="flex gap-2">
            {pageNum > 1 && (
              <Link className="rounded-md border border-border px-3 py-1"
                href={`/admin/companies?${new URLSearchParams({ ...(query ? { q: query } : {}), page: String(pageNum - 1) })}`}>Previous</Link>
            )}
            {pageNum < totalPages && (
              <Link className="rounded-md border border-border px-3 py-1"
                href={`/admin/companies?${new URLSearchParams({ ...(query ? { q: query } : {}), page: String(pageNum + 1) })}`}>Next</Link>
            )}
          </div>
        </div>
      )}
    </>
  );
}
