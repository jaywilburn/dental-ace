/*
  Provision a ProTrack account for every migrated legacy attendee.

  The legacy migration (scripts/migrate-legacy.ts) loaded ~4,637 certificates for
  ~3,162 distinct attendee emails as data only, with NO user accounts. This script
  creates one ProTrack (individual) account per distinct attendee email and
  backfills that account's CE history, so the person sees their certificates the
  moment they activate. A later batch (scripts/send-legacy-invites.ts) emails each
  account a set-password link.

  Per distinct attendee email:
    1. Skip if a users row already exists (reuse; still backfill their certs).
    2. Else create a Supabase auth user (email_confirm: true, random password the
       user never sees) + a users row (protrackTier FREE, emailVerifiedAt = now,
       legacyProvisionedAt = now) using the auth id as the PK.
    3. Backfill: link every passing IssuedCertificate for this email into ProTrack
       as a CeCertificate (source ACE, AUTO-verified). Idempotent via the unique
       ce_certificates.issued_certificate_id.

  The account is created already-verified but password-locked (random password),
  so it is inert until the emailed set-password link is used. Backfill matches on
  the authoritative migrated attendeeEmail only (mirrors lib/protrack/ace-sync.ts,
  which is server-only and cannot be imported into a tsx script).

  Idempotent/resumable: the users pre-check skips done accounts on re-run, and the
  backfill dedupes. Flags: --dry-run (counts, no writes), --limit N (staged),
  --sleep-ms N (throttle between auth creates; default 60).

  Usage: pnpm provision:legacy [--dry-run] [--limit=N] [--sleep-ms=N]
*/
import { config } from "dotenv";
import { randomUUID } from "node:crypto";
import WebSocket from "ws";
import { PrismaPg } from "@prisma/adapter-pg";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { PrismaClient, Prisma, CertSource, VerificationStatus } from "@prisma/client";
import { mapCategory, mapDeliveryFormat } from "../lib/protrack/category-map";
import { splitName } from "./legacy/name-split";

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

// ---- cert -> ProTrack mapping (mirrors lib/protrack/ace-sync.ts toCeCertData) ----
const ISSUED_SELECT = {
  id: true,
  courseType: true,
  deliveryMethod: true,
  certPdfUrl: true,
  completedAt: true,
  ceHours: true,
  issuedAt: true,
  company: { select: { name: true } },
  course: { select: { application: { select: { ceHours: true, courseTitle: true } } } },
  event: { select: { name: true } },
} satisfies Prisma.IssuedCertificateSelect;

type IssuedForSync = Prisma.IssuedCertificateGetPayload<{ select: typeof ISSUED_SELECT }>;

function toCeCertData(issued: IssuedForSync, licenseeId: string) {
  const courseTitle =
    issued.event?.name ?? issued.course?.application.courseTitle ?? "DentalACE course";
  const hours = issued.ceHours
    ? Number(issued.ceHours)
    : issued.course?.application.ceHours
      ? Number(issued.course.application.ceHours)
      : 0;
  return {
    licenseeId,
    courseTitle,
    provider: issued.company.name,
    source: CertSource.ACE,
    category: mapCategory({ courseType: issued.courseType, courseTitle }),
    hours,
    deliveryFormat: mapDeliveryFormat(issued.deliveryMethod),
    completedAt: issued.completedAt ?? issued.issuedAt,
    verificationStatus: VerificationStatus.AUTO,
    fileUrl: issued.certPdfUrl,
    issuedCertificateId: issued.id,
  };
}

async function backfill(userId: string, email: string): Promise<number> {
  const issued = await prisma.issuedCertificate.findMany({
    where: { passed: true, attendeeEmail: { equals: email, mode: "insensitive" } },
    select: ISSUED_SELECT,
  });
  if (issued.length === 0) return 0;
  const res = await prisma.ceCertificate.createMany({
    data: issued.map((i) => toCeCertData(i, userId)),
    skipDuplicates: true,
  });
  return res.count;
}

// Paged fallback: find a Supabase auth user id by email (only used when
// createUser reports the email already exists but no users row was written).
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

