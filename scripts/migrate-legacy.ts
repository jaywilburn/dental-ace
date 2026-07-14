/*
  One-time importer for the legacy CE dataset (39 CE-provider companies, 106
  accredited courses, 4,677 issued certificates) delivered as
  ~/Downloads/dentalace_migration_v3.sql.

  The delivered SQL targets a simplified/assumed schema (integer PKs, flat
  tables) that does NOT match our real Prisma schema, so we never run it — we
  parse it as a dataset (scripts/legacy/parse-source.ts), clean + map it
  (scripts/legacy/normalize.ts), and load it onto the real schema here.

  Three modes:
    pnpm migrate:legacy --extract    parse+normalize the SQL -> reviewable JSON
                                     under scripts/data/legacy/ + a report.
    pnpm migrate:legacy --dry-run    read the JSON, report insert/update counts,
                                     write nothing.
    pnpm migrate:legacy              idempotent load, FK order:
                                     Company -> CourseApplication ->
                                     AccreditedCourse -> IssuedCertificate.

  Idempotency keys (added in migration 20260703120000_add_legacy_migration_keys):
  Company.legacyId, AccreditedCourse.legacyId, IssuedCertificate.legacyCertNumber.
  Re-running is a no-op for rows already present.

  Data load ONLY: no company owner logins, no activation emails, no cert PDFs,
  no ce_certificates. Migrated certs become claimable in ProTrack via the
  existing email-proven sync (lib/protrack/ace-sync.ts).
*/
import { config } from "dotenv";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "@prisma/client";
import { parseMigrationSql, type RawRow } from "./legacy/parse-source";
import {
  classifyCertExclusion,
  courseExpiresAtIso,
  formatToDelivery,
  LEGACY_APPROVED_AT_OVERRIDES,
  normalizeLicenseStates,
  occupationToLicenseType,
  PACKAGE_DATE,
  resolveIssuedAt,
  sanitizeCompletionDate,
  subjectToCourseType,
} from "./legacy/normalize";

config({ path: ".env.local" });

const DATA_DIR = join(process.cwd(), "scripts", "data", "legacy");
const SOURCE_DEFAULT = join(homedir(), "Downloads", "dentalace_migration_v3.sql");

// ---------------------------------------------------------------------------
// Output shapes (also the committed JSON schema under scripts/data/legacy/)
// ---------------------------------------------------------------------------

type OutCompany = { legacyId: number; name: string; totalCertsIssued: number };

type OutCourse = {
  legacyId: number;
  companyLegacyId: number;
  legacyCourseId: string | null;
  courseIdNumber: string; // ACE-LEG-#####
  courseTitle: string;
  ceHours: number | null;
  courseType: string | null;
  deliveryMethod: string | null;
  approvedAt: string; // ISO date (YYYY-MM-DD)
  expiresAt: string; // approvedAt + 3 years, the same validity window as live approvals
  certsIssuedCount: number;
};

type OutCert = {
  legacyCertNumber: string;
  companyLegacyId: number;
  courseLegacyId: number;
  attendeeName: string;
  attendeeEmail: string;
  licenseType: string | null;
  licenseStates: string[];
  deliveryMethod: string | null;
  courseType: string | null;
  completedAt: string | null; // ISO date or null (impossible dates nulled)
  issuedAt: string; // ISO datetime
};

