"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { sendEmail } from "@/lib/email/send";
import { appBaseUrl } from "@/lib/app-url";
import {
  isHoneypotFilled,
  marketingLeadSchema,
  MARKETING_LEAD_RETURN_PATH,
  type MarketingLeadSourceValue,
} from "@/lib/leads/schema";
import MarketingLeadEmail from "@/emails/marketing-lead";

/*
  Public marketing lead capture for the pre-launch VerifyIQ and Verify contact
  forms (replaces the old mailto: placeholder). Fully unauthenticated, so it is
  hardened three ways: a honeypot no-op for bots, an IP rate limit, and Zod
  validation on the boundary. Persists the lead via Prisma (table owner, bypasses
  RLS; sql-migrations/0016 is the read floor), then best-effort emails an ops
  notification to AADB. Redirects back to the originating form with ?sent=1 on
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

  // Honeypot: a hidden field no human fills. A bot that auto-fills it gets a
  // silent "success" with no insert or email — never a hint it was caught.
  if (isHoneypotFilled(formData.get("company_url"))) {
    redirect(`${returnPath}?sent=1`);
  }

  // Rate limit: 5 submissions / 10 min per IP. Same idiom as the attendee form.
  const ip = ((await headers()).get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
  const limited = rateLimit(`marketing-lead:${ip}`, { limit: 5, windowMs: 10 * 60 * 1000 });
  if (!limited.ok) {
    redirect(`${returnPath}?error=1`);
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
      },
    });
    created = true;
  } catch (err) {
    console.error("[marketing-lead] insert failed", err);
  }
  if (!created) {
    redirect(`${returnPath}?error=1`);
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
