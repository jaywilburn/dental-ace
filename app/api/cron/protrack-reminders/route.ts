import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email/send";
import ProtrackRenewalReminderEmail from "@/emails/protrack-renewal-reminder";
import ProtrackCategoryGapEmail from "@/emails/protrack-category-gap";
import {
  computeRequirementProgress,
  formatHours,
  parseCategories,
} from "@/lib/protrack/progress";
import { parseReminderSettings, RENEWAL_THRESHOLDS } from "@/lib/protrack/reminders";
import { stateName } from "@/lib/protrack/reference";

/*
  Daily reminder cron (Vercel Cron → vercel.json). For every active Pro
  licensee:
   - fire the tightest enabled renewal threshold (90/60/30/7 days) once per cycle
   - fire a category-gap alert once per cycle when within 6 months of renewal

  Auth: Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. We reject any
  request whose bearer does not match. If CRON_SECRET is unset we allow only in
  non-production (dev convenience), never in prod.

  Send-once is enforced by inserting into protrack_reminder_log first (unique on
  licensee+license+threshold+cycle) and only emailing when the insert is new.
*/

export const runtime = "nodejs";

const DAY_MS = 24 * 60 * 60 * 1000;
const GAP_WINDOW_DAYS = 180;

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const provided = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");
  if (secret) return provided === secret;
  return process.env.NODE_ENV !== "production";
}

async function logAndSend(
  key: {
    licenseeId: string;
    licenseId: string;
    threshold: string;
    cycleRenewalDate: Date;
  },
  send: () => Promise<void>,
): Promise<boolean> {
  const inserted = await prisma.protrackReminderLog.createMany({
    data: [key],
    skipDuplicates: true,
  });
  if (inserted.count !== 1) return false; // already sent this cycle
  await send();
  return true;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const origin =
    process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
  const dashboardUrl = `${origin}/protrack`;
  const now = new Date();

  const requirements = await prisma.stateRequirement.findMany();
  const reqMap = new Map(
    requirements.map((r) => [`${r.state}:${r.licenseType}`, r]),
  );

  const accounts = await prisma.user.findMany({
    where: {
      protrackTier: "PRO",
      OR: [{ proExpiresAt: null }, { proExpiresAt: { gt: now } }],
    },
    select: {
      id: true,
      firstName: true,
      email: true,
      reminderSettings: true,
      licenses: {
        select: { id: true, state: true, licenseType: true, renewalDate: true },
      },
      certificates: {
        select: { category: true, hours: true, deliveryFormat: true },
      },
    },
  });

  let renewalRemindersSent = 0;
  let gapAlertsSent = 0;

  for (const account of accounts) {
    const settings = parseReminderSettings(account.reminderSettings);
    const certs = account.certificates.map((c) => ({
      category: c.category,
      hours: Number(c.hours),
      deliveryFormat: c.deliveryFormat,
    }));

    for (const license of account.licenses) {
      const requirement = reqMap.get(`${license.state}:${license.licenseType}`);
      if (!requirement) continue;

      const daysToRenewal = Math.ceil(
        (license.renewalDate.getTime() - now.getTime()) / DAY_MS,
      );
      if (daysToRenewal <= 0) continue;

      const progress = computeRequirementProgress(
        {
          totalHours: Number(requirement.totalHours),
          categories: parseCategories(requirement.categories),
        },
        certs,
      );

      // Tightest enabled renewal threshold reached this cycle.
      const threshold = RENEWAL_THRESHOLDS.filter(
        (t) => settings[t.key] && daysToRenewal <= t.days,
      ).sort((a, b) => a.days - b.days)[0];

      if (threshold) {
        const sent = await logAndSend(
          {
            licenseeId: account.id,
            licenseId: license.id,
            threshold: threshold.key,
            cycleRenewalDate: license.renewalDate,
          },
          () =>
            sendEmail({
              to: account.email,
              subject: `${daysToRenewal} days to your ${stateName(license.state)} renewal`,
              react: ProtrackRenewalReminderEmail({
                firstName: account.firstName ?? "there",
                state: stateName(license.state),
                renewalDate: license.renewalDate.toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                }),
                daysRemaining: daysToRenewal,
                completedHours: formatHours(progress.totalCompleted),
                requiredHours: formatHours(progress.totalRequired),
                remainingHours: formatHours(progress.remaining),
                dashboardUrl,
              }),
            }),
        );
        if (sent) renewalRemindersSent++;
      }

      // Category-gap alert, once per cycle, within the gap window.
      if (settings.categoryGap && daysToRenewal <= GAP_WINDOW_DAYS) {
        const gaps = progress.categories
          .filter((c) => c.needed > 0)
          .map((c) => ({ name: c.name, needed: formatHours(c.needed) }));
        if (gaps.length > 0) {
          const sent = await logAndSend(
            {
              licenseeId: account.id,
              licenseId: license.id,
              threshold: "categoryGap",
              cycleRenewalDate: license.renewalDate,
            },
            () =>
              sendEmail({
                to: account.email,
                subject: "Required CE categories still open",
                react: ProtrackCategoryGapEmail({
                  firstName: account.firstName ?? "there",
                  state: stateName(license.state),
                  gaps,
                  dashboardUrl,
                }),
              }),
          );
          if (sent) gapAlertsSent++;
        }
      }
    }
  }

  return NextResponse.json({
    ok: true,
    scanned: accounts.length,
    renewalRemindersSent,
    gapAlertsSent,
  });
}
