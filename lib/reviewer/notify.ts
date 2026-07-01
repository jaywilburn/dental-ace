import "server-only";
import { prisma } from "@/lib/prisma";

/*
  Recipients for the "new course/event submitted" reviewer notification.

  Pulled live from accounts: every active Reviewer + Admin (so AADB doesn't have
  to maintain a list as it provisions reviewer accounts), unioned with any extra
  addresses in REVIEWER_NOTIFICATION_EMAILS (external reviewers without an
  account). Deduped case-insensitively. Callers BCC these so reviewers don't see
  each other's addresses.
*/
export async function getReviewerNotificationRecipients(): Promise<string[]> {
  const staff = await prisma.user.findMany({
    where: {
      staffRole: { in: ["REVIEWER", "ADMIN"] },
      disabledAt: null,
      emailVerifiedAt: { not: null },
    },
    select: { email: true },
  });

  const envExtra = (process.env.REVIEWER_NOTIFICATION_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const seen = new Set<string>();
  const out: string[] = [];
  for (const email of [...staff.map((s) => s.email), ...envExtra]) {
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(email);
  }
  return out;
}

/**
 * A single mailbox to place in the `to` field when BCC-ing the reviewer list, so
 * the visible recipient isn't an individual reviewer. Falls back to the from
 * address when no admin inbox is configured.
 */
export function reviewerNotificationToAddress(): string {
  const admin = (process.env.AADB_ADMIN_EMAIL ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)[0];
  return admin ?? process.env.RESEND_FROM_EMAIL ?? "noreply@dentalace.org";
}
