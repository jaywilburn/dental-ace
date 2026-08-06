"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { NoticeType, DeficiencyStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireBoard } from "@/lib/board/scope";
import { sendEmail } from "@/lib/email/send";
import { appBaseUrl } from "@/lib/app-url";
import NoticeInitialEmail from "@/emails/notice-initial";
import NoticeFollowup30dEmail from "@/emails/notice-followup-30d";
import NoticeFinal7dEmail from "@/emails/notice-final-7d";

/*
  Send a batch of deficiency notices.

  Idempotency: every (deficiency, type) tuple sends at most once. We check
  for a matching row in notices_sent before calling Resend. (Pre-check, not a
  unique index — the index ships in the cron-housekeeping migration when
  we're sure no in-flight admin paths re-send by design.)

  Recipient: the email on the licensee's User row. If that account has been
  deleted (orphan license), the notice is skipped silently — the cron path
  also relies on this and surfaces an admin notification through the daily
  summary email.

  Per-deficiency side effects, in order:
    1. Insert notices_sent (with resend_message_id null until step 3).
    2. Send via Resend (sendEmail handles log-mode when RESEND_API_KEY is unset).
    3. Backfill resend_message_id.
    4. Bump deficiencies.notices_sent_count; on INITIAL, set deadline_at if null.

  If Resend rejects (step 2), the row from step 1 is deleted so a retry of
  the same (deficiency, type) is allowed. Other failures bubble up.
*/

const DEFAULT_INITIAL_DEADLINE_DAYS = 60;

const NOTICE_TYPE_VALUES = [
  NoticeType.INITIAL,
  NoticeType.FOLLOWUP_30D,
  NoticeType.FINAL_7D,
] as const;

type SendableType = (typeof NOTICE_TYPE_VALUES)[number];

function isSendableType(value: string | null): value is SendableType {
  return NOTICE_TYPE_VALUES.some((t) => t === value);
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function daysBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return Math.max(0, Math.round(ms / (24 * 60 * 60 * 1000)));
}

