import Link from "next/link";
import { Prisma } from "@prisma/client";
import { PageHeader } from "@/components/portal-shell";
import { EntitlementBadges } from "@/components/admin/entitlement-badges";
import { requireStaff } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { createUserAccount } from "@/lib/admin/users";

const PAGE_SIZE = 25;

const FILTERS: { key: string; label: string; where: Prisma.UserWhereInput }[] = [
  { key: "all", label: "All", where: {} },
  { key: "staff", label: "Staff", where: { staffRole: { in: ["REVIEWER", "ADMIN"] } } },
  { key: "dentalace", label: "DentalACE", where: { companyId: { not: null } } },
  { key: "pro", label: "ProTrack Pro", where: { protrackTier: "PRO" } },
  { key: "verify", label: "Verify", where: { verifyAccess: true } },
  { key: "suspended", label: "Suspended", where: { disabledAt: { not: null } } },
  { key: "unverified", label: "Unverified", where: { emailVerifiedAt: null } },
];

const OK_MESSAGES: Record<string, string> = {
  created: "Account created and a set-password invite was sent.",
  deleted: "Account deleted.",
};

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; filter?: string; ok?: string; error?: string }>;
}) {
  await requireStaff("ADMIN");
  const { q, page, filter, ok, error } = await searchParams;
  const pageNum = Math.max(1, Number(page ?? "1") || 1);
  const query = (q ?? "").trim();
  const activeFilter = FILTERS.find((f) => f.key === filter) ?? FILTERS[0];

  const where: Prisma.UserWhereInput = {
    ...activeFilter.where,
    ...(query
      ? {
          OR: [
            { email: { contains: query, mode: "insensitive" } },
            { firstName: { contains: query, mode: "insensitive" } },
            { lastName: { contains: query, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (pageNum - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true, email: true, firstName: true, lastName: true,
        staffRole: true, companyId: true, protrackTier: true, verifyAccess: true,
        emailVerifiedAt: true, disabledAt: true, createdAt: true,
      },
    }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const pageHref = (next: Record<string, string | undefined>) => {
    const sp = new URLSearchParams();
    if (query) sp.set("q", query);
    if (activeFilter.key !== "all") sp.set("filter", activeFilter.key);
    for (const [k, v] of Object.entries(next)) {
      if (v === undefined) sp.delete(k);
      else sp.set(k, v);
    }
    return `/admin/users?${sp.toString()}`;
  };

  return (
    <>
      <PageHeader title="Users" subtitle={`${total} account${total === 1 ? "" : "s"}`} />

      {ok ? (
        <div className="mb-4 rounded-md border border-emerald-400 bg-emerald-50 px-4 py-2.5 text-[13px] text-emerald-700">
          {OK_MESSAGES[ok] ?? "Done."}
        </div>
      ) : null}
      {error ? (
        <div className="mb-4 rounded-md border border-red-400 bg-red-50 px-4 py-2.5 text-[13px] text-red-700">{error}</div>
      ) : null}

      {/* Search + filter */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <form action="/admin/users" method="get" className="flex-1 min-w-[220px]">
          {activeFilter.key !== "all" ? <input type="hidden" name="filter" value={activeFilter.key} /> : null}
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Search name or email"
            className="w-full max-w-sm rounded-md border border-border px-3 py-2 text-[13px]"
          />
        </form>
      </div>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => {
          const sp = new URLSearchParams();
          if (query) sp.set("q", query);
          if (f.key !== "all") sp.set("filter", f.key);
          const active = f.key === activeFilter.key;
          return (
            <Link
              key={f.key}
              href={`/admin/users${sp.toString() ? `?${sp.toString()}` : ""}`}
              className={
                active
                  ? "rounded-full bg-navy px-3 py-1 text-[11px] font-semibold text-white"
                  : "rounded-full border border-border px-3 py-1 text-[11px] font-medium text-text-mid hover:bg-surface"
              }
            >
              {f.label}
            </Link>
          );
        })}
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-white">
        {users.length === 0 ? (
          <p className="px-4 py-10 text-center text-[12px] text-text-muted">No accounts found.</p>
        ) : (
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-border bg-surface text-left text-[10px] uppercase tracking-wide text-text-muted">
                <th className="px-4 py-2 font-semibold">Name</th>
                <th className="px-4 py-2 font-semibold">Email</th>
                <th className="px-4 py-2 font-semibold">Access</th>
                <th className="px-4 py-2 font-semibold">Status</th>
                <th className="px-4 py-2 font-semibold">Created</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-border last:border-b-0">
                  <td className="px-4 py-2 font-medium text-navy">
                    <Link href={`/admin/users/${u.id}`} className="text-ace underline">
                      {[u.firstName, u.lastName].filter(Boolean).join(" ") || "—"}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-text-mid">{u.email}</td>
                  <td className="px-4 py-2">
                    <EntitlementBadges user={u} />
                  </td>
                  <td className="px-4 py-2">
                    {u.disabledAt ? (
                      <span className="inline-flex items-center rounded-full bg-red-bg px-2 py-0.5 text-[10px] font-semibold text-red">
                        Suspended
                      </span>
                    ) : u.emailVerifiedAt ? (
                      <span className="inline-flex items-center rounded-full bg-green-bg px-2 py-0.5 text-[10px] font-semibold text-green">
                        Verified
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-orange-bg px-2 py-0.5 text-[10px] font-semibold text-orange">
                        Unverified
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-text-muted tabular-nums">
                    {u.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </td>
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
              <Link className="rounded-md border border-border px-3 py-1" href={pageHref({ page: String(pageNum - 1) })}>
                Previous
              </Link>
            )}
            {pageNum < totalPages && (
              <Link className="rounded-md border border-border px-3 py-1" href={pageHref({ page: String(pageNum + 1) })}>
                Next
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Create account */}
      <h2 className="mt-8 mb-3 text-[13px] font-semibold text-navy">Create account</h2>
      <form action={createUserAccount} className="grid gap-3 rounded-lg border border-border bg-white p-4 sm:grid-cols-2">
        <input name="firstName" required placeholder="First name" className="rounded-md border border-border px-3 py-2 text-[13px]" />
        <input name="lastName" required placeholder="Last name" className="rounded-md border border-border px-3 py-2 text-[13px]" />
        <input name="email" type="email" required placeholder="Email" className="rounded-md border border-border px-3 py-2 text-[13px]" />
        <select name="staffRole" defaultValue="NONE" className="rounded-md border border-border px-3 py-2 text-[13px]">
          <option value="NONE">No staff role (regular account)</option>
          <option value="REVIEWER">Reviewer</option>
          <option value="ADMIN">Admin</option>
        </select>
        <button type="submit" className="justify-self-start rounded-md bg-navy px-3 py-1.5 text-[12px] font-semibold text-white sm:col-span-2">
          Create + send set-password invite
        </button>
      </form>
    </>
  );
}
