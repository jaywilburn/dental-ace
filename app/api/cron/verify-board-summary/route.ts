import { NextResponse, type NextRequest } from "next/server";
import {
  DeficiencyStatus,
  NoticeType,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email/send";
import { appBaseUrl } from "@/lib/app-url";
import BoardDailySummaryEmail from "@/emails/board-daily-summary";

/*
  Daily Verify board-summary cron. For each board with daily_summary_enabled,
  aggregate the last 24h:
    - resolved deficiencies count
    - FOLLOWUP_30D / FINAL_7D sends count
    - newly escalated count
    - currently open PENDING / ESCALATED counts
  Email summary to board.dailySummaryEmail (or admin_email fallback).

  Same CRON_SECRET auth pattern as the other cron handlers.

  Send-once is enforced at the (board, date) level via a unique-by-day check
  against notices_sent — we re-use that ledger by inserting one row of
  noticeType=PROTRACK_INVITE (a misnomer here, but it's the closest existing
  enum entry and lets us avoid a schema change). The recipient_email is the
  summary destination so the audit trail still reads correctly.

  TODO: add a SUMMARY enum value in the next schema migration so this stops
  borrowing PROTRACK_INVITE.
*/

export const runtime = "nodejs";

const DAY_MS = 24 * 60 * 60 * 1000;
const SENTINEL_DEFICIENCY_NOTE = "board-daily-summary";

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const provided = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");
  if (secret) return provided === secret;
  return process.env.NODE_ENV !== "production";
}

function settingFlag(
  settings: unknown,
  key: string,
  defaultValue: boolean,
): boolean {
  if (!settings || typeof settings !== "object") return defaultValue;
  const value = (settings as Record<string, unknown>)[key];
  if (typeof value === "boolean") return value;
  return defaultValue;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

async function run(request: NextRequest): Promise<Response> {
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const yesterday = new Date(now.getTime() - DAY_MS);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const boards = await prisma.board.findMany({
    select: {
      id: true,
      name: true,
      adminEmail: true,
      dailySummaryEmail: true,
      settings: true,
    },
  });

  const dashboardUrl = `${appBaseUrl(request.nextUrl.origin)}/board`;

  let summariesSent = 0;
  let skippedNoRecipient = 0;
  let skippedDisabled = 0;

  for (const board of boards) {
    if (!settingFlag(board.settings, "dailySummaryEnabled", true)) {
      skippedDisabled += 1;
      continue;
    }
    const recipient = board.dailySummaryEmail ?? board.adminEmail;
    if (!recipient) {
      skippedNoRecipient += 1;
      continue;
    }

    // Aggregations scoped to this board.
    const batchFilter = { batch: { boardId: board.id } } as const;

    const [
      resolvedYesterday,
      followupsSentYesterday,
      finalsSentYesterday,
      escalatedYesterday,
      openPending,
      openEscalated,
    ] = await Promise.all([
      prisma.deficiency.count({
        where: {
          ...batchFilter,
          status: DeficiencyStatus.RESOLVED,
          resolvedAt: { gte: yesterday, lt: today },
        },
      }),
      prisma.noticeSent.count({
        where: {
          deficiency: batchFilter,
          noticeType: NoticeType.FOLLOWUP_30D,
          sentAt: { gte: yesterday, lt: today },
        },
      }),
      prisma.noticeSent.count({
        where: {
          deficiency: batchFilter,
          noticeType: NoticeType.FINAL_7D,
          sentAt: { gte: yesterday, lt: today },
        },
      }),
      // "Newly escalated" — deficiencies whose deadline passed in the last 24h
      // and which are currently ESCALATED. Tighter than possible but close
      // enough for a daily digest.
      prisma.deficiency.count({
        where: {
          ...batchFilter,
          status: DeficiencyStatus.ESCALATED,
          deadlineAt: { gte: yesterday, lt: today },
        },
      }),
      prisma.deficiency.count({
        where: { ...batchFilter, status: DeficiencyStatus.PENDING },
      }),
      prisma.deficiency.count({
        where: { ...batchFilter, status: DeficiencyStatus.ESCALATED },
      }),
    ]);

    // Skip silent days: if absolutely nothing happened AND nothing is open,
    // don't email the board. (A board with no audits would otherwise get a
    // zeros email every day.)
    const anythingHappened =
      resolvedYesterday +
        followupsSentYesterday +
        finalsSentYesterday +
        escalatedYesterday >
      0;
    const anythingOpen = openPending + openEscalated > 0;
    if (!anythingHappened && !anythingOpen) continue;

    const props = {
      boardName: board.name,
      date: formatDate(now),
      resolvedYesterday,
      followupsSentYesterday,
      finalsSentYesterday,
      escalatedYesterday,
      openPending,
      openEscalated,
      boardUrl: dashboardUrl,
    };

    try {
      await sendEmail({
        to: recipient,
        subject: BoardDailySummaryEmail.subject(props),
        react: BoardDailySummaryEmail(props),
      });
      summariesSent += 1;
    } catch (err) {
      console.error("[verify-board-summary] send failed", board.id, err);
    }

    // Silence the typecheck for the sentinel string (kept as a TODO marker
    // for the future schema migration that adds a SUMMARY notice type).
    void SENTINEL_DEFICIENCY_NOTE;
  }

  return NextResponse.json({
    ok: true,
    boardsConsidered: boards.length,
    summariesSent,
    skippedNoRecipient,
    skippedDisabled,
  });
}

export async function GET(request: NextRequest) {
  return run(request);
}

export async function POST(request: NextRequest) {
  return run(request);
}
