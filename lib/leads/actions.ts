"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email/send";
import { appBaseUrl } from "@/lib/app-url";
import {
  isHoneypotFilled,
  marketingLeadSchema,
  MARKETING_LEAD_RETURN_PATH,
  type MarketingLeadSourceValue,
} from "@/lib/leads/schema";
import { checkLeadFormToken, hashLeadIp } from "@/lib/leads/form-token";
import { spamReasonFor, type RecentLead } from "@/lib/leads/spam";
import MarketingLeadEmail from "@/emails/marketing-lead";

/*
  Public marketing lead capture for the pre-launch VerifyIQ and Verify contact
  forms (replaces the old mailto: placeholder). Fully unauthenticated, so
  nothing reaches the AADB inbox until it passes, invisibly to the visitor:
  - a rate limit counted in the database (5 per IP per 10 minutes), so it holds
    across serverless instances; over it, nothing is saved;
  - Zod validation on the boundary;
  - the spam checks in lib/leads/spam.ts (two honeypots, the signed form-timing
    token, content rules, repeats within a day).
  A lead the spam checks catch is saved with is_spam = true (Admin > Leads >
  Spam) and sends no email. Every outcome except a validation error shows the
  normal success page, so a spammer learns nothing. Persists via Prisma (table
  owner, bypasses RLS; sql-migrations/0016 is the read floor), then best-effort
  emails an ops notification to AADB for genuine leads. Redirects back to the originating form with ?sent=1 on
  success or ?error=1 on failure — the pages read those directly (do NOT
  decodeURIComponent searchParams; Next already decodes them).
*/

/*
  Recipients for the ops notification. AADB_ADMIN_EMAIL may be a single shared
  inbox or a comma-separated list; falls back to info@dentalace.org so the notice
  still lands before the env is configured. Mirrors signupNotificationRecipients()
  in lib/auth/signup-notification.ts.
*/
function marketingLeadRecipients(): string[] {
  const configured = (process.env.AADB_ADMIN_EMAIL ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return configured.length > 0 ? configured : ["info@dentalace.org"];
}

const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const REPEAT_WINDOW_MS = 24 * 60 * 60 * 1000;

function returnPathFor(source: string): string {
  return source === "VERIFY"
    ? MARKETING_LEAD_RETURN_PATH.VERIFY
    : MARKETING_LEAD_RETURN_PATH.VERIFYIQ;
}

export async function submitMarketingLead(formData: FormData): Promise<void> {
  const rawSource = String(formData.get("source") ?? "");
  const returnPath = returnPathFor(rawSource);

  const ip = ((await headers()).get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
  const ipHash = hashLeadIp(ip);
  const now = Date.now();

  // Rate limit: 5 saved submissions (spam included) per IP per 10 minutes. A
  // flood past that is dropped unsaved behind a normal success page. A failed
  // count must not block a real inquiry, so it fails open.
  let recentFromIp = 0;
  try {
    recentFromIp = await prisma.marketingLead.count({
      where: { ipHash, createdAt: { gte: new Date(now - RATE_WINDOW_MS) } },
    });
  } catch (err) {
    console.error("[marketing-lead] rate-limit count failed", err);
  }
  if (recentFromIp >= RATE_LIMIT) {
    redirect(`${returnPath}?sent=1`);
  }

  const parsed = marketingLeadSchema.safeParse({
    source: rawSource,
    contactName: String(formData.get("contactName") ?? ""),
    title: String(formData.get("title") ?? ""),
    organization: String(formData.get("organization") ?? ""),
    email: String(formData.get("email") ?? ""),
    message: String(formData.get("message") ?? ""),
  });
  if (!parsed.success) {
    redirect(`${returnPath}?error=1`);
  }
  const data = parsed.data;

  let recentLeads: RecentLead[] = [];
  try {
    recentLeads = await prisma.marketingLead.findMany({
      where: { createdAt: { gte: new Date(now - REPEAT_WINDOW_MS) } },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { email: true, message: true },
    });
  } catch (err) {
    console.error("[marketing-lead] repeat lookup failed", err);
  }
  const spamReason = spamReasonFor({
    lead: data,
    // A tempting name ("website") for form-filling bots, plus the original one.
    honeypotFilled:
      isHoneypotFilled(formData.get("website")) || isHoneypotFilled(formData.get("company_url")),
    formTimingOk: checkLeadFormToken(formData.get("form_token"), now) === "ok",
    recentLeads,
  });

  // Persist first. Keep the redirect OUT of the try so its internal
  // NEXT_REDIRECT throw is never swallowed by the catch.
  let created = false;
  try {
    await prisma.marketingLead.create({
      data: {
        source: data.source,
        contactName: data.contactName,
        title: data.title ?? null,
        organization: data.organization,
        email: data.email,
        message: data.message ?? null,
        isSpam: spamReason !== null,
        spamReason,
        ipHash,
      },
    });
    created = true;
  } catch (err) {
    console.error("[marketing-lead] insert failed", err);
  }
  if (!created) {
    redirect(`${returnPath}?error=1`);
  }

  if (spamReason !== null) {
    redirect(`${returnPath}?sent=1`);
  }

  // Best-effort ops notification — a send failure must never fail the capture.
  try {
    const props = {
      source: data.source as MarketingLeadSourceValue,
      contactName: data.contactName,
      title: data.title ?? null,
      organization: data.organization,
      email: data.email,
      message: data.message ?? null,
      receivedAt: new Date().toLocaleString("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      }),
      adminUrl: `${appBaseUrl()}/admin/leads`,
    };
    await sendEmail({
      to: marketingLeadRecipients(),
      subject: MarketingLeadEmail.subject({ source: props.source }),
      react: MarketingLeadEmail(props),
    });
  } catch (err) {
    console.error("[marketing-lead] notification send failed", err);
  }

  redirect(`${returnPath}?sent=1`);
}