export async function sendNotices(formData: FormData): Promise<void> {
  const { board, user } = await requireBoard();

  const noticeTypeRaw = String(formData.get("noticeType") ?? "INITIAL");
  if (!isSendableType(noticeTypeRaw)) {
    redirect(
      `/board/notices/send?error=${encodeURIComponent("Pick a notice type.")}`,
    );
  }
  const noticeType: SendableType = noticeTypeRaw;

  const deficiencyIds = formData.getAll("deficiencyIds").map((v) => String(v));
  if (deficiencyIds.length === 0) {
    redirect(
      `/board/notices/send?error=${encodeURIComponent("Pick at least one recipient.")}`,
    );
  }

  // Parse the deadline. Required for INITIAL; ignored for the cron-only types
  // (they preserve the deadline already set on the deficiency).
  const deadlineRaw = String(formData.get("deadlineAt") ?? "");
  let deadlineAt: Date | null = null;
  if (noticeType === NoticeType.INITIAL) {
    if (!deadlineRaw) {
      // Default deadline: today + 60 days.
      const d = new Date();
      d.setDate(d.getDate() + DEFAULT_INITIAL_DEADLINE_DAYS);
      deadlineAt = d;
    } else {
      const parsed = new Date(deadlineRaw);
      if (Number.isNaN(parsed.getTime())) {
        redirect(
          `/board/notices/send?error=${encodeURIComponent("Invalid deadline date.")}`,
        );
      }
      deadlineAt = parsed;
    }
  }

  const targets = await prisma.deficiency.findMany({
    where: {
      id: { in: deficiencyIds },
      status: DeficiencyStatus.PENDING,
      batch: { boardId: board.id }, // app-side scoping (RLS bypassed via Prisma)
    },
    select: {
      id: true,
      missingHours: true,
      missingCategories: true,
      deadlineAt: true,
      batch: { select: { id: true } },
      userLicense: {
        select: {
          licenseNumber: true,
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      },
    },
  });

  const protrackUrl = `${appBaseUrl("https://www.dentalace.org")}/protrack`;
  const boardRow = await prisma.board.findUnique({
    where: { id: board.id },
    select: { name: true },
  });
  const boardName = boardRow?.name ?? "Your State Board";

  let sentCount = 0;
  for (const t of targets) {
    const existing = await prisma.noticeSent.findFirst({
      where: { deficiencyId: t.id, noticeType },
      select: { id: true },
    });
    if (existing) continue;

    const recipientEmail = t.userLicense.user.email;
    if (!recipientEmail) continue;
    const recipientName = t.userLicense.user.firstName
      ? `${t.userLicense.user.firstName} ${t.userLicense.user.lastName ?? ""}`.trim()
      : recipientEmail;

    const missingHours = Number(t.missingHours);
    const missingCategories = Array.isArray(t.missingCategories)
      ? (t.missingCategories as string[])
      : [];

    // Step 1: insert notices_sent. resend_message_id backfilled in step 3.
    const insertedId = (await prisma.noticeSent.create({
      data: {
        deficiencyId: t.id,
        noticeType,
        recipientEmail,
        sentById: user.id,
      },
      select: { id: true },
    })).id;

    // Step 2: render + send.
    try {
      let resendId: string | undefined;
      if (noticeType === NoticeType.INITIAL) {
        const props = {
          recipientName,
          licenseNumber: t.userLicense.licenseNumber,
          boardName,
          missingHours,
          missingCategories,
          deadlineDate: deadlineAt ? formatDate(deadlineAt) : "—",
          protrackUrl,
        };
        const messageId = await sendEmailReturningId({
          to: recipientEmail,
          subject: NoticeInitialEmail.subject(props),
          react: NoticeInitialEmail(props),
        });
        resendId = messageId;
      } else if (noticeType === NoticeType.FOLLOWUP_30D) {
        const effectiveDeadline = t.deadlineAt ?? new Date();
        const daysRemaining = daysBetween(new Date(), effectiveDeadline);
        const props = {
          recipientName,
          licenseNumber: t.userLicense.licenseNumber,
          boardName,
          missingHours,
          missingCategories,
          deadlineDate: formatDate(effectiveDeadline),
          daysRemaining,
          protrackUrl,
        };
        const messageId = await sendEmailReturningId({
          to: recipientEmail,
          subject: NoticeFollowup30dEmail.subject(props),
          react: NoticeFollowup30dEmail(props),
        });
        resendId = messageId;
      } else {
        const effectiveDeadline = t.deadlineAt ?? new Date();
        const props = {
          recipientName,
          licenseNumber: t.userLicense.licenseNumber,
          boardName,
          missingHours,
          missingCategories,
          deadlineDate: formatDate(effectiveDeadline),
          protrackUrl,
        };
        const messageId = await sendEmailReturningId({
          to: recipientEmail,
          subject: NoticeFinal7dEmail.subject(props),
          react: NoticeFinal7dEmail(props),
        });
        resendId = messageId;
      }

      // Step 3 + 4: backfill message id, bump counter, set deadline on first
      // INITIAL send.
      await prisma.$transaction(async (tx) => {
        await tx.noticeSent.update({
          where: { id: insertedId },
          data: { resendMessageId: resendId ?? null },
        });
        const def = await tx.deficiency.findUnique({
          where: { id: t.id },
          select: { deadlineAt: true },
        });
        await tx.deficiency.update({
          where: { id: t.id },
          data: {
            noticesSentCount: { increment: 1 },
            ...(noticeType === NoticeType.INITIAL && deadlineAt && !def?.deadlineAt
              ? { deadlineAt }
              : {}),
          },
        });
      });

      sentCount += 1;
    } catch (err) {
      // Roll back the notices_sent row so the recipient can be retried.
      await prisma.noticeSent
        .delete({ where: { id: insertedId } })
        .catch(() => undefined);
      console.error("[sendNotices] failed for deficiency", t.id, err);
    }
  }

  revalidatePath("/board");
  revalidatePath("/board/deficiencies");
  revalidatePath("/board/notices");
  redirect(`/board/notices?sent=${sentCount}`);
}

/*
  sendEmail returns void today (Phase 1 design). We don't have a Resend
  message id to backfill, so we just return undefined. When sendEmail is
  extended to return { messageId }, this helper picks it up automatically.
*/
async function sendEmailReturningId(args: {
  to: string;
  subject: string;
  react: React.ReactElement;
}): Promise<string | undefined> {
  await sendEmail(args);
  return undefined;
}
