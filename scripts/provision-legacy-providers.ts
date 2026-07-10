/*
  Provision a DentalACE One provider (company) account for every migrated legacy
  CE-provider company.

  The legacy migration (scripts/migrate-legacy.ts) loaded 39 CE-provider companies
  (companies.legacy_id != null) as data only, with NO owner accounts and NO contact
  emails. This script mirrors the ProTrack legacy provisioning
  (scripts/provision-legacy-accounts.ts) but for the company side: it creates one
  owner account per company and links it to the pre-loaded Company row (credits +
  accredited courses + issued-cert history intact), so the provider can sign in and
  run their account. A later batch (scripts/send-legacy-provider-invites.ts) emails
  each account a set-password link.

  Because the legacy source has no provider emails, this reads a CSV the client fills
  in, keyed by legacy_id:

    legacy_id,company_name,owner_email,owner_first,owner_last

  Run `--emit-template` first to generate the fill-in sheet (legacy_id + company_name
  pre-filled, owner_* blank).

  Per CSV row:
    1. Skip + warn if owner_email is blank/invalid (handled by parseProvidersCsv).
    2. Find the Company by legacy_id; skip + warn if none.
    3. Warn (non-fatal) if the CSV company_name != DB name, to catch a mis-fill.
    4. Skip (count as reused) if the company already has any linked user OR the email
       already exists as a user — a user links only one company.
    5. Else create a Supabase auth user (email_confirm: true, random password the user
       never sees) + a users row (companyId, signupIntent COMPANY, protrackTier FREE,
       emailVerifiedAt = now, legacyProvisionedAt = now) using the auth id as the PK.

  No cert backfill — providers are not individual licensees; their history lives on
  the Company they link to. The account is created already-verified but password-locked
  (random password), so it is inert until the emailed set-password link is used.

  Idempotent/resumable: on re-run the created account is already linked to its company,
  so it is counted as reused and never re-created. Flags: --dry-run (no writes),
  --limit=N (staged), --sleep-ms=N (throttle between auth creates, default 60),
  --emit-template (print the fill-in CSV to stdout and exit).

  Usage:
    pnpm provision:legacy-providers --emit-template > ~/Downloads/legacy-providers.csv
    pnpm provision:legacy-providers [csvPath] [--dry-run] [--limit=N] [--sleep-ms=N]
*/
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import WebSocket from "ws";
import { PrismaPg } from "@prisma/adapter-pg";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";
import { companyNamesMatch, parseProvidersCsv } from "./legacy/provider-csv";

config({ path: ".env.local" });
if (typeof globalThis.WebSocket === "undefined") {
  Object.assign(globalThis, { WebSocket });
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DATABASE_URL = process.env.DATABASE_URL;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
}
if (!DATABASE_URL) throw new Error("DATABASE_URL is not set");

const admin = createSupabaseAdminClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DATABASE_URL }) });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const DEFAULT_CSV = join(homedir(), "Downloads", "legacy-providers.csv");

// Paged fallback: find a Supabase auth user id by email (only used when createUser
// reports the email already exists but no users row was written). Mirrors the
// ProTrack provisioning script.
async function findAuthUserByEmail(email: string): Promise<string | null> {
  const target = email.toLowerCase();
  for (let page = 1; page <= 200; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data?.users?.length) return null;
    const hit = data.users.find((u) => (u.email ?? "").toLowerCase() === target);
    if (hit) return hit.id;
    if (data.users.length < 200) return null;
  }
  return null;
}

// Quote a value for the emitted template CSV only when it contains a comma, quote,
// or newline (RFC-4180 style), so company names like "Pearl, Inc." round-trip.
function toCsvCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

async function emitTemplate(): Promise<void> {
  const companies = await prisma.company.findMany({
    where: { legacyId: { not: null } },
    orderBy: { legacyId: "asc" },
    select: { legacyId: true, name: true },
  });
  const out: string[] = ["legacy_id,company_name,owner_email,owner_first,owner_last"];
  for (const c of companies) {
    out.push(`${c.legacyId},${toCsvCell(c.name)},,,`);
  }
  process.stdout.write(`${out.join("\n")}\n`);
}