type Bundle = { companies: OutCompany[]; courses: OutCourse[]; certificates: OutCert[] };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function num(v: string | null | undefined): number | null {
  if (v === null || v === undefined || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function reqNum(v: string | null | undefined, field: string, ctx: string): number {
  const n = num(v);
  if (n === null) throw new Error(`Expected a number for ${field} in ${ctx}, got ${JSON.stringify(v)}`);
  return n;
}

function courseIdNumberFor(legacyId: number): string {
  // Distinct "ACE-LEG-#####" namespace so migrated historical courses never
  // collide with the live "ACE-YYYY-#####" sequence (lib/reviewer/course-id.ts).
  return `ACE-LEG-${String(legacyId).padStart(5, "0")}`;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ---------------------------------------------------------------------------
// Extract: SQL -> normalized JSON + report
// ---------------------------------------------------------------------------

function extract(sourcePath: string): { bundle: Bundle; report: string } {
  const sql = readFileSync(sourcePath, "utf8");
  const parsed = parseMigrationSql(sql);

  if (parsed.companies.rows.length === 0 || parsed.courses.rows.length === 0 || parsed.certificates.rows.length === 0) {
    throw new Error("Parsed source is missing one of companies/courses/certificates");
  }

  // --- Pass 1: certificates (drives per-course/company counts + approvedAt) ---
  const certs: OutCert[] = [];
  const excluded: { id: number; name: string; email: string; reason: string }[] = [];
  const perCompanyCount = new Map<number, number>();
  const perCourseCount = new Map<number, number>();
  const perCourseApproved = new Map<number, string>(); // earliest date (completion pref, else issued)
  const droppedStates = new Map<string, number>();
  const unmappedOccupation = new Map<string, number>();
  const unmappedSubject = new Map<string, number>();
  const unmappedFormat = new Map<string, number>();
  let nulledDates = 0;

  const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);

  for (const row of parsed.certificates.rows) {
    const id = reqNum(row.id, "id", "certificate");
    const attendeeName = (row.attendee_name ?? "").trim();
    const attendeeEmail = (row.attendee_email ?? "").trim().toLowerCase();

    const cls = classifyCertExclusion({ id, attendeeName, attendeeEmail: row.attendee_email });
    if (cls.excluded) {
      excluded.push({ id, name: attendeeName, email: attendeeEmail, reason: cls.reason ?? "excluded" });
      continue;
    }

    const companyLegacyId = reqNum(row.company_id, "company_id", `certificate ${id}`);
    const courseLegacyId = reqNum(row.course_id, "course_id", `certificate ${id}`);
    const legacyCertNumber = (row.cert_number ?? "").trim();
    if (!legacyCertNumber) throw new Error(`Certificate ${id} has no cert_number (dedup key)`);

    const licenseType = occupationToLicenseType(row.occupation);
    if (!licenseType && (row.occupation ?? "").trim()) bump(unmappedOccupation, (row.occupation ?? "").trim());

    const { codes, dropped } = normalizeLicenseStates(row.license_states, row.primary_state);
    for (const d of dropped) bump(droppedStates, d);

    const courseType = subjectToCourseType(row.subject_matter);
    if (!courseType && (row.subject_matter ?? "").trim()) bump(unmappedSubject, (row.subject_matter ?? "").trim());

    const deliveryMethod = formatToDelivery(row.course_format);
    if (!deliveryMethod && (row.course_format ?? "").trim()) bump(unmappedFormat, (row.course_format ?? "").trim());

    const saneDate = sanitizeCompletionDate(row.completion_date);
    if (!saneDate && (row.completion_date ?? "").trim()) nulledDates += 1;

    const issuedAt = resolveIssuedAt(row.submitted_at, saneDate);
    const issuedIso = issuedAt.toISOString();

    certs.push({
      legacyCertNumber,
      companyLegacyId,
      courseLegacyId,
      attendeeName,
      attendeeEmail,
      licenseType,
      licenseStates: codes,
      deliveryMethod,
      courseType,
      completedAt: saneDate,
      issuedAt: issuedIso,
    });

    perCompanyCount.set(companyLegacyId, (perCompanyCount.get(companyLegacyId) ?? 0) + 1);
    perCourseCount.set(courseLegacyId, (perCourseCount.get(courseLegacyId) ?? 0) + 1);
    // earliest date for the course: prefer sane completion date, else issued date
    const candidate = saneDate ?? issuedIso.slice(0, 10);
    const cur = perCourseApproved.get(courseLegacyId);
    if (!cur || candidate < cur) perCourseApproved.set(courseLegacyId, candidate);
  }

  // --- Pass 2: courses ---
  const courses: OutCourse[] = parsed.courses.rows.map((row: RawRow) => {
    const legacyId = reqNum(row.id, "id", "course");
    const companyLegacyId = reqNum(row.company_id, "company_id", `course ${legacyId}`);
    const legacyCourseId = row.legacy_course_id ? row.legacy_course_id.trim() : null;
    const courseTitle = (row.course_name ?? "").trim() || `Legacy course ${legacyCourseId ?? legacyId}`;
    const approvedAt = LEGACY_APPROVED_AT_OVERRIDES[legacyId] ?? perCourseApproved.get(legacyId) ?? PACKAGE_DATE;
    return {
      legacyId,
      companyLegacyId,
      legacyCourseId,
      courseIdNumber: courseIdNumberFor(legacyId),
      courseTitle,
      ceHours: num(row.ce_hours),
      courseType: subjectToCourseType(row.subject_matter),
      deliveryMethod: formatToDelivery(row.course_format),
      approvedAt,
      expiresAt: courseExpiresAtIso(approvedAt),
      certsIssuedCount: perCourseCount.get(legacyId) ?? 0,
    };
  });

  // --- Pass 3: companies ---
  const companies: OutCompany[] = parsed.companies.rows.map((row: RawRow) => {
    const legacyId = reqNum(row.id, "id", "company");
    return {
      legacyId,
      name: (row.name ?? "").trim(),
      totalCertsIssued: perCompanyCount.get(legacyId) ?? 0,
    };
  });

  companies.sort((a, b) => a.legacyId - b.legacyId);
  courses.sort((a, b) => a.legacyId - b.legacyId);
  certs.sort((a, b) => a.legacyCertNumber.localeCompare(b.legacyCertNumber));

  const bundle: Bundle = { companies, courses, certificates: certs };

  // --- Referential integrity within the bundle (must hold before load) ---
  const companyIds = new Set(companies.map((c) => c.legacyId));
  const courseIds = new Set(courses.map((c) => c.legacyId));
  for (const c of certs) {
    if (!companyIds.has(c.companyLegacyId)) throw new Error(`Cert ${c.legacyCertNumber} -> missing company ${c.companyLegacyId}`);
    if (!courseIds.has(c.courseLegacyId)) throw new Error(`Cert ${c.legacyCertNumber} -> missing course ${c.courseLegacyId}`);
  }

  // --- Report ---
  const sortMap = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]);
  const lines: string[] = [];
  lines.push("DentalACE legacy migration extract report");
  lines.push(`generatedAt: ${new Date().toISOString()}`);
  lines.push(`source: ${sourcePath}`);
  lines.push("");
  lines.push(`companies:     ${companies.length}`);
  lines.push(`courses:       ${courses.length}`);
  lines.push(`certificates:  ${certs.length} imported, ${excluded.length} excluded (of ${parsed.certificates.rows.length} source rows)`);
  lines.push("");
  lines.push(`nulled completion dates (out-of-window / impossible): ${nulledDates}`);
  lines.push("");
  lines.push(`excluded certificates (${excluded.length}):`);
  for (const e of excluded.sort((a, b) => a.id - b.id)) {
    lines.push(`  id=${e.id}  ${e.reason}  ${e.name || "(no name)"} <${e.email || "no email"}>`);
  }
  lines.push("");
  lines.push(`dropped license states (unmappable jurisdictions):`);
  for (const [k, v] of sortMap(droppedStates)) lines.push(`  ${v}x  ${k}`);
  lines.push("");
  lines.push(`occupations with no license-type mapping (stored as null):`);
  for (const [k, v] of sortMap(unmappedOccupation)) lines.push(`  ${v}x  ${k}`);
  lines.push("");
  lines.push(`subject_matter with no courseType mapping (stored as null):`);
  for (const [k, v] of sortMap(unmappedSubject)) lines.push(`  ${v}x  ${k}`);
  lines.push("");
  lines.push(`course_format with no deliveryMethod mapping (stored as null):`);
  for (const [k, v] of sortMap(unmappedFormat)) lines.push(`  ${v}x  ${k}`);
  lines.push("");

  return { bundle, report: lines.join("\n") + "\n" };
}

