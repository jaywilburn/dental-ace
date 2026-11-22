import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { MarketingLeadInput } from "@/lib/leads/schema";
import { spamReasonFor, type SpamReason } from "@/lib/leads/spam";

/*
  The database half of submitMarketingLead: rate limit, repeat check, spam
  verdict and insert, as one unit. Must run inside a transaction.

  The rate limit and the repeat check both read the table and then write to
  it. Run as separate statements, a burst of parallel submissions would all
  read the same "under the limit, never seen before" answer and all be saved
  and emailed. So the first statement takes an advisory lock keyed on the
  submitter's IP hash, held until the transaction ends: submissions from one
  IP queue up and each sees the ones before it. Same idiom as the Event ID and
  board-claim locks.

  The lock is per IP on purpose. One global lock would also serialize the
  repeat check across different IPs, but would let a flood from one address
  hold up a genuine inquiry from another.

  Kept out of actions.ts (a "use server" file may only export actions) and
  free of server-only imports, so it is unit-tested with a stand-in client.
*/

export const LEAD_RATE_LIMIT = 5;
export const LEAD_RATE_WINDOW_MS = 10 * 60 * 1000;
export const LEAD_REPEAT_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Advisory-lock key for one submitter. Prefixed so it cannot coincide with the state or company-name lock hashes. */
export function leadIpLockKey(ipHash: string): bigint {
  return createHash("sha256").update(`leadip-lock:${ipHash}`).digest().readBigInt64BE(0);
}

export type SaveLeadResult =
  /** Over the rate limit: nothing was written. */
  | { saved: false }
  | { saved: true; spamReason: SpamReason | null };

export async function saveLeadUnderLimit(
  tx: Prisma.TransactionClient,
  input: {
    lead: MarketingLeadInput;
    ipHash: string;
    nowMs: number;
    honeypotFilled: boolean;
    formTimingOk: boolean;
  },
): Promise<SaveLeadResult> {
  const { lead, ipHash, nowMs } = input;

  await tx.$executeRaw`select pg_advisory_xact_lock(${leadIpLockKey(ipHash)})`;

  // 5 saved submissions (spam included) per IP per 10 minutes.
  const recentFromIp = await tx.marketingLead.count({
    where: { ipHash, createdAt: { gte: new Date(nowMs - LEAD_RATE_WINDOW_MS) } },
  });
  if (recentFromIp >= LEAD_RATE_LIMIT) return { saved: false };

  const recentLeads = await tx.marketingLead.findMany({
    where: { createdAt: { gte: new Date(nowMs - LEAD_REPEAT_WINDOW_MS) } },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { email: true, message: true },
  });
  const spamReason = spamReasonFor({
    lead,
    honeypotFilled: input.honeypotFilled,
    formTimingOk: input.formTimingOk,
    recentLeads,
  });

  await tx.marketingLead.create({
    data: {
      source: lead.source,
      contactName: lead.contactName,
      title: lead.title ?? null,
      organization: lead.organization,
      email: lead.email,
      message: lead.message ?? null,
      isSpam: spamReason !== null,
      spamReason,
      ipHash,
    },
  });
  return { saved: true, spamReason };
}
