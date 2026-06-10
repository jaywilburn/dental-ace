/*
  Pure decision logic for the Dental ACE lifecycle cron. No DB, no server-only —
  unit-tested directly. The cron wires these to Prisma + the notification_log
  dedupe store.
*/

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days from `now` until `date`, rounded up. Past dates go negative. */
export function daysUntil(date: Date, now: Date): number {
  return Math.ceil((date.getTime() - now.getTime()) / DAY_MS);
}

/** Which course-expiry thresholds apply. d60 at <=60 days; d30 also at <=30. */
export function dueCourseReminders(days: number): ("d60" | "d30")[] {
  if (days > 60) return [];
  if (days > 30) return ["d60"];
  return ["d60", "d30"];
}

/** Mutually-exclusive cert-balance alert classification. */
export function balanceAlertKind(
  certBalance: number,
  threshold: number,
): "exhausted" | "low" | null {
  if (certBalance <= 0) return "exhausted";
  if (certBalance <= threshold) return "low";
  return null;
}

/** Rolling cooldown: true if never sent or the last send is at least cooldownDays old. */
export function isCooldownElapsed(
  lastSentAt: Date | null,
  now: Date,
  cooldownDays: number,
): boolean {
  if (!lastSentAt) return true;
  return now.getTime() - lastSentAt.getTime() >= cooldownDays * DAY_MS;
}
