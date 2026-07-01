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
import {
  PrismaClient,
  Prisma,
  StaffRole,
  LicenseType,
  PlanTier,
  CertSource,
  VerificationStatus,
  DeliveryFormat,
  RequirementStatus,
  ApplicationStatus,
} from "@prisma/client";
import { US_STATE_REQUIREMENTS } from "./data/state-requirements";
import { placeholderCertificatePdf } from "./data/placeholder-cert";

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
// Mirror lib/storage.ts's bucket resolution so the seed writes the placeholder
// cert to the same private bucket the certificates page signs URLs from.
const UPLOADS_BUCKET = process.env.SUPABASE_STORAGE_BUCKET_UPLOADS ?? "uploads";

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
  // The three named app admins. Resend's sending domain isn't verified yet, so
  // invite emails won't deliver — they get a known dev password here and can
  // sign in immediately. Rotate these before any client demo / repo transfer.
  {
    email: "jay@wilburncreative.com",
    password: "ChangeMeNow!2026",
    staffRole: StaffRole.ADMIN,
    companyName: null,
  },
  {
    email: "john@johnstampermedia.com",
    password: "ChangeMeNow!2026",
    staffRole: StaffRole.ADMIN,
    companyName: null,
  },
  {
    email: "christy@johnstampermedia.com",
    password: "ChangeMeNow!2026",
    staffRole: StaffRole.ADMIN,
    companyName: null,
  },
  {
    email: "john@dentalace.org",
    password: "test1234",
    staffRole: StaffRole.ADMIN,
    companyName: null,
  },
  {
    email: "reviewer@dentalace.org",
    password: "test1234",
    staffRole: StaffRole.REVIEWER,
    companyName: null,
  },
  {
    // DentalACE access via company_id (the company holds prepaid credits).
    email: "customer@dentalace.org",
    password: "test1234",
    staffRole: StaffRole.NONE,
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

// ── Phase 2 (ProTrack) seed ──────────────────────────────────────────────────
//
// One LICENSEE test user (Sarah Mitchell, RDH, TX) with a primary license and a
// handful of CE certificates. State requirements come from the shared data file
// (prisma/data/state-requirements.ts): all 50 US states + DC from aces4ce.com
// (CONFIRMED, totals-only) plus the TX/CA/FL RDH demo exceptions (PROVISIONAL,
// with category breakdowns). `pnpm import:requirements` loads the same file.
//
// Texas RDH (demo exception): 18 total hours over a 24-month cycle (renews in
// December). The named category minimums sum to 17; the remaining hour is
// general elective CE. Many boards write rules this way (a total above the sum).

const LICENSEE_SEED = {
  email: "sarah.mitchell@example.com",
  password: "test1234",
  firstName: "Sarah",
  lastName: "Mitchell",
  state: "TX",
  licenseType: LicenseType.RDH,
  licenseNumber: "TX-RDH-91043",
  renewalDate: new Date("2026-12-31T00:00:00Z"),
} as const;

/*
  Canadian CE-hour requirements by province (client-provided, June 2026). The
  source table is province-level: one credit total + cycle + regulatory
  authority per jurisdiction, with no per-license-type or category breakdown.
  We therefore apply each province's total to all three license types so any
  Canadian licensee's (state, licenseType) lookup resolves. Territories
  (NT/NU/YT) are intentionally absent and show "no requirements on file".
*/
const CA_PROVINCE_REQUIREMENTS = [
  { state: "BC", totalHours: 90, cycleMonths: 36, authority: "Oral Health BC" },
  { state: "AB", totalHours: 60, cycleMonths: 24, authority: "College of Dental Surgeons of Alberta" },
  { state: "SK", totalHours: 45, cycleMonths: 12, authority: "College of Dental Surgeons of Saskatchewan" },
  { state: "MB", totalHours: 60, cycleMonths: 24, authority: "Manitoba Dental Association" },
  { state: "ON", totalHours: 90, cycleMonths: 36, authority: "Royal College of Dental Surgeons of Ontario" },
  { state: "QC", totalHours: 60, cycleMonths: 24, authority: "Ordre des dentistes du Quebec" },
  { state: "NB", totalHours: 60, cycleMonths: 24, authority: "New Brunswick Dental Society" },
  { state: "NS", totalHours: 90, cycleMonths: 36, authority: "Provincial Dental Board of Nova Scotia" },
  { state: "PE", totalHours: 45, cycleMonths: 12, authority: "Dental Council of Prince Edward Island" },
  { state: "NL", totalHours: 60, cycleMonths: 24, authority: "Newfoundland and Labrador Dental Board" },
] as const;

const CA_LICENSE_TYPES = [
  LicenseType.DDS_DMD,
  LicenseType.RDH,
  LicenseType.DA,
] as const;

// Sarah's CE history. Sums to 14 of 18 hours: General CE complete (10/10),
// Jurisprudence complete (2/2), Sedation partial (1/2), Med. Emergencies
// complete (1/1), Infection Control not started (0/2).
const LICENSEE_CERTS = [
  {
    courseTitle: "Modern Periodontal Techniques",
    provider: "Texas Dental Association",
    source: CertSource.ACE,
    category: "General CE",
    hours: 3,
    deliveryFormat: DeliveryFormat.IN_PERSON,
    completedAt: new Date("2025-03-14T00:00:00Z"),
    verificationStatus: VerificationStatus.AUTO,
  },
  {
    courseTitle: "Advanced Restorative Dentistry",
    provider: "ADA CERP Provider",
    source: CertSource.ADA_CERP,
    category: "General CE",
    hours: 4,
    deliveryFormat: DeliveryFormat.ONLINE,
    completedAt: new Date("2025-01-20T00:00:00Z"),
    verificationStatus: VerificationStatus.ADA_CERP_ACCEPTED,
  },
  {
    courseTitle: "Digital Radiography Update",
    provider: "AGD PACE Provider",
    source: CertSource.AGD_PACE,
    category: "General CE",
    hours: 3,
    deliveryFormat: DeliveryFormat.ONLINE,
    completedAt: new Date("2025-02-08T00:00:00Z"),
    verificationStatus: VerificationStatus.AGD_PACE_ACCEPTED,
  },
  {
    courseTitle: "Texas Dental Jurisprudence",
    provider: "TX State Board of Dental Examiners",
    source: CertSource.UPLOADED,
    category: "Jurisprudence",
    hours: 2,
    deliveryFormat: DeliveryFormat.ONLINE,
    completedAt: new Date("2025-04-02T00:00:00Z"),
    verificationStatus: VerificationStatus.PENDING,
  },
  {
    courseTitle: "Minimal Sedation Monitoring",
    provider: "Texas Dental Association",
    source: CertSource.UPLOADED,
    category: "Sedation",
    hours: 1,
    deliveryFormat: DeliveryFormat.IN_PERSON,
    completedAt: new Date("2025-05-11T00:00:00Z"),
    verificationStatus: VerificationStatus.PENDING,
  },
  {
    courseTitle: "Medical Emergencies in the Dental Office",
    provider: "American Red Cross",
    source: CertSource.UPLOADED,
    category: "Med. Emergencies",
    hours: 1,
    deliveryFormat: DeliveryFormat.IN_PERSON,
    completedAt: new Date("2025-05-11T00:00:00Z"),
    verificationStatus: VerificationStatus.PENDING,
  },
] as const;

// A DentalACE-issued certificate waiting to be claimed, so registering as this
// person demonstrates the ACE -> ProTrack auto-sync end to end. Match is on
// email or license number; this seed sets up both.
const ACE_SYNC_DEMO = {
  email: "ace.sync.test@example.com",
  name: "Jordan Lee",
  licenseNumber: "TX-RDH-77821",
  courseIdNumber: "ACE-2025-00128",
  courseTitle: "Contemporary Implant Dentistry",
  ceHours: 3,
} as const;

async function seedAceSyncDemo(companyId: string) {
  let course = await prisma.accreditedCourse.findUnique({
    where: { courseIdNumber: ACE_SYNC_DEMO.courseIdNumber },
  });
  if (!course) {
    const application = await prisma.courseApplication.create({
      data: {
        companyId,
        status: ApplicationStatus.APPROVED,
        courseTitle: ACE_SYNC_DEMO.courseTitle,
        ceHours: ACE_SYNC_DEMO.ceHours,
        applicationData: {},
      },
    });
    course = await prisma.accreditedCourse.create({
      data: {
        applicationId: application.id,
        companyId,
        courseIdNumber: ACE_SYNC_DEMO.courseIdNumber,
        approvedAt: new Date("2025-01-15T00:00:00Z"),
        expiresAt: new Date("2028-01-15T00:00:00Z"),
        quizQuestions: [],
      },
    });
  }

  const existing = await prisma.issuedCertificate.findFirst({
    where: { attendeeEmail: ACE_SYNC_DEMO.email, courseId: course.id },
  });
  if (!existing) {
    await prisma.issuedCertificate.create({
      data: {
        courseId: course.id,
        companyId,
        attendeeName: ACE_SYNC_DEMO.name,
        attendeeEmail: ACE_SYNC_DEMO.email,
        licenseNumber: ACE_SYNC_DEMO.licenseNumber,
        licenseType: "RDH",
        licenseStates: ["TX"],
        deliveryMethod: "Live/In Person",
        courseType: "Scientific",
        quizResponses: {},
        score: 100,
        passed: true,
        issuedAt: new Date("2025-04-20T00:00:00Z"),
      },
    });
  }
  console.log(
    `  ✓ ACE-sync demo cert for ${ACE_SYNC_DEMO.email} (register to auto-claim)`,
  );
}

async function seedProtrack() {
  console.log("\nSeeding ProTrack (Phase 2) licensee + state requirements...\n");

  // 1. US state requirements from the shared data file. Each row carries its own
  // status/source/categories (CONFIRMED aces4ce totals + PROVISIONAL demo rows).
  // Idempotent on (state, license type).
  for (const req of US_STATE_REQUIREMENTS) {
    const data = {
      totalHours: req.totalHours,
      cycleMonths: req.cycleMonths,
      renewalMonth: req.renewalMonth,
      categories: req.categories as unknown as Prisma.InputJsonValue,
      status: req.status,
      source: req.source,
    };
    await prisma.stateRequirement.upsert({
      where: {
        state_licenseType: { state: req.state, licenseType: req.licenseType },
      },
      update: data,
      create: { state: req.state, licenseType: req.licenseType, ...data },
    });
  }
  console.log(`  ✓ ${US_STATE_REQUIREMENTS.length} US state requirements`);

  // 1b. Canadian province requirements (client-provided), applied to every
  // license type. No category breakdown, so categories is empty (overall-hours
  // tracking only). Idempotent on (state, license type).
  let caCount = 0;
  for (const prov of CA_PROVINCE_REQUIREMENTS) {
    for (const licenseType of CA_LICENSE_TYPES) {
      const data = {
        totalHours: prov.totalHours,
        cycleMonths: prov.cycleMonths,
        renewalMonth: null,
        categories: [] as unknown as Prisma.InputJsonValue,
        status: RequirementStatus.PROVISIONAL,
        source: `${prov.authority} (client-provided, June 2026)`,
      };
      await prisma.stateRequirement.upsert({
        where: { state_licenseType: { state: prov.state, licenseType } },
        update: data,
        create: { state: prov.state, licenseType, ...data },
      });
      caCount++;
    }
  }
  console.log(`  ✓ ${caCount} Canadian province requirements`);

  // 2. Sarah's account (a plain user with ProTrack Free + her name on the row).
  const authUser = await upsertAuthUser(
    LICENSEE_SEED.email,
    LICENSEE_SEED.password,
  );

  const sarahProfile = {
    email: LICENSEE_SEED.email,
    firstName: LICENSEE_SEED.firstName,
    lastName: LICENSEE_SEED.lastName,
    protrackTier: PlanTier.FREE,
    emailVerifiedAt: new Date(),
  };
  await prisma.user.upsert({
    where: { id: authUser.id },
    update: sarahProfile,
    create: { id: authUser.id, ...sarahProfile },
  });

  // 3. Primary license (idempotent on licensee + state + license type).
  await prisma.userLicense.upsert({
    where: {
      licenseeId_state_licenseType: {
        licenseeId: authUser.id,
        state: LICENSEE_SEED.state,
        licenseType: LICENSEE_SEED.licenseType,
      },
    },
    update: {
      licenseNumber: LICENSEE_SEED.licenseNumber,
      renewalDate: LICENSEE_SEED.renewalDate,
      isPrimary: true,
    },
    create: {
      licenseeId: authUser.id,
      state: LICENSEE_SEED.state,
      licenseType: LICENSEE_SEED.licenseType,
      licenseNumber: LICENSEE_SEED.licenseNumber,
      renewalDate: LICENSEE_SEED.renewalDate,
      isPrimary: true,
    },
  });

  // 4. CE certificates — replace-and-recreate so re-running stays clean.
  await prisma.ceCertificate.deleteMany({ where: { licenseeId: authUser.id } });
  await prisma.ceCertificate.createMany({
    data: LICENSEE_CERTS.map((c) => ({
      licenseeId: authUser.id,
      courseTitle: c.courseTitle,
      provider: c.provider,
      source: c.source,
      category: c.category,
      hours: c.hours,
      deliveryFormat: c.deliveryFormat,
      completedAt: c.completedAt,
      verificationStatus: c.verificationStatus,
    })),
  });

  // 4b. Attach a placeholder PDF to one uploaded cert so the "↓ Download" link
  // on /protrack/certificates is visible in the demo. The file goes to the
  // uploads bucket at a deterministic path keyed by the licensee id (upsert so
  // re-running overwrites in place), and fileUrl stores the path WITHIN that
  // bucket — exactly what createSignedUrl("uploads", fileUrl, …) expects.
  const placeholderCertPath = `protrack/certificates/${authUser.id}/seed-placeholder.pdf`;
  const { error: uploadError } = await admin.storage
    .from(UPLOADS_BUCKET)
    .upload(placeholderCertPath, placeholderCertificatePdf(), {
      contentType: "application/pdf",
      upsert: true,
    });
  if (uploadError) {
    throw new Error(
      `Placeholder cert upload failed (${placeholderCertPath}): ${uploadError.message}`,
    );
  }
  // Pin it to the first uploaded-source cert (a natural fit for a user-supplied
  // PDF). updateMany because (licenseeId, courseTitle) isn't a unique key.
  const certForFile = LICENSEE_CERTS.find((c) => c.source === CertSource.UPLOADED);
  if (certForFile) {
    await prisma.ceCertificate.updateMany({
      where: { licenseeId: authUser.id, courseTitle: certForFile.courseTitle },
      data: { fileUrl: placeholderCertPath },
    });
  }
  console.log("  ✓ placeholder certificate file attached (↓ Download visible)");

  // 5. ACE -> ProTrack auto-sync demo (a claimable DentalACE certificate).
  const company = await prisma.company.findFirst({
    where: { name: "Texas Dental Association" },
    select: { id: true },
  });
  if (company) await seedAceSyncDemo(company.id);

  console.log(
    `  ✓ LICENSEE  ${LICENSEE_SEED.email}  (password: ${LICENSEE_SEED.password})`,
  );
  console.log(
    `  ✓ ${LICENSEE_CERTS.length} CE certificates for ${LICENSEE_SEED.firstName} ${LICENSEE_SEED.lastName}`,
  );
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
      update: {
        email: seed.email,
        staffRole: seed.staffRole,
        companyId,
        emailVerifiedAt: new Date(),
      },
      create: {
        id: authUser.id,
        email: seed.email,
        staffRole: seed.staffRole,
        companyId,
        emailVerifiedAt: new Date(),
      },
    });

    const access = seed.companyName ? "DENTALACE" : seed.staffRole;
    console.log(`  ✓ ${access.padEnd(9)}  ${seed.email}  (password: ${seed.password})`);
  }

  // 3. Seed ProTrack (Phase 2) data.
  await seedProtrack();

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
