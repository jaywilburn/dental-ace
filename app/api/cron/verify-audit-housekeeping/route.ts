import { NextResponse, type NextRequest } from "next/server";
import { BatchStatus, DeficiencyStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/*
  Weekly Verify housekeeping cron. Two passes:

   1. Close stale audit batches: ACTIVE batches older than 90 days flip to
      CLOSED. (Their deficiencies retain their own status.)
   2. Escalate orphaned deficiencies: PENDING deficiencies whose deadline
      passed >7 days ago (so the daily cron would've already had a chance to
      escalate them) get flipped to ESCALATED defensively. Belt-and-braces
      for the case where the daily cron was paused.

  Same Authorization: Bearer ${CRON_SECRET} contract.
*/

export const runtime = "nodejs";

const DAY_MS = 24 * 60 * 60 * 1000;
const BATCH_CLOSE_AFTER_DAYS = 90;
const ESCALATE_GRACE_DAYS = 7;

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const provided = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");
  if (secret) return provided === secret;
  return process.env.NODE_ENV !== "production";
}

async function run(request: NextRequest): Promise<Response> {
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const closeCutoff = new Date(now.getTime() - BATCH_CLOSE_AFTER_DAYS * DAY_MS);
  const escalateCutoff = new Date(
    now.getTime() - ESCALATE_GRACE_DAYS * DAY_MS,
  );

  const batchesClosed = await prisma.auditBatch.updateMany({
    where: {
      status: BatchStatus.ACTIVE,
      createdAt: { lt: closeCutoff },
    },
    data: { status: BatchStatus.CLOSED },
  });

  const escalated = await prisma.deficiency.updateMany({
    where: {
      status: DeficiencyStatus.PENDING,
      deadlineAt: { lt: escalateCutoff },
    },
    data: { status: DeficiencyStatus.ESCALATED },
  });

  return NextResponse.json({
    ok: true,
    batchesClosed: batchesClosed.count,
    deficienciesEscalated: escalated.count,
  });
}

export async function GET(request: NextRequest) {
  return run(request);
}

export async function POST(request: NextRequest) {
  return run(request);
}
