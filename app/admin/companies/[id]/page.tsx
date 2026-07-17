import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/portal-shell";
import { requireStaff } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { grantAppCredits, adjustCertBalance } from "@/lib/admin/billing-overrides";
import { renameCompany } from "@/lib/admin/company-rename";
import { memberDisplayName, pointOfContactId } from "@/lib/admin/company-members";

export default async function AdminCompanyDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await requireStaff("ADMIN");
  const { id } = await params;
  const { ok, error } = await searchParams;

  const company = await prisma.company.findUnique({
    where: { id },
    select: {
      id: true, name: true, applicationCredits: true,
      certBalance: true, certAlertThreshold: true, totalCertsIssued: true,
      contactEmail: true, contactPhone: true, addressLine1: true,
      addressLine2: true, city: true, state: true, zip: true,
      users: {
        orderBy: { createdAt: "asc" },
        select: { id: true, email: true, firstName: true, lastName: true, staffRole: true, createdAt: true },
      },
      billingTransactions: { orderBy: { createdAt: "desc" }, take: 15 },
    },
  });
  if (!company) notFound();

  const pocId = pointOfContactId(company.users);

  return (
    <>
      <PageHeader title={company.name} subtitle="Company overrides (append-only)" />
      {ok ? (
        <div className="mb-4 rounded-md border border-emerald-400 bg-emerald-50 px-4 py-2.5 text-[13px] text-emerald-700">
          {ok === "renamed" ? "Company name updated." : "Override applied."}
        </div>
      ) : null}
      {error ? (
        <div className="mb-4 rounded-md border border-red-400 bg-red-50 px-4 py-2.5 text-[13px] text-red-700">
          {error}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-white p-4">
          <p className="text-[10px] uppercase tracking-wide text-text-muted">App Credits</p>
          <p className="font-serif text-2xl font-bold text-navy tabular-nums">{company.applicationCredits}</p>
          <p className="text-[11px] text-text-muted">Never expire</p>
        </div>
        <div className="rounded-lg border border-border bg-white p-4">
          <p className="text-[10px] uppercase tracking-wide text-text-muted">Cert Balance</p>
          <p className="font-serif text-2xl font-bold text-navy tabular-nums">{company.certBalance}</p>
          <p className="text-[11px] text-text-muted">threshold {company.certAlertThreshold}</p>
        </div>
        <div className="rounded-lg border border-border bg-white p-4">
          <p className="text-[10px] uppercase tracking-wide text-text-muted">Total Certs Issued</p>
          <p className="font-serif text-2xl font-bold text-navy tabular-nums">{company.totalCertsIssued}</p>
        </div>
      </div>

      {company.contactEmail || company.addressLine1 ? (
        <div className="mt-5 rounded-lg border border-border bg-white p-4">
          <p className="mb-2 text-[12px] font-semibold text-navy">Contact</p>
          <div className="grid gap-2 text-[12px] text-text-mid sm:grid-cols-2">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-text-muted">Email</p>
              <p>{company.contactEmail ?? "Not provided"}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-text-muted">Phone</p>
              <p>{company.contactPhone ?? "Not provided"}</p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-[10px] uppercase tracking-wide text-text-muted">Address</p>
              <p>
                {[
                  company.addressLine1,
                  company.addressLine2,
                  [company.city, company.state, company.zip].filter(Boolean).join(", "),
                ]
                  .filter(Boolean)
                  .join(", ") || "Not provided"}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      <div className="mt-5 overflow-hidden rounded-lg border border-border bg-white">
        <p className="border-b border-border px-4 py-3 text-[12px] font-semibold text-navy">Members</p>
        {company.users.length === 0 ? (
          <p className="px-4 py-6 text-center text-[12px] text-text-muted">No linked accounts yet.</p>
        ) : (
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-border bg-surface text-left text-[10px] uppercase tracking-wide text-text-muted">
                <th className="px-4 py-2 font-semibold">Name</th>
                <th className="px-4 py-2 font-semibold">Email</th>
                <th className="px-4 py-2 font-semibold">Created</th>
              </tr>
            </thead>
            <tbody>
              {company.users.map((u) => (
                <tr key={u.id} className="border-b border-border last:border-b-0">
                  <td className="px-4 py-2 font-medium text-navy">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <Link href={`/admin/users/${u.id}`} className="text-ace underline">
                        {memberDisplayName(u)}
                      </Link>
                      {u.id === pocId ? (
                        <span className="inline-flex items-center rounded-full bg-ace-bg px-2 py-0.5 text-[10px] font-semibold leading-none text-ace-dark">
                          Point of contact
                        </span>
                      ) : null}
                      {u.staffRole !== "NONE" ? (
                        <span className="inline-flex items-center rounded-full bg-navy px-2 py-0.5 text-[10px] font-semibold leading-none text-white">
                          {u.staffRole}
                        </span>
                      ) : null}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-text-mid">{u.email}</td>
                  <td className="px-4 py-2 text-text-muted tabular-nums">
                    {u.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <form action={renameCompany} className="mt-5 rounded-lg border border-border bg-white p-4 space-y-3">
        <input type="hidden" name="companyId" value={company.id} />
        <p className="text-[12px] font-semibold text-navy">Rename company</p>
        <input type="text" name="name" defaultValue={company.name} required minLength={2} maxLength={200}
          className="w-full rounded-md border border-border px-3 py-2 text-[13px]" />
        <p className="text-[11px] text-text-muted">
          Updates the name everywhere it appears, including ProTrack records synced from this company&apos;s certificates. The change is recorded in the audit log.
        </p>
        <button type="submit" className="rounded-md bg-navy px-3 py-1.5 text-[12px] font-semibold text-white">Rename</button>
      </form>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <form action={grantAppCredits} className="rounded-lg border border-border bg-white p-4 space-y-3">
          <input type="hidden" name="companyId" value={company.id} />
          <p className="text-[12px] font-semibold text-navy">Grant application credits</p>
          <input type="number" name="quantity" min={1} step={1} required placeholder="Quantity"
            className="w-full rounded-md border border-border px-3 py-2 text-[13px]" />
          <button type="submit" className="rounded-md bg-navy px-3 py-1.5 text-[12px] font-semibold text-white">Grant</button>
        </form>

        <form action={adjustCertBalance} className="rounded-lg border border-border bg-white p-4 space-y-3">
          <input type="hidden" name="companyId" value={company.id} />
          <p className="text-[12px] font-semibold text-navy">Adjust cert balance</p>
          <input type="number" name="delta" step={1} required placeholder="Delta (e.g. 100 or -10)"
            className="w-full rounded-md border border-border px-3 py-2 text-[13px]" />
          <p className="text-[11px] text-text-muted">Negative reduces the balance (never below zero).</p>
          <button type="submit" className="rounded-md bg-navy px-3 py-1.5 text-[12px] font-semibold text-white">Apply</button>
        </form>
      </div>

      <h2 className="mt-6 mb-3 text-[13px] font-semibold text-navy">Recent transactions</h2>
      <div className="overflow-hidden rounded-lg border border-border bg-white">
        {company.billingTransactions.length === 0 ? (
          <p className="px-4 py-6 text-center text-[12px] text-text-muted">No transactions.</p>
        ) : (
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-border bg-surface text-left text-[10px] uppercase tracking-wide text-text-muted">
                <th className="px-4 py-2 font-semibold">Date</th>
                <th className="px-4 py-2 font-semibold">Type</th>
                <th className="px-4 py-2 font-semibold">Qty</th>
                <th className="px-4 py-2 font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {company.billingTransactions.map((t: (typeof company.billingTransactions)[number]) => (
                <tr key={t.id} className="border-b border-border last:border-b-0">
                  <td className="px-4 py-2 text-text-muted">{t.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</td>
                  <td className="px-4 py-2 text-text-mid">{t.type}</td>
                  <td className="px-4 py-2 tabular-nums text-text-mid">{t.quantity}</td>
                  <td className="px-4 py-2 tabular-nums text-text-muted">${(t.amountCents / 100).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
