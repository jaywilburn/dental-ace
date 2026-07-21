/*
  One-time importer for the July 2026 "new companies" batch: 3 NEW CE-provider
  companies (Emme Sanders RDH, SKF Practice Solutions, Chairside Collaborative)
  + 2 new courses for the existing People + Practice LLC (legacy_id 7) — 6
  courses total, each WITH its 5-question quiz, and 83 attendee/certificate
  rows (DA252: 12, DA256: 14, DA258: 57).

  Sources are the derived artifacts under scripts/data/legacy/new-companies/
  (see scripts/legacy/extract-new-companies.py); parsing/normalization is the
  pure module scripts/legacy/new-companies-parse.ts.

  Modes (dry run is the DEFAULT; writes require an explicit --apply):
    pnpm import:new-companies             parse + classify + report, write NOTHING
    pnpm import:new-companies --apply     upsert companies/courses, insert certs,
                                          recompute counters, backfill ProTrack

  Differences from the v3 migration load (scripts/migrate-legacy.ts):
    - Quizzes are imported (quiz_questions populated, validated via step4Schema),
      so attend links are live as soon as a company has cert balance.
    - Failing quiz rows import as passed=false (DA258 has 12 — the client's
      historical records show all 57 received certificates, but only 45 passed;
      decision 2026-07-21: record true scores, flip later if SKF confirms).
    - ProTrack backfill runs here for attendee emails that already have user
      accounts: the verification-time sync (lib/protrack/ace-sync.ts) only runs
      at email verification, which already happened for provisioned accounts.

  Idempotency: companies/courses upsert on legacyId (quiz is only written when
  the course is created or its quiz is still empty, so a later admin edit is
  never clobbered); certificates dedup on the unique NEWCO-… legacy_cert_number;
  the ProTrack backfill dedups on the unique ce_certificates.issued_certificate_id.
  Counters (course certs_issued_count, company total_certs_issued) are recomputed
  from actual passed=true rows inside a transaction holding a FOR UPDATE lock on
  the company row (same as the Pearl delta importer). cert_balance is never
  touched.

  Look up, never create, for the EXISTING company: the run aborts unless
  Company legacy_id 7 (People + Practice LLC) exists. New-company legacyIds
  (40-42) and course legacyIds (107-112) must be absent or already ours.

  Per-cert ce_hours stays NULL: course certs resolve hours from the course
  application (lib/protrack/ace-sync.ts), like all migrated certs.
*/
import { config } from "dotenv";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma, CertSource, VerificationStatus } from "@prisma/client";
import {
  courseFields,
  parseAttendeeSheet,
  parseQuizCsv,
  type NewCompany,
  type NewCourse,
  type NewCoRecord,
} from "./legacy/new-companies-parse";
import { courseExpiresAtIso } from "./legacy/normalize";
import { mapCategory, mapDeliveryFormat } from "../lib/protrack/category-map";

config({ path: ".env.local" });

const DATA_DIR = join(process.cwd(), "scripts", "data", "legacy", "new-companies");
const PPL_LEGACY_ID = 7; // People + Practice LLC — must already exist
const EXPECTED_ROWS: Record<string, number> = { DA252: 12, DA256: 14, DA258: 57 };

