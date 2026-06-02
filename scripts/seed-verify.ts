/**
 * Verify (Phase 3) dev seed.
 *
 * Creates:
 *   - One Board row for TX.
 *   - One BOARD user `board@dentalace.org` / `test1234` linked to that board.
 *   - ~500 licensee accounts (random license types) in TX with mixed compliance
 *     (~70% compliant / ~10% in-progress / ~15% deficient / ~5% no-upload),
 *     each with a UserLicense and 0-12 CeCertificate rows.
 *
 * Idempotent: re-running deletes the seeded TX licensees first, then re-creates.
 * The board row and the board admin user are upserted in place.
 *
 * Run:  pnpm tsx scripts/seed-verify.ts
 */

import { config } from "dotenv";
import { randomUUID } from "node:crypto";
import WebSocket from "ws";
import { PrismaPg } from "@prisma/adapter-pg";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import {
  PrismaClient,
  Prisma,
  LicenseType,
  CertSource,
  VerificationStatus,
  DeliveryFormat,
  RequirementStatus,
} from "@prisma/client";

config({ path: ".env.local" });

if (typeof globalThis.WebSocket === "undefined") {
  Object.assign(globalThis, { WebSocket });
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local",
  );
}

const admin = createSupabaseAdminClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const STATE = "TX";
const BOARD_EMAIL = "board@dentalace.org";
const BOARD_PASSWORD = "test1234";
// Default 100 (fast to seed); set VERIFY_SEED_COUNT=500 in env to ship more
// licensees when you want a richer audit.
const LICENSEE_COUNT = Number(process.env.VERIFY_SEED_COUNT ?? 100);
const SEED_TAG = "verify-seed-v1"; // lets re-runs identify our test rows

// Deterministic-ish RNG so re-runs produce the same distribution. Uses
// Math.random under the hood; if we ever want stable values across machines,
// swap in a seeded generator.
function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

const FIRST_NAMES = [
  "Avery", "Bailey", "Casey", "Devon", "Elliot", "Finley", "Gray", "Harper",
  "Indigo", "Jules", "Kai", "Lane", "Morgan", "Noa", "Owen", "Phoenix",
  "Quinn", "Riley", "Sage", "Taylor", "Umi", "Vesper", "Wren", "Xen", "Yael",
  "Zion",
];
const LAST_NAMES = [
  "Adams", "Brooks", "Cohen", "Diaz", "Evans", "Foster", "Garza", "Huang",
  "Iyer", "Jensen", "Kim", "Lopez", "Martinez", "Nguyen", "O'Brien", "Patel",
  "Quinn", "Ramos", "Smith", "Tran", "Underwood", "Vargas", "Wong", "Xu",
  "Young", "Zhang",
];
const COURSE_TITLES = [
  "Modern Periodontal Therapy",
  "Infection Control Update",
  "Sedation Refresher",
  "Restorative Materials & Cementation",
  "Treatment Planning for Implants",
  "Pediatric Behavior Management",
  "Local Anesthesia Best Practices",
  "Oral-Systemic Health Review",
];
const PROVIDERS = ["AADB DentalACE", "ADA CERP Provider", "AGD PACE Provider", "State Society"];
const CATEGORIES = ["General", "Infection Control", "Sedation", "Periodontics", "Pediatric"];

const LICENSE_TYPES: LicenseType[] = [
  LicenseType.DDS_DMD,
  LicenseType.RDH,
  LicenseType.DA,
];

// Compliance buckets: how many hours the licensee actually has vs required.
type ComplianceBucket =
  | { kind: "compliant"; minRatio: number; maxRatio: number }
  | { kind: "in_progress"; minRatio: number; maxRatio: number }
  | { kind: "deficient"; minRatio: number; maxRatio: number }
  | { kind: "no_upload" };

function pickBucket(): ComplianceBucket {
  const r = Math.random();
  if (r < 0.7) return { kind: "compliant", minRatio: 1.0, maxRatio: 1.4 };
  if (r < 0.8) return { kind: "in_progress", minRatio: 0.5, maxRatio: 0.95 };
  if (r < 0.95) return { kind: "deficient", minRatio: 0.05, maxRatio: 0.45 };
  return { kind: "no_upload" };
}

async function ensureBoardRow(): Promise<{ id: string }> {
  const board = await prisma.board.upsert({
    where: { state: STATE },
    create: {
      state: STATE,
      name: "Texas State Board of Dental Examiners",
      adminEmail: BOARD_EMAIL,
      dailySummaryEmail: BOARD_EMAIL,
    },
    update: {
      name: "Texas State Board of Dental Examiners",
    },
    select: { id: true },
  });
  console.log(`  Board: TX -> ${board.id}`);
  return board;
}

async function findAuthUserByEmail(email: string): Promise<string | null> {
  let page = 1;
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (found) return found.id;
    if (data.users.length < 200) return null;
    page += 1;
  }
}

async function upsertBoardAdmin(boardId: string): Promise<void> {
  let userId = await findAuthUserByEmail(BOARD_EMAIL);
  if (!userId) {
    const { data, error } = await admin.auth.admin.createUser({
      email: BOARD_EMAIL,
      password: BOARD_PASSWORD,
      email_confirm: true,
    });
    if (error) throw error;
    userId = data.user!.id;
  } else {
    await admin.auth.admin.updateUserById(userId, {
      password: BOARD_PASSWORD,
      email_confirm: true,
    });
  }

  await prisma.user.upsert({
    where: { id: userId },
    create: {
      id: userId,
      email: BOARD_EMAIL,
      firstName: "Test",
      lastName: "Board",
      verifyAccess: true,
      boardId,
      emailVerifiedAt: new Date(),
    },
    update: {
      verifyAccess: true,
      boardId,
      emailVerifiedAt: new Date(),
    },
  });
  console.log(`  Board admin: ${BOARD_EMAIL} / ${BOARD_PASSWORD}`);
}

