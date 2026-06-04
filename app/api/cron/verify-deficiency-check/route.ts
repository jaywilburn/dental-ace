import { NextResponse, type NextRequest } from "next/server";
import {
  DeficiencyStatus,
  NoticeType,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email/send";
import { appBaseUrl } from "@/lib/app-url";
import { recheckDeficiency } from "@/lib/board/deficiencies/check";
import NoticeFollowup30dEmail from "@/emails/notice-followup-30d";
import NoticeFinal7dEmail from "@/emails/notice-final-7d";
import NoticeResolvedEmail from "@/emails/notice-resolved";

/*
  Daily Verify deficiency-check cron. For every PENDING deficiency across the
  platform:

   1. Recheck compliance from the licensee's current verified CeCertificates.
      If now compliant, mark RESOLVED and send a RESOLVED_CONFIRMATION email
      (once, gated by the notices_sent ledger).
   2. If still PENDING:
      - 30+ days since the INITIAL notice and no FOLLOWUP_30D yet
        AND board.settings.autoFollowup30d enabled → send FOLLOWUP_30D.
      - Deadline within the next 7 days and no FINAL_7D yet
        AND board.settings.autoFinal7d enabled → send FINAL_7D.
      - Deadline already passed → flip to ESCALATED (no email; the daily
        summary surfaces escalations).

  Auth: Authorization: Bearer ${CRON_SECRET}. CRON_SECRET unset means dev:
  any request is allowed in non-production, refused in production.

  Idempotency: send-once is enforced by inserting into notices_sent BEFORE
  the send. The (deficiency, type) tuple is checked first; duplicates are
  skipped. If the send throws, the ledger row is deleted so a retry on the
  next day's run is allowed.
*/

export const runtime = "nodejs";

const DAY_MS = 24 * 60 * 60 * 1000;
const FOLLOWUP_THRESHOLD_DAYS = 30;
const FINAL_WINDOW_DAYS = 7;

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const provided = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");
  if (secret) return provided === secret;
  return process.env.NODE_ENV !== "production";
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function settingFlag(
  settings: unknown,
  key: "autoFollowup30d" | "autoFinal7d" | "dailySummaryEnabled",
  defaultValue: boolean,
): boolean {
  if (!settings || typeof settings !== "object") return defaultValue;
  const value = (settings as Record<string, unknown>)[key];
  if (typeof value === "boolean") return value;
  return defaultValue;
}

async function loggedSend(
  deficiencyId: string,
  noticeType: NoticeType,
  recipientEmail: string,
  send: () => Promise<void>,
): Promise<boolean> {
  const existing = await prisma.noticeSent.findFirst({
    where: { deficiencyId, noticeType },
    select: { id: true },
  });
  if (existing) return false;

  const row = await prisma.noticeSent.create({
    data: {
      deficiencyId,
      noticeType,
      recipientEmail,
      sentById: null, // cron-driven
    },
    select: { id: true },
  });
  try {
    await send();
    return true;
  } catch (err) {
    // Roll back so the next run can try again.
    await prisma.noticeSent.delete({ where: { id: row.id } }).catch(() => undefined);
    console.error("[verify-deficiency-check] send failed", deficiencyId, noticeType, err);
    return false;
  }
}

async function run(request: NextRequest): Promise<Response> {
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const protrackUrl = `${appBaseUrl(request.nextUrl.origin)}/protrack`;

  // Pull every deficiency that might need action: PENDING (rechecks + auto-sends)
  // plus the ones we just marked RESOLVED above (handled in-loop).
  const pending = await prisma.deficiency.findMany({
    where: { status: DeficiencyStatus.PENDING },
    select: {
      id: true,
      missingHours: true,
      missingCategories: true,
      deadlineAt: true,
      batch: { select: { id: true, board: { select: { name: true, settings: true } } } },
      userLicense: {
        select: {
          licenseNumber: true,
          user: { select: { email: true, firstName: true, lastName: true } },
        },
      },
      notices: {
        select: { noticeType: true, sentAt: true },
      },
    },
  });

  let rechecked = 0;
  let resolved = 0;
  let followupsSent = 0;
  let finalsSent = 0;
  let escalated = 0;

  for (const def of pending) {
    rechecked += 1;
    const outcome = await recheckDeficiency(def.id);

    const recipientEmail = def.userLicense.user.email;
    if (!recipientEmail) continue;
    const recipientName = def.userLicense.user.firstName
      ? `${def.userLicense.user.firstName} ${def.userLicense.user.lastName ?? ""}`.trim()
      : recipientEmail;
    const boardName = def.batch.board.name;

    if (outcome.status === "resolved") {
      resolved += 1;
      await loggedSend(
        def.id,
        NoticeType.RESOLVED_CONFIRMATION,
        recipientEmail,
        async () => {
          const props = {
            recipientName,
            licenseNumber: def.userLicense.licenseNumber,
            boardName,
            resolvedDate: formatDate(now),
          };
          await sendEmail({
            to: recipientEmail,
            subject: NoticeResolvedEmail.subject(props),
            react: NoticeResolvedEmail(props),
          });
        },
      );
      continue;
    }

    if (outcome.status !== "still_pending") continue;

    // Deadline escalation: past deadline + still PENDING → ESCALATED.
    if (def.deadlineAt && def.deadlineAt.getTime() < now.getTime()) {
      await prisma.deficiency.update({
        where: { id: def.id },
        data: { status: DeficiencyStatus.ESCALATED },
      });
      escalated += 1;
      continue;
    }

    const settings = def.batch.board.settings;
    const initialNotice = def.notices.find((n) => n.noticeType === NoticeType.INITIAL);
    const followupSent = def.notices.find(
      (n) => n.noticeType === NoticeType.FOLLOWUP_30D,
    );
    const finalSent = def.notices.find(
      (n) => n.noticeType === NoticeType.FINAL_7D,
    );

    // 30-day follow-up: needs an INITIAL anchor.
    if (
      initialNotice &&
      !followupSent &&
      settingFlag(settings, "autoFollowup30d", true)
    ) {
      const daysSinceInitial =
        (now.getTime() - initialNotice.sentAt.getTime()) / DAY_MS;
      if (daysSinceInitial >= FOLLOWUP_THRESHOLD_DAYS) {
        const effectiveDeadline = def.deadlineAt ?? now;
        const daysRemaining = Math.max(
          0,
          Math.round((effectiveDeadline.getTime() - now.getTime()) / DAY_MS),
        );
        const props = {
          recipientName,
          licenseNumber: def.userLicense.licenseNumber,
          boardName,
          missingHours: Number(def.missingHours),
          missingCategories: Array.isArray(def.missingCategories)
            ? (def.missingCategories as string[])
            : [],
          deadlineDate: formatDate(effectiveDeadline),
          daysRemaining,
          protrackUrl,
        };
        const ok = await loggedSend(
          def.id,
          NoticeType.FOLLOWUP_30D,
          recipientEmail,
          async () => {
            await sendEmail({
              to: recipientEmail,
              subject: NoticeFollowup30dEmail.subject(props),
              react: NoticeFollowup30dEmail(props),
            });
          },
        );
        if (ok) {
          followupsSent += 1;
          await prisma.deficiency.update({
            where: { id: def.id },
            data: { noticesSentCount: { increment: 1 } },
          });
        }
      }
    }

    // 7-day final warning: needs a deadline anchor.
    if (
      def.deadlineAt &&
      !finalSent &&
      settingFlag(settings, "autoFinal7d", true)
    ) {
      const daysUntilDeadline =
        (def.deadlineAt.getTime() - now.getTime()) / DAY_MS;
      if (daysUntilDeadline <= FINAL_WINDOW_DAYS && daysUntilDeadline > 0) {
        const props = {
          recipientName,
          licenseNumber: def.userLicense.licenseNumber,
          boardName,
          missingHours: Number(def.missingHours),
          missingCategories: Array.isArray(def.missingCategories)
            ? (def.missingCategories as string[])
            : [],
          deadlineDate: formatDate(def.deadlineAt),
          protrackUrl,
        };
        const ok = await loggedSend(
          def.id,
          NoticeType.FINAL_7D,
          recipientEmail,
          async () => {
            await sendEmail({
              to: recipientEmail,
              subject: NoticeFinal7dEmail.subject(props),
              react: NoticeFinal7dEmail(props),
            });
          },
        );
        if (ok) {
          finalsSent += 1;
          await prisma.deficiency.update({
            where: { id: def.id },
            data: { noticesSentCount: { increment: 1 } },
          });
        }
      }
    }
  }

  return NextResponse.json({
    ok: true,
    rechecked,
    resolved,
    followupsSent,
    finalsSent,
    escalated,
  });
}

export async function GET(request: NextRequest) {
  return run(request);
}

export async function POST(request: NextRequest) {
  return run(request);
}
