/*
  Send the one-time "set your password" activation email to every legacy-provisioned
  CE-provider (company) account (scripts/provision-legacy-providers.ts marks them with
  legacyProvisionedAt and links them to a Company). Provider copy
  (emails/legacy-provider-activation.tsx) with a 30-day set-password link.

  This is the company-side sibling of scripts/send-legacy-invites.ts (which is fenced
  to companyId == null so it can never pick up these provider accounts). This script
  targets companyId != null, so the two cohorts never overlap even though they share
  the same legacyProvisionedAt / activationEmailSentAt markers.

  Reuses the exact token the /api/auth/set-password route verifies via the
  non-server-only core (lib/auth/set-password-token-core.ts). Builds its own Prisma
  + Resend clients because lib/email/send.ts is server-only (can't be imported into a
  tsx script) — and deliberately does NOT apply EMAIL_TEST_BCC, so the client is not
  BCC'd on the batch.

  Resumable/idempotent: sets activationEmailSentAt after each success, and only targets
  accounts where it is still null. Cohort excludes anyone who already signed in
  (lastLogin) or was suspended (disabledAt), and skips malformed emails.

  Flags:
    --dry-run     render + log each recipient, send nothing (works without RESEND_API_KEY)
    --limit=N     send to at most N (staged rollout / test batch)
    --rate=N      sends per second (default 2; Resend's default limit)
    --force       proceed even if EMAIL_TEST_BCC is set (NOT recommended)

  Usage: pnpm invite:legacy-providers [--dry-run] [--limit=N] [--rate=N] [--force]
*/
import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { render } from "@react-email/components";
import { Resend } from "resend";
import { signSetPasswordToken } from "../lib/auth/set-password-token-core";
import LegacyProviderActivationEmail from "../emails/legacy-provider-activation";

config({ path: ".env.local" });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL is not set");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DATABASE_URL }) });

const EXPIRY_DAYS = 30;
const THIRTY_DAYS_SECONDS = EXPIRY_DAYS * 24 * 60 * 60;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function resolveBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "");
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") return "https://dentalace.org";
  return "http://localhost:3000";
}

// Basic deliverability gate: skip obviously-malformed addresses so a bad row never
// counts against Resend/domain reputation.
function looksValid(email: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
}

async function sendWithRetry(fn: () => Promise<void>, tries = 3): Promise<void> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i += 1) {
    try {
      await fn();
      return;
    } catch (err) {
      lastErr = err;
      await sleep(1000 * (i + 1)); // linear backoff
    }
  }
  throw lastErr;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const force = args.includes("--force");
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.slice("--limit=".length)) : Infinity;
  const rateArg = args.find((a) => a.startsWith("--rate="));
  const rate = rateArg ? Math.max(0.1, Number(rateArg.slice("--rate=".length))) : 2;
  const delayMs = Math.round(1000 / rate);

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL ?? "noreply@dentalace.org";
  const baseUrl = resolveBaseUrl();

  // Guard: never BCC the client on a mass send.
  if (!dryRun && process.env.EMAIL_TEST_BCC && !force) {
    throw new Error(
      "EMAIL_TEST_BCC is set. A mass send would BCC those addresses on every email. " +
        "Unset EMAIL_TEST_BCC for this batch (or pass --force to override).",
    );
  }
  if (!dryRun && !apiKey) {
    throw new Error("RESEND_API_KEY is not set — cannot send. Use --dry-run to preview.");
  }

  const cohort = await prisma.user.findMany({
    where: {
      companyId: { not: null },
      legacyProvisionedAt: { not: null },
      activationEmailSentAt: null,
      lastLogin: null,
      disabledAt: null,
    },
    select: { id: true, email: true, firstName: true, company: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });

  const valid = cohort.filter((u) => looksValid(u.email));
  const skipped = cohort.length - valid.length;

  console.log(`Base URL: ${baseUrl}`);
  console.log(
    `Cohort: ${cohort.length} provider accounts not-yet-invited (${skipped} skipped as malformed). ` +
      `Mode: ${dryRun ? "DRY RUN (no send)" : "SENDING"}. Rate: ${rate}/s.`,
  );

  const resend = apiKey ? new Resend(apiKey) : null;
  let sent = 0;
  let failed = 0;
  let processed = 0;

  for (const u of valid) {
    if (processed >= limit) break;
    processed += 1;

    const nowSeconds = Math.floor(Date.now() / 1000);
    const token = signSetPasswordToken(u.id, nowSeconds, THIRTY_DAYS_SECONDS);
    const setPasswordUrl = `${baseUrl}/set-password?token=${encodeURIComponent(token)}`;
    const element = LegacyProviderActivationEmail({
      firstName: u.firstName ?? "there",
      companyName: u.company?.name ?? "your organization",
      setPasswordUrl,
      expiryDays: EXPIRY_DAYS,
    });
    const subject = LegacyProviderActivationEmail.subject();

    if (dryRun) {
      const html = await render(element);
      console.log(`[dry-run] to=${u.email} subject="${subject}" html_bytes=${html.length}`);
      continue;
    }

    try {
      await sendWithRetry(async () => {
        const { error } = await resend!.emails.send({ from, to: u.email, subject, react: element });
        if (error) throw new Error(error.message);
      });
      await prisma.user.update({ where: { id: u.id }, data: { activationEmailSentAt: new Date() } });
      sent += 1;
    } catch (err) {
      failed += 1;
      console.error(`[invite] failed for provider ${u.email}`, err);
    }

    if (processed % 100 === 0) {
      console.log(`  ...${processed} processed (sent ${sent}, failed ${failed})`);
    }
    if (delayMs > 0) await sleep(delayMs);
  }

  console.log(`Done. sent=${sent} failed=${failed} skipped-malformed=${skipped} (processed ${processed})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
