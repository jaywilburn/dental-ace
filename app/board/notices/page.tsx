import Link from "next/link";
import { PageHeader } from "@/components/portal-shell";
import { requireBoard } from "@/lib/board/scope";
import { prisma } from "@/lib/prisma";
import { NoticeType } from "@prisma/client";

/*
  /board/notices — chronological ledger of every notice sent for this board's
  deficiencies. Cron sends + manual sends from /board/notices/send both land
  here.
*/

const TYPE_META: Record<NoticeType, { label: string; className: string }> = {
  INITIAL: { label: "Initial", className: "bg-red-50 text-red-700" },
  FOLLOWUP_30D: { label: "30-day follow-up", className: "bg-ace-bg text-ace-dark" },
  FINAL_7D: { label: "Final warning", className: "bg-purple/15 text-purple" },
  RESOLVED_CONFIRMATION: {
    label: "Resolved",
    className: "bg-green-50 text-green-700",
  },
  PROTRACK_INVITE: {
    label: "ProTrack invite",
    className: "bg-surface text-text-mid",
  },
};

export default async function NoticesLedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string }>;
}) {
  const { board } = await requireBoard();
  const { sent } = await searchParams;
  const sentCount = sent ? Number(sent) : NaN;

  const notices = await prisma.noticeSent.findMany({
    where: { deficiency: { batch: { boardId: board.id } } },
    orderBy: { sentAt: "desc" },
    take: 200,
    select: {
      id: true,
      noticeType: true,
      recipientEmail: true,
      sentAt: true,
      sentBy: { select: { firstName: true, lastName: true, email: true } },
      deficiency: {
        select: {
          id: true,
          missingHours: true,
          batch: { select: { id: true, batchCode: true } },
          userLicense: {
            select: {
              licenseNumber: true,
              user: { select: { firstName: true, lastName: true } },
            },
          },
        },
      },
    },
  });

  return (
    <>
      <PageHeader
        title="Notices"
        subtitle="Most recent 200 notices sent from your board. Cron sends and manual sends both appear here."
      />

      {Number.isFinite(sentCount) && sentCount > 0 ? (
        <p className="mb-4 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-[12px] text-green-700 text-pretty">
          Sent {sentCount} notice{sentCount === 1 ? "" : "s"}.
        </p>
      ) : null}

      {notices.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-white p-8 text-center">
          <p className="font-serif text-base font-semibold text-navy">
            No notices sent yet
          </p>
          <p className="mt-1 text-[12px] text-text-muted">
            Notices appear here after you send an initial batch from an audit,
            or when the daily cron fires follow-ups.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-white">
          <table className="w-full text-[12px]">
            <thead className="border-b border-border bg-surface text-left text-[10px] uppercase tracking-wide text-text-muted">
              <tr>
                <th className="px-4 py-2 font-semibold">Sent</th>
                <th className="px-4 py-2 font-semibold">Type</th>
                <th className="px-4 py-2 font-semibold">License</th>
                <th className="px-4 py-2 font-semibold">Recipient</th>
                <th className="px-4 py-2 font-semibold">Batch</th>
                <th className="px-4 py-2 font-semibold">Sent by</th>
              </tr>
            </thead>
            <tbody>
              {notices.map((n) => {
                const meta = TYPE_META[n.noticeType];
                const sentBy = n.sentBy
                  ? n.sentBy.firstName
                    ? `${n.sentBy.firstName} ${n.sentBy.lastName ?? ""}`.trim()
                    : n.sentBy.email
                  : "Cron";
                const recipientName = n.deficiency.userLicense.user.firstName
                  ? `${n.deficiency.userLicense.user.firstName} ${n.deficiency.userLicense.user.lastName ?? ""}`.trim()
                  : n.recipientEmail;
                return (
                  <tr key={n.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 text-text-muted">
                      {n.sentAt.toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${meta.className}`}
                      >
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-4 py-2 font-mono text-[11px] text-navy">
                      {n.deficiency.userLicense.licenseNumber}
                    </td>
                    <td className="px-4 py-2 text-text-mid">
                      <div>{recipientName}</div>
                      <div className="text-[10px] text-text-muted">
                        {n.recipientEmail}
                      </div>
                    </td>
                    <td className="px-4 py-2 font-mono text-[11px] text-text-muted">
                      <Link
                        href={`/board/audits/${n.deficiency.batch.id}`}
                        className="hover:underline"
                      >
                        {n.deficiency.batch.batchCode}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-text-muted">{sentBy}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
