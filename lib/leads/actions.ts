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
import { saveLeadUnderLimit, type SaveLeadResult } from "@/lib/leads/save-lead";
import MarketingLeadEmail from "@/emails/marketing-lead";

/*
  Public marketing lead capture for the pre-launch VerifyIQ and Verify contact
  forms (replaces the old mailto: placeholder). Fully unauthenticated, so
  nothing reaches the AADB inbox until it passes, invisibly to the visitor:
  - Zod validation on the boundary;
  - a rate limit counted in the database (5 per IP per 10 minutes), so it holds
    across serverless instances; over it, nothing is saved;
  - the spam checks in lib/leads/spam.ts (two honeypots, the signed form-timing
    token, content rules, repeats within a day).
  A lead the spam checks catch is saved with is_spam = true (Admin > Leads >
  Spam) and sends no email. Every outcome except a validation error shows the
  normal success page, so a spammer learns nothing. The rate limit, the repeat
  check and the insert run in one transaction under a per-IP advisory lock
  (lib/leads/save-lead.ts), so a parallel burst cannot slip past them. Persists via Prisma (table
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

function returnPathFor(source: string): string {
  return source === "VERIFY"
    ? MARKETING_LEAD_RETURN_PATH.VERIFY
    : MARKETING_LEAD_RETURN_PATH.VERIFYIQ;
}

export async function submitMarketingLead(formData: FormData): Promise<void> {
  const rawSource = String(formData.get("source") ?? "");
  const returnPath = returnPathFor(rawSource);

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

  // Vercel overwrites x-forwarded-for with the real client address, so the
  // first token can't be forged here. Deliberately NOT rateLimitKeyFromHeaders
  // (lib/verify/rate-limit.ts): it prefers cf-connecting-ip, which a caller can
  // set freely while the site is not behind Cloudflare.
  const ip = ((await headers()).get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
  const ipHash = hashLeadIp(ip);
  const now = Date.now();

  // Rate limit, repeat check and insert, atomically. Keep the redirects OUT of
  // the try so their internal NEXT_REDIRECT throw is never swallowed. Any
  // database failure lands on the error page with nothing saved or emailed.
  let result: SaveLeadResult | null = null;
  try {
    result = await prisma.$transaction((tx) =>
      saveLeadUnderLimit(tx, {
        lead: data,
        ipHash,
        nowMs: now,
        // A tempting name ("website") for form-filling bots, plus the original one.
        honeypotFilled:
          isHoneypotFilled(formData.get("website")) ||
          isHoneypotFilled(formData.get("company_url")),
        formTimingOk: checkLeadFormToken(formData.get("form_token"), now) === "ok",
      }),
    );
  } catch (err) {
    console.error("[marketing-lead] save failed", err);
  }
  if (!result) {
    redirect(`${returnPath}?error=1`);
  }

  // Over the rate limit (nothing saved) or caught as spam (saved, flagged):
  // either way no email, and the normal success page.
  if (!result.saved || result.spamReason !== null) {
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
