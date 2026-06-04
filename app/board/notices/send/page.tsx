import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/portal-shell";
import { requireBoard } from "@/lib/board/scope";
import { prisma } from "@/lib/prisma";
import { sendNotices } from "@/lib/board/notices/send";
import { DeficiencyStatus, NoticeType } from "@prisma/client";
import { licenseTypeShort } from "@/lib/protrack/reference";
import { parseStoredSettings } from "@/lib/board/settings/schema";

/*
  /board/notices/send — INITIAL notice composer.

  Entry: linked from /board/audits/[batchId] with ?batch=<id>. Loads every
  PENDING deficiency in that batch that has no INITIAL notice yet, lets the
  board confirm the recipient list and pick a deadline, then posts to the
  sendNotices server action.

  The 30-day follow-up and 7-day final warning are cron-driven; the composer
  exposes them too for manual catch-up but defaults to INITIAL.
*/

const fieldClass =
  "w-full rounded-md border border-border bg-white px-3 py-2 text-[13px] text-navy outline-none focus:border-ver";
const labelClass = "mb-1 block text-[11px] font-semibold text-text-mid";

function defaultDeadline(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default async function NoticesComposerPage({
  searchParams,
}: {
  searchParams: Promise<{ batch?: string; error?: string }>;
}) {
  const { board } = await requireBoard();
  const { batch: batchId, error } = await searchParams;

  if (!batchId) {
    // Composer is always launched from an audit batch today. Without one,
    // bounce the user to the audit list so they can pick a batch first.
    redirect("/board/audits");
  }

  const batch = await prisma.auditBatch.findFirst({
    where: { id: batchId, boardId: board.id },
    select: { id: true, batchCode: true, name: true },
  });
  if (!batch) redirect("/board/audits");

  // Recipients: every PENDING deficiency in this batch with no INITIAL yet.
  const deficiencies = await prisma.deficiency.findMany({
    where: {
      batchId: batch.id,
      status: DeficiencyStatus.PENDING,
      notices: { none: { noticeType: NoticeType.INITIAL } },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      missingHours: true,
      userLicense: {
        select: {
          licenseNumber: true,
          licenseType: true,
          user: { select: { email: true, firstName: true, lastName: true } },
        },
      },
    },
  });

  return (
    <>
      <PageHeader
        title="Send deficiency notices"
        subtitle={`${batch.batchCode} · ${batch.name}`}
      />

      {error ? (
        <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700 text-pretty">
          {error}
        </p>
      ) : null}

      {deficiencies.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-white p-8 text-center">
          <p className="font-serif text-base font-semibold text-navy">
            No recipients
          </p>
          <p className="mt-1 text-[12px] text-text-muted">
            Every PENDING deficiency in this batch has already received an
            INITIAL notice. Follow-ups and final warnings are sent automatically
            by the daily cron.
          </p>
          <Link
            href={`/board/audits/${batch.id}`}
            className="mt-4 inline-block text-[11px] font-semibold text-ver hover:underline"
          >
            ← Back to batch
          </Link>
        </div>
      ) : (
        <form action={sendNotices} className="space-y-6">
          <input type="hidden" name="batchId" value={batch.id} />

          <div className="rounded-lg border border-border bg-white p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Notice type</label>
                <select name="noticeType" className={fieldClass} defaultValue="INITIAL">
                  <option value="INITIAL">Initial notice</option>
                  <option value="FOLLOWUP_30D">30-day follow-up</option>
                  <option value="FINAL_7D">7-day final warning</option>
                </select>
                <p className="mt-1 text-[10px] text-text-muted">
                  Cron fires follow-ups/finals automatically. Use manual sends
                  for catch-up.
                </p>
              </div>
              <div>
                <label className={labelClass}>Response deadline</label>
                <input
                  type="date"
                  name="deadlineAt"
                  defaultValue={defaultDeadline(
                    parseStoredSettings(board.settings).deficiencyResponseDays,
                  )}
                  className={fieldClass}
                />
                <p className="mt-1 text-[10px] text-text-muted">
                  Applied on INITIAL only. Follow-ups preserve the original
                  deadline.
                </p>
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-border bg-white">
            <div className="flex items-center justify-between border-b border-border bg-surface px-4 py-2 text-[11px] text-text-muted">
              <span>
                Recipients ({deficiencies.length}) — all selected by default
              </span>
            </div>
            <table className="w-full text-[12px]">
              <thead className="border-b border-border bg-white text-left text-[10px] uppercase tracking-wide text-text-muted">
                <tr>
                  <th className="px-4 py-2 font-semibold">
                    <span className="sr-only">Include</span>
                  </th>
                  <th className="px-4 py-2 font-semibold">License</th>
                  <th className="px-4 py-2 font-semibold">Name</th>
                  <th className="px-4 py-2 font-semibold">Email</th>
                  <th className="px-4 py-2 font-semibold">Type</th>
                  <th className="px-4 py-2 text-right font-semibold">
                    Missing hrs
                  </th>
                </tr>
              </thead>
              <tbody>
                {deficiencies.map((d) => {
                  const name = d.userLicense.user.firstName
                    ? `${d.userLicense.user.firstName} ${d.userLicense.user.lastName ?? ""}`.trim()
                    : d.userLicense.user.email;
                  return (
                    <tr key={d.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-2">
                        <input
                          type="checkbox"
                          name="deficiencyIds"
                          value={d.id}
                          defaultChecked
                          className="size-3.5 accent-ver"
                        />
                      </td>
                      <td className="px-4 py-2 font-mono text-[11px] text-navy">
                        {d.userLicense.licenseNumber}
                      </td>
                      <td className="px-4 py-2 text-text-mid">{name}</td>
                      <td className="px-4 py-2 text-text-muted">
                        {d.userLicense.user.email}
                      </td>
                      <td className="px-4 py-2 text-text-muted">
                        {licenseTypeShort(d.userLicense.licenseType)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-text-mid">
                        {Number(d.missingHours).toFixed(1)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between border-t border-border pt-4">
            <Link
              href={`/board/audits/${batch.id}`}
              className="text-[11px] font-semibold text-text-muted hover:text-navy hover:underline"
            >
              ← Cancel
            </Link>
            <button
              type="submit"
              className="rounded-md bg-ver px-4 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-ver/90"
            >
              Send notices
            </button>
          </div>
        </form>
      )}
    </>
  );
}
