import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email/send";
import CourseExpiringEmail from "@/emails/course-expiring";
import AppCreditsExpiringEmail from "@/emails/app-credits-expiring";
import LowCertBalanceEmail from "@/emails/low-cert-balance";
import CertBalanceExhaustedEmail from "@/emails/cert-balance-exhausted";
import {
  daysUntil,
  dueCourseReminders,
  creditsReminderDue,
  balanceAlertKind,
  isCooldownElapsed,
} from "@/lib/notifications/lifecycle";

/*
  Daily Dental ACE lifecycle cron (Vercel Cron -> vercel.json). One pass:
   - course-expiry reminders at 60 and 30 days (send-once per course+threshold)
   - app-credit-expiry reminder at <=30 days (send-once per credit window)
   - cert-balance alerts: exhausted (==0) or low (<=threshold), rolling 7-day
     cooldown, mutually exclusive.

  Auth: Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. Reject any
  mismatch; with no secret set, allow only outside production (dev convenience).
  Dedupe is enforced by inserting into notification_log first and only emailing
  when the insert is new (send-once) or the cooldown has elapsed.
*/

export const runtime = "nodejs";

const COOLDOWN_DAYS = 7;

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (secret) return provided === secret;
  return process.env.NODE_ENV !== "production";
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

/** Send-once: insert the key; email only when the row is newly created. */
async function sendOnce(
  key: { companyId: string; kind: string; refId: string; periodKey: string },
  send: () => Promise<void>,
): Promise<boolean> {
  const inserted = await prisma.notificationLog.createMany({ data: [key], skipDuplicates: true });
  if (inserted.count !== 1) return false;
  await send();
  return true;
}

/** Cooldown: send only if the last send for (company,kind) is >= COOLDOWN_DAYS old. */
async function sendWithCooldown(
  companyId: string,
  kind: string,
  now: Date,
  send: () => Promise<void>,
): Promise<boolean> {
  const last = await prisma.notificationLog.findFirst({
    where: { companyId, kind },
    orderBy: { sentAt: "desc" },
    select: { sentAt: true },
  });
  if (!isCooldownElapsed(last?.sentAt ?? null, now, COOLDOWN_DAYS)) return false;
  const inserted = await prisma.notificationLog.createMany({
    data: [{ companyId, kind, refId: companyId, periodKey: isoDate(now) }],
    skipDuplicates: true,
  });
  if (inserted.count !== 1) return false;
  await send();
  return true;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
  const now = new Date();
  let coursesReminded = 0;
  let creditsReminded = 0;
  let lowBalance = 0;
  let exhausted = 0;

  // 1) Course-expiry reminders.
  const courses = await prisma.accreditedCourse.findMany({
    where: { expiresAt: { gt: now } },
    select: {
      id: true,
      companyId: true,
      courseIdNumber: true,
      expiresAt: true,
      application: { select: { courseTitle: true } },
      company: { select: { name: true, users: { select: { email: true } } } },
    },
  });

  for (const course of courses) {
    const recipients = course.company.users.map((u) => u.email);
    if (recipients.length === 0) continue;
    const days = daysUntil(course.expiresAt, now);
    for (const t of dueCourseReminders(days)) {
      const kind = t === "d60" ? "course_expiring_60" : "course_expiring_30";
      const daysRemaining = t === "d60" ? 60 : 30;
      const props = {
        companyName: course.company.name,
        courseTitle: course.application.courseTitle ?? "your course",
        courseIdNumber: course.courseIdNumber,
        expiresAt: fmtDate(course.expiresAt),
        daysRemaining,
        myCoursesUrl: `${origin}/company/courses`,
      };
      const sent = await sendOnce(
        { companyId: course.companyId, kind, refId: course.id, periodKey: isoDate(course.expiresAt) },
        () => sendEmail({ to: recipients, subject: CourseExpiringEmail.subject(props), react: CourseExpiringEmail(props) }),
      );
      if (sent) coursesReminded++;
    }
  }

  // 2) Per-company: app-credit expiry + balance alerts.
  const companies = await prisma.company.findMany({
    select: {
      id: true,
      name: true,
      applicationCredits: true,
      applicationCreditsExpiresAt: true,
      certBalance: true,
      certAlertThreshold: true,
      users: { select: { email: true } },
    },
  });
  const adminEmail = process.env.AADB_ADMIN_EMAIL;

  for (const c of companies) {
    const recipients = c.users.map((u) => u.email);

    // App credits expiring.
    if (c.applicationCreditsExpiresAt && recipients.length > 0) {
      const days = daysUntil(c.applicationCreditsExpiresAt, now);
      if (creditsReminderDue(days, c.applicationCredits)) {
        const props = {
          companyName: c.name,
          creditsRemaining: c.applicationCredits,
          expiresAt: fmtDate(c.applicationCreditsExpiresAt),
          buyCreditsUrl: `${origin}/company/buy/credits`,
        };
        const sent = await sendOnce(
          {
            companyId: c.id,
            kind: "credits_expiring_30",
            refId: c.id,
            periodKey: isoDate(c.applicationCreditsExpiresAt),
          },
          () => sendEmail({ to: recipients, subject: AppCreditsExpiringEmail.subject(props), react: AppCreditsExpiringEmail(props) }),
        );
        if (sent) creditsReminded++;
      }
    }

    // Balance alerts (mutually exclusive).
    const kind = balanceAlertKind(c.certBalance, c.certAlertThreshold);
    if (kind === "exhausted") {
      const to = adminEmail ? [...recipients, adminEmail] : recipients;
      if (to.length > 0) {
        const props = { companyName: c.name, buyCertsUrl: `${origin}/company/buy/certs` };
        const sent = await sendWithCooldown(c.id, "balance_exhausted", now, () =>
          sendEmail({ to, subject: CertBalanceExhaustedEmail.subject(props), react: CertBalanceExhaustedEmail(props) }),
        );
        if (sent) exhausted++;
      }
    } else if (kind === "low" && recipients.length > 0) {
      const props = {
        companyName: c.name,
        certBalance: c.certBalance,
        threshold: c.certAlertThreshold,
        buyCertsUrl: `${origin}/company/buy/certs`,
      };
      const sent = await sendWithCooldown(c.id, "low_balance", now, () =>
        sendEmail({ to: recipients, subject: LowCertBalanceEmail.subject(props), react: LowCertBalanceEmail(props) }),
      );
      if (sent) lowBalance++;
    }
  }

  return NextResponse.json({ ok: true, coursesReminded, creditsReminded, lowBalance, exhausted });
}