async function main() {
  const args = process.argv.slice(2);
  const emitTemplateMode = args.includes("--emit-template");
  const dryRun = args.includes("--dry-run");
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.slice("--limit=".length)) : Infinity;
  const sleepArg = args.find((a) => a.startsWith("--sleep-ms="));
  const sleepMs = sleepArg ? Number(sleepArg.slice("--sleep-ms=".length)) : 60;
  // A CSV company_name that does not match the DB name is treated as a mis-fill
  // and the row is SKIPPED (a typo'd owner_email against the right legacy_id would
  // otherwise hand a stranger a verified, company-linked account). --emit-template
  // pre-fills company_name from the DB, so a clean fill always matches.
  const allowNameMismatch = args.includes("--allow-name-mismatch");
  const csvPath = args.find((a) => !a.startsWith("--")) ?? DEFAULT_CSV;

  if (emitTemplateMode) {
    await emitTemplate();
    return;
  }

  const host = (() => {
    try {
      return new URL(DATABASE_URL!).host;
    } catch {
      return "unknown";
    }
  })();
  console.log(`Target DB: ${host}${dryRun ? " (dry run)" : " — PROVISIONING"}`);
  console.log(`CSV: ${csvPath}`);

  const text = readFileSync(csvPath, "utf8");
  const { rows, skipped } = parseProvidersCsv(text);
  for (const s of skipped) {
    console.warn(`[provision] skipping CSV line ${s.lineNo}: ${s.reason}`);
  }
  console.log(`Parsed ${rows.length} valid rows (${skipped.length} skipped in CSV).`);

  let created = 0;
  let reused = 0;
  let skippedCount = skipped.length;
  let failed = 0;
  let processed = 0;

  for (const row of rows) {
    if (processed >= limit) break;
    processed += 1;

    const email = row.ownerEmail.toLowerCase();
    try {
      const company = await prisma.company.findUnique({
        where: { legacyId: row.legacyId },
        select: { id: true, name: true },
      });
      if (!company) {
        skippedCount += 1;
        console.warn(
          `[provision] line ${row.lineNo}: no company with legacy_id ${row.legacyId} (${email}) — skipped`,
        );
        continue;
      }
      if (row.companyName && !companyNamesMatch(row.companyName, company.name)) {
        if (!allowNameMismatch) {
          skippedCount += 1;
          console.warn(
            `[provision] line ${row.lineNo}: csv company_name "${row.companyName}" != db "${company.name}" (legacy_id ${row.legacyId}) — SKIPPED (pass --allow-name-mismatch to override)`,
          );
          continue;
        }
        console.warn(
          `[provision] line ${row.lineNo}: csv company_name "${row.companyName}" != db "${company.name}" (legacy_id ${row.legacyId}) — continuing (--allow-name-mismatch)`,
        );
      }

      // A user links only one company: skip if this company is already claimed, or
      // if the owner email is already an account. Also what makes re-runs a no-op.
      const linked = await prisma.user.findFirst({
        where: { companyId: company.id },
        select: { id: true },
      });
      if (linked) {
        reused += 1;
        continue;
      }
      const existingByEmail = await prisma.user.findUnique({
        where: { email },
        select: { id: true },
      });
      if (existingByEmail) {
        reused += 1;
        console.warn(
          `[provision] line ${row.lineNo}: ${email} already exists as a user — skipped (a user links one company)`,
        );
        continue;
      }

      if (dryRun) {
        created += 1;
        continue;
      }

      const res = await admin.auth.admin
        .createUser({
          email,
          password: randomUUID() + randomUUID(),
          email_confirm: true,
          user_metadata: { legacy_provisioned: true, legacy_provider: true },
        })
        .catch((e: unknown) => ({ data: null, error: e }));
      let userId = res?.data?.user?.id ?? null;
      if (!userId) {
        // Only adopt an existing auth user when the failure is specifically that the
        // email is already registered (an orphan auth user with no users row). Any
        // other error (rate limit / transient) must surface as a failure, not be
        // silently treated as success against whatever listUsers happens to return.
        const err = res?.error as
          | { message?: string; status?: number; code?: string }
          | null
          | undefined;
        const emailAlreadyExists =
          !!err &&
          (err.code === "email_exists" ||
            err.status === 422 ||
            /already.*(registered|exists)/i.test(err.message ?? ""));
        if (emailAlreadyExists) {
          userId = await findAuthUserByEmail(email);
        } else {
          failed += 1;
          console.error(
            `[provision] line ${row.lineNo}: auth createUser failed for ${email}`,
            err?.message ?? err ?? "",
          );
          continue;
        }
      }
      if (!userId) {
        failed += 1;
        console.error(`[provision] could not resolve auth id for ${email}`);
        continue;
      }

      // Create-only: never re-link or re-stamp a pre-existing account onto this
      // company. If the resolved auth id already has a users row, leave it alone.
      const existingById = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true },
      });
      if (existingById) {
        reused += 1;
        console.warn(
          `[provision] line ${row.lineNo}: ${email} already has an account — skipped (not re-linked)`,
        );
        continue;
      }
      await prisma.user.create({
        data: {
          id: userId,
          email,
          firstName: row.ownerFirst || null,
          lastName: row.ownerLast || null,
          companyId: company.id,
          signupIntent: "COMPANY",
          protrackTier: "FREE",
          emailVerifiedAt: new Date(),
          legacyProvisionedAt: new Date(),
        },
      });
      created += 1;
      if (sleepMs > 0) await sleep(sleepMs);
    } catch (err) {
      failed += 1;
      console.error(`[provision] failed for ${email}`, err);
    }

    if (processed % 25 === 0) {
      console.log(
        `  ...${processed}/${Math.min(rows.length, limit)} (created ${created}, reused ${reused}, failed ${failed})`,
      );
    }
  }

  console.log(
    `${dryRun ? "DRY RUN — no writes. " : ""}Done. created=${created} reused=${reused} skipped=${skippedCount} failed=${failed} (processed ${processed})`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