// Stub state requirements for TX so audit selection has hour targets to read.
async function ensureStateRequirements(): Promise<void> {
  for (const t of LICENSE_TYPES) {
    await prisma.stateRequirement.upsert({
      where: { state_licenseType: { state: STATE, licenseType: t } },
      create: {
        state: STATE,
        licenseType: t,
        totalHours: new Prisma.Decimal(24),
        cycleMonths: 24,
        renewalMonth: 12,
        categories: [
          { name: "General", hours: 16, format: "ANY" },
          { name: "Infection Control", hours: 4, format: "ANY" },
          { name: "Sedation", hours: 4, format: "IN_PERSON" },
        ] as Prisma.InputJsonValue,
        status: RequirementStatus.PROVISIONAL,
        source: SEED_TAG,
      },
      update: {},
    });
  }
}

async function deleteExistingSeededLicensees(): Promise<void> {
  // Identify seeded licensees by email suffix.
  const stale = await prisma.user.findMany({
    where: { email: { endsWith: "@verify-seed.local" } },
    select: { id: true },
  });
  if (stale.length === 0) return;
  const ids = stale.map((u) => u.id);
  console.log(`  Removing ${ids.length} previously-seeded licensees...`);

  // Delete CE certs + user licenses first (FK).
  await prisma.ceCertificate.deleteMany({ where: { licenseeId: { in: ids } } });
  await prisma.userLicense.deleteMany({ where: { licenseeId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });

  // Best-effort: drop the auth users too. Page by 200.
  for (const id of ids) {
    await admin.auth.admin.deleteUser(id).catch(() => {});
  }
}

async function seedLicensees(): Promise<void> {
  console.log(`  Seeding ${LICENSEE_COUNT} TX licensees with mixed compliance...`);

  for (let i = 0; i < LICENSEE_COUNT; i += 1) {
    const id = randomUUID();
    const firstName = pick(FIRST_NAMES);
    const lastName = pick(LAST_NAMES);
    const licenseType = pick(LICENSE_TYPES);
    const email = `licensee-${i}@verify-seed.local`;
    const licenseNumber = `TX-${licenseType}-${String(100000 + i)}`;

    // Insert auth user (sync to public.users). We use a junk password since
    // these accounts are read-only audit targets — no one logs in as them.
    await admin.auth.admin
      .createUser({
        email,
        password: randomUUID(),
        email_confirm: true,
        user_metadata: { seed: SEED_TAG },
      })
      .catch(() => undefined);

    // Replace generated auth-user id with our deterministic uuid via admin API
    // would be nice but Supabase doesn't expose that; instead just look up.
    const actualId = await findAuthUserByEmail(email);
    if (!actualId) continue;

    await prisma.user.upsert({
      where: { id: actualId },
      create: {
        id: actualId,
        email,
        firstName,
        lastName,
        emailVerifiedAt: new Date(),
      },
      update: { firstName, lastName },
    });

    const license = await prisma.userLicense.upsert({
      where: {
        licenseeId_state_licenseType: {
          licenseeId: actualId,
          state: STATE,
          licenseType,
        },
      },
      create: {
        licenseeId: actualId,
        state: STATE,
        licenseType,
        licenseNumber,
        renewalDate: new Date(Date.UTC(2027, 11, 31)),
        isPrimary: true,
      },
      update: { licenseNumber },
      select: { id: true },
    });

    const bucket = pickBucket();
    const targetHours = 24;
    let certCount = 0;
    if (bucket.kind === "no_upload") {
      certCount = 0;
    } else {
      const ratio =
        bucket.minRatio + Math.random() * (bucket.maxRatio - bucket.minRatio);
      const totalHours = Math.max(1, Math.round(targetHours * ratio));
      // Spread the hours across 1-12 certs of varying size.
      let remaining = totalHours;
      while (remaining > 0 && certCount < 12) {
        const h = Math.min(
          remaining,
          1 + Math.floor(Math.random() * 4), // 1-4 hours per cert
        );
        await prisma.ceCertificate.create({
          data: {
            licenseeId: actualId,
            courseTitle: pick(COURSE_TITLES),
            provider: pick(PROVIDERS),
            source: pick<CertSource>([
              CertSource.ACE,
              CertSource.ADA_CERP,
              CertSource.AGD_PACE,
              CertSource.UPLOADED,
            ]),
            category: pick(CATEGORIES),
            hours: new Prisma.Decimal(h),
            deliveryFormat: pick<DeliveryFormat>([
              DeliveryFormat.IN_PERSON,
              DeliveryFormat.ONLINE,
              DeliveryFormat.HYBRID,
            ]),
            completedAt: new Date(
              Date.UTC(2025, Math.floor(Math.random() * 12), 15),
            ),
            verificationStatus: VerificationStatus.PENDING,
          },
        });
        remaining -= h;
        certCount += 1;
      }
    }

    if ((i + 1) % 50 === 0) {
      console.log(`    ${i + 1}/${LICENSEE_COUNT}`);
    }
    // Tag the user license so audit runs can find it — already keyed by state.
    void license;
  }
}

async function main(): Promise<void> {
  console.log("Seeding Verify (Phase 3) dev data...\n");

  const board = await ensureBoardRow();
  await upsertBoardAdmin(board.id);
  await ensureStateRequirements();
  await deleteExistingSeededLicensees();
  await seedLicensees();

  console.log("\nDone.");
  console.log(
    `  Sign in at http://localhost:3000/login as ${BOARD_EMAIL} / ${BOARD_PASSWORD} → /board.`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