type Cohort = { email: string; attendeeName: string };

async function loadCohort(): Promise<Cohort[]> {
  // One row per distinct migrated attendee email, name taken from the most recent
  // cert. Raw SQL (references the legacy_cert_number DB column directly).
  const rows = await prisma.$queryRaw<{ email: string; name: string }[]>(Prisma.sql`
    select distinct on (lower(attendee_email))
      lower(attendee_email) as email,
      attendee_name as name
    from issued_certificates
    where legacy_cert_number is not null and passed = true
    order by lower(attendee_email), issued_at desc
  `);
  return rows.map((r) => ({ email: r.email, attendeeName: r.name }));
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.slice("--limit=".length)) : Infinity;
  const sleepArg = args.find((a) => a.startsWith("--sleep-ms="));
  const sleepMs = sleepArg ? Number(sleepArg.slice("--sleep-ms=".length)) : 60;

  const host = (() => {
    try {
      return new URL(DATABASE_URL!).host;
    } catch {
      return "unknown";
    }
  })();
  console.log(`Target DB: ${host}${dryRun ? " (dry run)" : " — PROVISIONING"}`);

  const cohort = await loadCohort();
  const emails = cohort.map((c) => c.email);
  const existing = new Set(
    (await prisma.user.findMany({ where: { email: { in: emails } }, select: { email: true } })).map(
      (u) => u.email.toLowerCase(),
    ),
  );
  const toCreate = cohort.filter((c) => !existing.has(c.email));

  if (dryRun) {
    // Raw SQL: legacy_cert_number is a DB column not declared in this branch's schema.
    const rows = await prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
      select count(*)::bigint as count
      from issued_certificates
      where passed = true and legacy_cert_number is not null
    `);
    const certCount = Number(rows[0]?.count ?? 0);
    console.log("DRY RUN — no writes.");
    console.log(`distinct migrated emails: ${cohort.length}`);
    console.log(`already have an account:  ${existing.size}`);
    console.log(`accounts to create:       ${toCreate.length}`);
    console.log(`certificates to backfill: ~${certCount} (deduped on re-run)`);
    return;
  }

  let created = 0;
  let reused = 0;
  let failed = 0;
  let synced = 0;
  let processed = 0;

  for (const c of cohort) {
    if (processed >= limit) break;
    processed += 1;

    try {
      const already = await prisma.user.findUnique({ where: { email: c.email }, select: { id: true } });
      if (already) {
        // Existing account (e.g. a self-signup). Backfill their certs but do NOT
        // mark them as legacy-provisioned — they are not part of the invite cohort.
        synced += await backfill(already.id, c.email);
        reused += 1;
      } else {
        const { firstName, lastName } = splitName(c.attendeeName);
        const res = await admin.auth.admin
          .createUser({
            email: c.email,
            password: randomUUID() + randomUUID(),
            email_confirm: true,
            user_metadata: { legacy_provisioned: true },
          })
          .catch(() => null);
        const userId = res?.data?.user?.id ?? (await findAuthUserByEmail(c.email));
        if (!userId) {
          failed += 1;
          console.error(`[provision] could not resolve auth id for ${c.email}`);
          continue;
        }
        await prisma.user.upsert({
          where: { id: userId },
          create: {
            id: userId,
            email: c.email,
            firstName,
            lastName,
            protrackTier: "FREE",
            signupIntent: "INDIVIDUAL",
            emailVerifiedAt: new Date(),
            legacyProvisionedAt: new Date(),
          },
          update: { legacyProvisionedAt: new Date() },
        });
        synced += await backfill(userId, c.email);
        created += 1;
        if (sleepMs > 0) await sleep(sleepMs);
      }
    } catch (err) {
      failed += 1;
      console.error(`[provision] failed for ${c.email}`, err);
    }

    if (processed % 100 === 0) {
      console.log(`  ...${processed}/${Math.min(cohort.length, limit)} (created ${created}, reused ${reused}, failed ${failed})`);
    }
  }

  console.log(
    `Done. created=${created} reused=${reused} failed=${failed} certs-backfilled=${synced} (processed ${processed})`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
