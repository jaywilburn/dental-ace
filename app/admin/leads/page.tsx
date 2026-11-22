import Link from "next/link";
import { PageHeader } from "@/components/portal-shell";
import { requireStaff } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import type { MarketingLeadSource } from "@prisma/client";
import { SPAM_REASON_LABEL, SPAM_REASONS, type SpamReason } from "@/lib/leads/spam";

/*
  Admin view of marketing leads captured from the pre-launch VerifyIQ and Verify
  contact forms (lib/leads/actions.ts). Read-only, newest-first. ADMIN-guarded;
  RLS (sql-migrations/0016) is the floor, this guard is the app-layer gate.

  Two tabs: Leads (genuine, the ones that were emailed) and Spam (caught by
  lib/leads/spam.ts, saved but never emailed), with the reason each was caught.
*/

const PAGE_SIZE = 100;

const SOURCE_LABEL: Record<MarketingLeadSource, string> = {
  VERIFYIQ: "VerifyIQ",
  VERIFY: "Verify",
};

function formatDate(d: Date): string {
  return d.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

function reasonLabel(reason: string | null): string {
  return reason && (SPAM_REASONS as readonly string[]).includes(reason)
    ? SPAM_REASON_LABEL[reason as SpamReason]
    : "Spam";
}

export default async function AdminLeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  await requireStaff("ADMIN");
  const { view } = await searchParams;
  const spamView = view === "spam";

  const [total, spamTotal, leads] = await Promise.all([
    prisma.marketingLead.count({ where: { isSpam: false } }),
    prisma.marketingLead.count({ where: { isSpam: true } }),
    prisma.marketingLead.findMany({
      where: { isSpam: spamView },
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
        spamReason: true,
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
      <nav className="mb-5 flex gap-1 border-b border-border" aria-label="Lead views">
        {(
          [
            { href: "/admin/leads", label: `Leads (${total})`, current: !spamView },
            { href: "/admin/leads?view=spam", label: `Spam (${spamTotal})`, current: spamView },
          ] as const
        ).map((t) => (
          <Link
            key={t.href}
            href={t.href}
            aria-current={t.current ? "page" : undefined}
            className={
              t.current
                ? "-mb-px border-b-2 border-ace px-3 py-2 text-[12px] font-semibold text-navy"
                : "-mb-px border-b-2 border-transparent px-3 py-2 text-[12px] font-medium text-text-muted hover:text-navy"
            }
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {spamView ? (
        <p className="mb-3 text-[11px] text-text-muted">
          Caught by the contact-form spam checks. These were saved but never emailed.
        </p>
      ) : null}
      <div className="overflow-x-auto rounded-lg border border-border bg-white">
        {leads.length === 0 ? (
          <p className="px-4 py-10 text-center text-[12px] text-text-muted">
            {spamView
              ? "No spam caught."
              : "No leads yet. Submissions from the VerifyIQ and Verify contact forms will show here."}
          </p>
        ) : (
          <table className="w-full min-w-[720px] text-[12px]">
            <thead>
              <tr className="border-b border-border bg-surface text-left text-[10px] uppercase tracking-wide text-text-muted">
                <th className="px-4 py-2 font-semibold">Source</th>
                {spamView ? <th className="px-4 py-2 font-semibold">Caught for</th> : null}
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
                  {spamView ? (
                    <td className="px-4 py-2 text-text-mid">{reasonLabel(lead.spamReason)}</td>
                  ) : null}
                  <td className="px-4 py-2 text-navy">
                    <span className="font-medium">{lead.contactName}</span>
                    {lead.title ? (
                      <span className="block text-[11px] text-text-muted">{lead.title}</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2 text-text-mid">{lead.organization}</td>
                  <td className="px-4 py-2 text-text-mid">
                    <a href={`mailto:${lead.email}`} className="text-ace-dark underline">
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
      {(spamView ? spamTotal : total) > PAGE_SIZE ? (
        <p className="mt-3 text-[11px] text-text-muted">
          Showing the {PAGE_SIZE} most recent of {spamView ? spamTotal : total}.
        </p>
      ) : null}
    </>
  );
}