function runExtract(sourcePath: string): void {
  const { bundle, report } = extract(sourcePath);
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(join(DATA_DIR, "companies.json"), JSON.stringify(bundle.companies, null, 2) + "\n");
  writeFileSync(join(DATA_DIR, "courses.json"), JSON.stringify(bundle.courses, null, 2) + "\n");
  writeFileSync(join(DATA_DIR, "certificates.json"), JSON.stringify(bundle.certificates, null, 2) + "\n");
  writeFileSync(join(DATA_DIR, "migration-report.txt"), report);
  process.stdout.write(report);
  console.log(`\nWrote JSON + migration-report.txt to ${DATA_DIR}`);
}

// ---------------------------------------------------------------------------
// Load / dry-run
// ---------------------------------------------------------------------------

function readBundle(): Bundle {
  const read = <T>(f: string): T => JSON.parse(readFileSync(join(DATA_DIR, f), "utf8")) as T;
  return {
    companies: read<OutCompany[]>("companies.json"),
    courses: read<OutCourse[]>("courses.json"),
    certificates: read<OutCert[]>("certificates.json"),
  };
}

function isoDate(d: string): Date {
  return new Date(`${d}T12:00:00Z`);
}

async function runDryRun(prisma: PrismaClient, bundle: Bundle): Promise<void> {
  const existingCompanies = new Set(
    (await prisma.company.findMany({ where: { legacyId: { not: null } }, select: { legacyId: true } })).map((r) => r.legacyId!),
  );
  const existingCourses = new Set(
    (await prisma.accreditedCourse.findMany({ where: { legacyId: { not: null } }, select: { legacyId: true } })).map((r) => r.legacyId!),
  );
  const existingCertNums = new Set(
    (await prisma.issuedCertificate.findMany({ where: { legacyCertNumber: { not: null } }, select: { legacyCertNumber: true } })).map((r) => r.legacyCertNumber!),
  );

  const compInsert = bundle.companies.filter((c) => !existingCompanies.has(c.legacyId)).length;
  const courseInsert = bundle.courses.filter((c) => !existingCourses.has(c.legacyId)).length;
  const certInsert = bundle.certificates.filter((c) => !existingCertNums.has(c.legacyCertNumber)).length;

  console.log("DRY RUN — no writes.");
  console.log(`companies:     ${compInsert} insert, ${bundle.companies.length - compInsert} already present`);
  console.log(`courses:       ${courseInsert} insert, ${bundle.courses.length - courseInsert} already present`);
  console.log(`certificates:  ${certInsert} insert, ${bundle.certificates.length - certInsert} already present (skipped)`);
}