function isoDate(d: string): Date {
  return new Date(`${d}T12:00:00Z`); // noon-UTC anchor, migrate-legacy convention
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function count<T>(arr: T[], pred: (t: T) => boolean): number {
  return arr.filter(pred).length;
}

// ---- cert -> ProTrack mapping (mirrors lib/protrack/ace-sync.ts toCeCertData,
// which is server-only and cannot be imported into a tsx script) ----
const ISSUED_SELECT = {
  id: true,
  courseType: true,
  deliveryMethod: true,
  certPdfUrl: true,
  completedAt: true,
  ceHours: true,
  issuedAt: true,
  attendeeEmail: true,
  company: { select: { name: true } },
  course: { select: { application: { select: { ceHours: true, courseTitle: true } } } },
  event: { select: { name: true } },
} satisfies Prisma.IssuedCertificateSelect;

type IssuedForSync = Prisma.IssuedCertificateGetPayload<{ select: typeof ISSUED_SELECT }>;

function toCeCertData(issued: IssuedForSync, licenseeId: string) {
  const courseTitle = issued.event?.name ?? issued.course?.application.courseTitle ?? "DentalACE course";
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

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");

  // --- Parse artifacts (no DB) ---
  const companies = JSON.parse(readFileSync(join(DATA_DIR, "companies.json"), "utf8")) as NewCompany[];
  const courses = JSON.parse(readFileSync(join(DATA_DIR, "courses.json"), "utf8")) as NewCourse[];
  const quizzes = parseQuizCsv(readFileSync(join(DATA_DIR, "quiz-data.csv"), "utf8"));

  for (const co of courses) {
    if (!quizzes.has(co.legacyCourseId)) throw new Error(`No quiz parsed for ${co.legacyCourseId}`);
  }

  const records: NewCoRecord[] = [];
  const parseNotes: string[] = [];
  for (const co of courses) {
    const path = join(DATA_DIR, `attendees-${co.legacyCourseId}.csv`);
    if (!existsSync(path)) {
      if (EXPECTED_ROWS[co.legacyCourseId] !== undefined) {
        throw new Error(`${co.legacyCourseId}: expected an attendee CSV at ${path}`);
      }
      continue; // cert-less course (DA254, DA257, DA260)
    }
    const parse = parseAttendeeSheet(readFileSync(path, "utf8"), co);
    const expected = EXPECTED_ROWS[co.legacyCourseId];
    const total = parse.records.length + parse.skipped.length;
    if (expected !== undefined && total !== expected) {
      throw new Error(`${co.legacyCourseId}: parsed ${total} rows, expected ${expected}`);
    }
    for (const s of parse.skipped) {
      parseNotes.push(`${co.legacyCourseId} row ${s.rowNumber} SKIPPED ${s.name} <${s.email}>: ${s.reason}`);
    }
    records.push(...parse.records);
  }

  // NEWCO-… keys must be unique across the batch — abort loudly on collision.
  const byKey = new Map<string, NewCoRecord>();
  for (const r of records) {
    const clash = byKey.get(r.certNumber);
    if (clash) {
      throw new Error(`cert-number collision ${r.certNumber}: ${clash.da} row ${clash.rowNumber} vs ${r.da} row ${r.rowNumber}`);
    }
    byKey.set(r.certNumber, r);
  }

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
    console.log(`New-companies import  |  target DB: ${host}  |  mode: ${apply ? "APPLY" : "DRY RUN"}`);
    for (const n of parseNotes) console.log(`  ! ${n}`);

    // --- Companies: PPL must exist; new ones must be absent or already ours ---
    const ppl = await prisma.company.findUnique({
      where: { legacyId: PPL_LEGACY_ID },
      select: { id: true, name: true },
    });
    if (!ppl) throw new Error(`Company legacy_id ${PPL_LEGACY_ID} (People + Practice LLC) not found`);
    console.log(`existing company: legacy_id ${PPL_LEGACY_ID} -> "${ppl.name}"`);

    const companyIdByLegacy = new Map<number, string>([[PPL_LEGACY_ID, ppl.id]]);
    let companiesToCreate = 0;
    for (const c of companies) {
      const byLegacy = await prisma.company.findUnique({ where: { legacyId: c.legacyId }, select: { id: true, name: true } });
      if (byLegacy) {
        if (byLegacy.name !== c.name) {
          throw new Error(`Company legacy_id ${c.legacyId} exists as "${byLegacy.name}" (expected "${c.name}") — refusing`);
        }
        companyIdByLegacy.set(c.legacyId, byLegacy.id);
        console.log(`company "${c.name}" already present (legacy_id ${c.legacyId})`);
        continue;
      }
      const byName = await prisma.company.findUnique({ where: { name: c.name }, select: { id: true, legacyId: true } });
      if (byName) {
        throw new Error(`Company named "${c.name}" already exists with legacy_id ${byName.legacyId ?? "null"} — refusing`);
      }
      companiesToCreate += 1;
      if (apply) {
        const row = await prisma.company.create({
          data: { legacyId: c.legacyId, name: c.name, applicationCredits: 0, certBalance: 0, totalCertsIssued: 0 },
          select: { id: true },
        });
        companyIdByLegacy.set(c.legacyId, row.id);
        console.log(`created company "${c.name}" (legacy_id ${c.legacyId})`);
      } else {
        console.log(`would create company "${c.name}" (legacy_id ${c.legacyId})`);
      }
    }

    // --- Courses: upsert on legacyId; quiz written on create or while empty ---
    let coursesToCreate = 0;
    const courseIdByLegacy = new Map<number, string>();
    for (const co of courses) {
      const quiz = quizzes.get(co.legacyCourseId)!;
      const fields = courseFields(co);
      const approvedAt = isoDate(co.approvedAt);
      const expiresAt = isoDate(courseExpiresAtIso(co.approvedAt));
      const passedCount = count(records, (r) => r.da === co.legacyCourseId && r.passed);

      const existing = await prisma.accreditedCourse.findUnique({
        where: { legacyId: co.legacyId },
        select: { id: true, courseIdNumber: true, companyId: true, applicationId: true, quizQuestions: true },
      });
      if (existing) {
        if (existing.courseIdNumber !== co.courseIdNumber) {
          throw new Error(`Course legacy_id ${co.legacyId} is ${existing.courseIdNumber} (expected ${co.courseIdNumber}) — refusing`);
        }
        const cid = companyIdByLegacy.get(co.companyLegacyId);
        if (cid && existing.companyId !== cid) {
          throw new Error(`Course ${co.legacyCourseId} belongs to a different company — refusing`);
        }
        const quizEmpty = Array.isArray(existing.quizQuestions) && existing.quizQuestions.length === 0;
        if (apply) {
          await prisma.courseApplication.update({
            where: { id: existing.applicationId },
            data: {
              status: "APPROVED",
              courseTitle: co.courseTitle,
              ceHours: co.ceHours,
              courseType: fields.courseType,
              deliveryMethod: fields.deliveryMethod,
            },
          });
          await prisma.accreditedCourse.update({
            where: { id: existing.id },
            data: {
              approvedAt,
              expiresAt,
              ...(quizEmpty ? { quizQuestions: quiz as unknown as Prisma.InputJsonValue } : {}),
            },
          });
        }
        courseIdByLegacy.set(co.legacyId, existing.id);
        console.log(`course ${co.legacyCourseId} (${co.courseIdNumber}) already present${quizEmpty ? " — quiz refreshed" : ""}`);
        continue;
      }

      coursesToCreate += 1;
      if (!apply) {
        console.log(
          `would create course ${co.legacyCourseId} (${co.courseIdNumber}) "${co.courseTitle}" — ${co.ceHours} CE hours, ${fields.courseType}, ${fields.deliveryMethod}, approved ${co.approvedAt}, expires ${courseExpiresAtIso(co.approvedAt)}, ${passedCount} passing certs, quiz OK`,
        );
        continue;
      }
      const cid = companyIdByLegacy.get(co.companyLegacyId);
      if (!cid) throw new Error(`Course ${co.legacyCourseId} -> company legacy_id ${co.companyLegacyId} not loaded`);
      const app = await prisma.courseApplication.create({
        data: {
          companyId: cid,
          status: "APPROVED",
          courseTitle: co.courseTitle,
          ceHours: co.ceHours,
          courseType: fields.courseType,
          deliveryMethod: fields.deliveryMethod,
          applicationData: {
            legacy: true,
            legacyCourseId: co.legacyCourseId,
            source: "new-companies-2026-07",
          } as Prisma.InputJsonValue,
          submittedAt: approvedAt,
          reviewedAt: approvedAt,
        },
        select: { id: true },
      });
      const created = await prisma.accreditedCourse.create({
        data: {
          legacyId: co.legacyId,
          applicationId: app.id,
          companyId: cid,
          courseIdNumber: co.courseIdNumber,
          approvedAt,
          expiresAt,
          quizQuestions: quiz as unknown as Prisma.InputJsonValue,
          certsIssuedCount: passedCount,
        },
        select: { id: true },
      });
      courseIdByLegacy.set(co.legacyId, created.id);
      console.log(`created course ${co.legacyCourseId} (${co.courseIdNumber}) with quiz`);
    }

    // --- Certificates ---
    const courseByDa = new Map(courses.map((c) => [c.legacyCourseId, c]));
    const loadedCourseIds = [...courseIdByLegacy.values()];
    const existingCertKeys = new Set(
      loadedCourseIds.length
        ? (
            await prisma.issuedCertificate.findMany({
              where: { courseId: { in: loadedCourseIds }, legacyCertNumber: { not: null } },
              select: { legacyCertNumber: true },
            })
          ).map((r) => r.legacyCertNumber!)
        : [],
    );
    const fresh = records.filter((r) => !existingCertKeys.has(r.certNumber));
    console.log(`\ncertificates: ${records.length} parsed, ${records.length - fresh.length} already imported, ${fresh.length} new (${count(fresh, (r) => r.passed)} passed, ${count(fresh, (r) => !r.passed)} failed)`);

    for (const da of Object.keys(EXPECTED_ROWS)) {
      const rows = records.filter((r) => r.da === da);
      const scores = new Map<number, number>();
      for (const r of rows) scores.set(r.score, (scores.get(r.score) ?? 0) + 1);
      const dist = [...scores.entries()].sort((a, b) => a[0] - b[0]).map(([s, n]) => `${s}:${n}`).join("  ");
      console.log(`${da}: ${rows.length} rows (${count(rows, (r) => r.passed)} passed)  scores ${dist}`);
      for (const r of rows.filter((r) => r.completedAtSource === "submit-date")) {
        console.log(`  completion-date fallback row ${r.rowNumber} ${r.attendeeEmail}: ${JSON.stringify(r.courseDateRaw)} -> ${r.completedAt}`);
      }
      for (const r of rows.filter((r) => r.signalsDisagree || !r.endingRecognized)) {
        console.log(`  ! outcome/score disagree row ${r.rowNumber} ${r.attendeeEmail}: score=${r.score} outcome=${r.endingRecognized ? (r.passed ? "PASS" : "FAIL") : "UNRECOGNIZED"}`);
      }
      const dropped = rows.flatMap((r) => r.droppedStates);
      if (dropped.length) console.log(`  dropped states: ${dropped.join(", ")}`);
    }
    const failing = records.filter((r) => !r.passed);
    if (failing.length) {
      console.log(`\nfailing rows imported as passed=false (client follow-up list):`);
      for (const r of failing) console.log(`  ${r.da}  ${r.attendeeName} <${r.attendeeEmail}>  score ${r.score}/5`);
    }

    if (!apply) {
      console.log(
        `\nDRY RUN — nothing written. Would create ${companiesToCreate} companies, ${coursesToCreate} courses, insert ${fresh.length} certificates. Re-run with --apply.`,
      );
      return;
    }

    const certData: Prisma.IssuedCertificateCreateManyInput[] = fresh.map((r) => {
      const co = courseByDa.get(r.da)!;
      const courseId = courseIdByLegacy.get(co.legacyId);
      const companyId = companyIdByLegacy.get(co.companyLegacyId);
      if (!courseId || !companyId) throw new Error(`Cert ${r.certNumber}: unresolved course/company`);
      return {
        legacyCertNumber: r.certNumber,
        courseId,
        companyId,
        attendeeName: r.attendeeName,
        attendeeEmail: r.attendeeEmail,
        licenseType: r.licenseType,
        licenseStates: r.licenseStates,
        deliveryMethod: r.deliveryMethod,
        courseType: r.courseType,
        quizResponses: r.quizResponses as Prisma.InputJsonValue,
        score: r.score,
        passed: r.passed,
        completedAt: isoDate(r.completedAt),
        issuedAt: new Date(r.issuedAtIso),
        // ceHours intentionally omitted: course certs read hours from the application
      };
    });

    let inserted = 0;
    for (const c of chunk(certData, 500)) {
      const res = await prisma.issuedCertificate.createMany({ data: c, skipDuplicates: true });
      inserted += res.count;
    }
    console.log(`\nInserted ${inserted} certificate(s) (${certData.length - inserted} already present, skipped).`);

    // --- Counters, per company, under the company row lock ---
    const companyLegacyIds = [...new Set(courses.map((c) => c.companyLegacyId))];
    for (const legacyId of companyLegacyIds) {
      const companyId = companyIdByLegacy.get(legacyId)!;
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`select id from public.companies where id = ${companyId}::uuid for update`;
        for (const co of courses.filter((c) => c.companyLegacyId === legacyId)) {
          const cid = courseIdByLegacy.get(co.legacyId)!;
          const passedCount = await tx.issuedCertificate.count({ where: { courseId: cid, passed: true } });
          await tx.accreditedCourse.update({ where: { id: cid }, data: { certsIssuedCount: passedCount } });
          console.log(`${co.legacyCourseId}: certs_issued_count = ${passedCount}`);
        }
        const totalPassed = await tx.issuedCertificate.count({ where: { companyId, passed: true } });
        await tx.company.update({ where: { id: companyId }, data: { totalCertsIssued: totalPassed } });
        console.log(`company legacy_id ${legacyId}: total_certs_issued = ${totalPassed}`);
      });
    }

    // --- ProTrack backfill for attendee emails that already have accounts ---
    const emails = [...new Set(records.filter((r) => r.passed).map((r) => r.attendeeEmail))];
    const users = await prisma.user.findMany({
      where: { email: { in: emails, mode: "insensitive" } },
      select: { id: true, email: true },
    });
    let backfilled = 0;
    for (const u of users) {
      const issued = await prisma.issuedCertificate.findMany({
        where: { passed: true, attendeeEmail: { equals: u.email, mode: "insensitive" } },
        select: ISSUED_SELECT,
      });
      if (issued.length === 0) continue;
      const res = await prisma.ceCertificate.createMany({
        data: issued.map((i) => toCeCertData(i, u.id)),
        skipDuplicates: true,
      });
      backfilled += res.count;
    }
    console.log(`\nProTrack backfill: ${users.length} attendee email(s) already have accounts; ${backfilled} new CE record(s) linked.`);
    console.log(`Done.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
