/**
 * Seed script for Phase 1 development.
 *
 * Creates one of each role (ADMIN, REVIEWER, CUSTOMER) plus a test company,
 * using the Supabase admin API + Prisma in a single coordinated pass.
 *
 * Run:   pnpm seed
 *
 * Idempotent: re-running updates the existing rows instead of duplicating them.
 *
 * Auth: dev users are created with email_confirmed and a known password so we
 * can log in immediately. Rotate the admin password via Supabase Auth before
 * inviting anyone real.
 */

import { config } from "dotenv";
import WebSocket from "ws";
import { PrismaPg } from "@prisma/adapter-pg";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { PrismaClient, Role } from "@prisma/client";

config({ path: ".env.local" });

// supabase-js initializes a Realtime client unconditionally; provide ws as the
// WebSocket transport for Node < 22 so the script doesn't crash at import.
// (ws's WebSocket extends EventEmitter so the type signature doesn't match
// the browser global - assign via Object.assign to skip the structural check.)
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

const SEEDS = [
  {
    email: "jay@wilburncreative.com",
    password: "ChangeMeNow!2026",
    role: Role.ADMIN,
    companyName: null,
  },
  {
    email: "reviewer@dentalace.org",
    password: "test1234",
    role: Role.REVIEWER,
    companyName: null,
  },
  {
    email: "customer@dentalace.org",
    password: "test1234",
    role: Role.CUSTOMER,
    companyName: "Texas Dental Association",
  },
] as const;

async function findAuthUserByEmail(email: string) {
  // The admin listUsers API doesn't support an email filter directly in older
  // SDKs, so we page through. With 3 seed users this is fine.
  let page = 1;
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (found) return found;
    if (data.users.length < 100) return null;
    page += 1;
  }
}

async function upsertAuthUser(email: string, password: string) {
  const existing = await findAuthUserByEmail(email);
  if (existing) {
    const { data, error } = await admin.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
    });
    if (error) throw error;
    return data.user!;
  }
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  return data.user!;
}

async function main() {
  console.log("Seeding DentalACE One Phase 1 dev users...\n");

  // 1. Ensure test company exists (idempotent).
  let testCompany = await prisma.company.findFirst({
    where: { name: "Texas Dental Association" },
  });
  if (!testCompany) {
    testCompany = await prisma.company.create({
      data: {
        name: "Texas Dental Association",
        applicationCredits: 2,
        certBalance: 247,
        certAlertThreshold: 50,
        totalCertsIssued: 1284,
      },
    });
    console.log(`  Created company: ${testCompany.name} (${testCompany.id})`);
  } else {
    console.log(`  Company exists: ${testCompany.name} (${testCompany.id})`);
  }

  // 2. Seed each user (auth + public.users in sync).
  for (const seed of SEEDS) {
    const authUser = await upsertAuthUser(seed.email, seed.password);
    const companyId = seed.companyName === testCompany.name ? testCompany.id : null;

    await prisma.user.upsert({
      where: { id: authUser.id },
      update: { email: seed.email, role: seed.role, companyId },
      create: { id: authUser.id, email: seed.email, role: seed.role, companyId },
    });

    console.log(`  ✓ ${seed.role.padEnd(8)}  ${seed.email}  (password: ${seed.password})`);
  }

  console.log("\nDone. Use the credentials above to sign in at http://localhost:3000/login.");
  console.log("Rotate the ADMIN password in Supabase Auth before sharing this project.\n");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