async function runLoad(prisma: PrismaClient, bundle: Bundle): Promise<void> {
  const companyId = new Map<number, string>();
  const courseId = new Map<number, string>();

  // 1) Companies (upsert on legacyId). Only totalCertsIssued is refreshed on
  //    re-run; name/credits are left as-is so an in-app edit is never reverted.
  for (const c of bundle.companies) {
    const row = await prisma.company.upsert({
      where: { legacyId: c.legacyId },
      create: {
        legacyId: c.legacyId,
        name: c.name,
        applicationCredits: 0,
        certBalance: 0,
        totalCertsIssued: c.totalCertsIssued,
      },
      update: { totalCertsIssued: c.totalCertsIssued },
      select: { id: true },
    });
    companyId.set(c.legacyId, row.id);
  }

  // 2) Courses: a stub CourseApplication (holds title/hours/type/delivery) + an
  //    AccreditedCourse (dedup on legacyId). Dates are computed here (approvedAt
  //    override + the "+ 3 years" validity rule) rather than trusted from
  //    courses.json, so a re-run converges even over a stale committed JSON.
  const existingCourses = await prisma.accreditedCourse.findMany({
    where: { legacyId: { not: null } },
    select: { id: true, legacyId: true, applicationId: true },
  });
  const existingByLegacy = new Map(existingCourses.map((c) => [c.legacyId!, c]));

  for (const co of bundle.courses) {
    const cid = companyId.get(co.companyLegacyId);
    if (!cid) throw new Error(`Course ${co.legacyId} -> company ${co.companyLegacyId} not loaded`);
    const approvedIso = LEGACY_APPROVED_AT_OVERRIDES[co.legacyId] ?? co.approvedAt;
    const approvedAt = isoDate(approvedIso);
    const expiresAt = isoDate(courseExpiresAtIso(approvedIso));
    const appData: Prisma.InputJsonValue = {
      legacy: true,
      legacyCourseId: co.legacyCourseId,
      source: "legacy-migration-v3",
    };
    const appFields = {
      status: "APPROVED" as const,
      courseTitle: co.courseTitle,
      ceHours: co.ceHours,
      courseType: co.courseType,
      deliveryMethod: co.deliveryMethod,
    };

    const existing = existingByLegacy.get(co.legacyId);
    if (existing) {
      await prisma.courseApplication.update({ where: { id: existing.applicationId }, data: appFields });
      await prisma.accreditedCourse.update({
        where: { id: existing.id },
        data: { companyId: cid, approvedAt, expiresAt, certsIssuedCount: co.certsIssuedCount },
      });
      courseId.set(co.legacyId, existing.id);
    } else {
      const app = await prisma.courseApplication.create({
        data: { companyId: cid, applicationData: appData, submittedAt: approvedAt, reviewedAt: approvedAt, ...appFields },
        select: { id: true },
      });
      const course = await prisma.accreditedCourse.create({
        data: {
          legacyId: co.legacyId,
          applicationId: app.id,
          companyId: cid,
          courseIdNumber: co.courseIdNumber,
          approvedAt,
          expiresAt,
          quizQuestions: [] as unknown as Prisma.InputJsonValue,
          certsIssuedCount: co.certsIssuedCount,
        },
        select: { id: true },
      });
      courseId.set(co.legacyId, course.id);
    }
  }

  // 3) Certificates: bulk insert, deduped on the unique legacyCertNumber.
  //    A raw insert never touches company.certBalance/totalCertsIssued or
  //    course.certsIssuedCount (those are set above), so counters stay correct.
  const data = bundle.certificates.map((ct) => {
    const cid = companyId.get(ct.companyLegacyId);
    const crid = courseId.get(ct.courseLegacyId);
    if (!cid || !crid) throw new Error(`Cert ${ct.legacyCertNumber} -> unresolved company/course`);
    return {
      legacyCertNumber: ct.legacyCertNumber,
      companyId: cid,
      courseId: crid,
      attendeeName: ct.attendeeName,
      attendeeEmail: ct.attendeeEmail,
      licenseType: ct.licenseType,
      licenseStates: ct.licenseStates,
      deliveryMethod: ct.deliveryMethod,
      courseType: ct.courseType,
      quizResponses: [] as unknown as Prisma.InputJsonValue,
      score: 100,
      passed: true,
      completedAt: ct.completedAt ? isoDate(ct.completedAt) : null,
      issuedAt: new Date(ct.issuedAt),
    };
  });

  let inserted = 0;
  for (const c of chunk(data, 1000)) {
    const res = await prisma.issuedCertificate.createMany({ data: c, skipDuplicates: true });
    inserted += res.count;
  }

  console.log(`Loaded: ${bundle.companies.length} companies, ${bundle.courses.length} courses.`);
  console.log(`Certificates: ${inserted} inserted, ${bundle.certificates.length - inserted} already present (skipped).`);
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const sourceArg = args.find((a) => a.startsWith("--source="));
  const sourcePath = sourceArg ? sourceArg.slice("--source=".length) : process.env.LEGACY_SQL_PATH || SOURCE_DEFAULT;

  if (args.includes("--extract")) {
    runExtract(sourcePath);
    return;
  }

  const bundle = readBundle();
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL is not set");
  const host = (() => {
    try {
      return new URL(dbUrl).host;
    } catch {
      return "unknown";
    }
  })();

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: dbUrl }) });
  try {
    if (args.includes("--dry-run")) {
      console.log(`Target DB: ${host} (dry run)`);
      await runDryRun(prisma, bundle);
    } else {
      console.log(`Target DB: ${host} — LOADING`);
      await runLoad(prisma, bundle);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
