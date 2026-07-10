import { PageHeader } from "@/components/portal-shell";
import { requireStaff } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import type { MarketingLeadSource } from "@prisma/client";

/*
  Admin view of marketing leads captured from the pre-launch VerifyIQ and Verify
  contact forms (lib/leads/actions.ts). Read-only, newest-first. ADMIN-guarded;
  RLS (sql-migrations/0016) is the floor, this guard is the app-layer gate.
*/

const PAGE_SIZE = 100;

const SOURCE_LABEL: Record<MarketingLeadSource, string> = {
  VERIFYIQ: "VerifyIQ",
  VERIFY: "Verify",
};

function formatDate(d: Date): string {
  return d.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

export default async function AdminLeadsPage() {
  await requireStaff("ADMIN");

  const [total, leads] = await Promise.all([
    prisma.marketingLead.count(),
    prisma.marketingLead.findMany({
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      select: {
        id: true,
        source: true,
        contactName: true,
        title: true,
        organization: true,
        email: true,
        message: true,
        createdAt: true,
      },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Marketing Leads"
        subtitle={`${total} lead${total === 1 ? "" : "s"} from VerifyIQ and Verify contact forms`}
      />
      <div className="overflow-x-auto rounded-lg border border-border bg-white">
        {leads.length === 0 ? (
          <p className="px-4 py-10 text-center text-[12px] text-text-muted">
            No leads yet. Submissions from the VerifyIQ and Verify contact forms will show here.
          </p>
        ) : (
          <table className="w-full min-w-[720px] text-[12px]">
            <thead>
              <tr className="border-b border-border bg-surface text-left text-[10px] uppercase tracking-wide text-text-muted">
                <th className="px-4 py-2 font-semibold">Source</th>
                <th className="px-4 py-2 font-semibold">Name</th>
                <th className="px-4 py-2 font-semibold">Organization</th>
                <th className="px-4 py-2 font-semibold">Email</th>
                <th className="px-4 py-2 font-semibold">Message</th>
                <th className="px-4 py-2 font-semibold">Received</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead.id} className="border-b border-border align-top last:border-b-0">
                  <td className="px-4 py-2">
                    <span className="inline-block rounded-full border border-ver/30 bg-ver/10 px-2 py-0.5 text-[10px] font-semibold text-ver">
                      {SOURCE_LABEL[lead.source]}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-navy">
                    <span className="font-medium">{lead.contactName}</span>
                    {lead.title ? (
                      <span className="block text-[11px] text-text-muted">{lead.title}</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2 text-text-mid">{lead.organization}</td>
                  <td className="px-4 py-2 text-text-mid">
                    <a href={`mailto:${lead.email}`} className="text-ace underline">
                      {lead.email}
                    </a>
                  </td>
                  <td className="px-4 py-2 text-text-muted">
                    {lead.message ? (
                      <span className="block max-w-[260px] whitespace-pre-wrap break-words">
                        {lead.message}
                      </span>
                    ) : (
                      "·"
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-text-muted tabular-nums">
                    {formatDate(lead.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {total > PAGE_SIZE ? (
        <p className="mt-3 text-[11px] text-text-muted">
          Showing the {PAGE_SIZE} most recent of {total} leads.
        </p>
      ) : null}
    </>
  );
}
