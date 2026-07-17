/*
  One-time DELTA importer for the client's Pearl quiz-platform export: two CSV
  sheets (52 DA255 + 114 DA253 = 166 responses, May-July 2026) that OVERLAP the
  68 Pearl certificates already loaded by scripts/migrate-legacy.ts (whose rows
  carry LEGACY-DA25x-… legacy_cert_numbers), so dedup is mandatory.

  Data-only, mirroring migrate-legacy's load: no cert PDFs, no emails, no
  ProTrack provisioning. Failing quiz rows import as passed=false (hidden from
  the Certificate Log, which filters on passed), matching how the live attend
  flow records failed attempts.

  Modes (dry run is the DEFAULT; writes require an explicit --apply):
    pnpm import:pearl-quiz              parse + classify + report, write NOTHING
    pnpm import:pearl-quiz --apply      insert new certs + recompute counters
    --da255=path / --da253=path         override the local source CSV paths

  Idempotency:
    1. Primary: legacy_cert_number = PEARL-<sheet>-<submit ts>-<email hash>
       (unique column; createMany skipDuplicates makes re-runs no-ops).
    2. Defensive, against the 68 previously-migrated certs (different key
       namespace): multiset match on (lower(attendee_email), course,
       (completed_at ?? issued_at)::date). Passed rows pair off against
       existing certs before failed rows, earliest submission first, so a
       failed first attempt can never "consume" the existing passed cert and
       let a passing retake import as a duplicate.

  Counters (after --apply, same recompute idea as migrate-legacy): per-course
  certs_issued_count and companies.total_certs_issued are recomputed from
  actual passed=true rows (native semantics — lib/attend/issue.ts only counts
  passing certs), inside a transaction holding a FOR UPDATE lock on the
  company row. cert_balance is never touched.

  Per-cert ce_hours stays NULL on purpose: course certs resolve hours from the
  course application (DA255 = 1, DA253 = 0.5 — see lib/protrack/ace-sync.ts),
  exactly like the 68 already-migrated Pearl certs. The attendee-entered
  "How many CE Hours" column is ignored as unreliable.

  Look up, never create: the run aborts unless Company legacy_id 1 and both
  AccreditedCourse rows (legacy_id 1 = DA255, legacy_id 2 = DA253) exist with
  the expected course titles.
*/
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "@prisma/client";
import {
  classifyRecords,
  parsePearlSheet,
  PEARL_COMPANY_LEGACY_ID,
  PEARL_ORG_NAME,
  PEARL_SHEETS,
  type ClassifiedRecord,
  type PearlRecord,
  type PearlSheet,
  type PearlSheetParse,
} from "./legacy/pearl-export-parse";
import { PASS_THRESHOLD } from "../lib/attend/scoring";

config({ path: ".env.local" });

const DATA_DIR = join(process.cwd(), "scripts", "data", "legacy");
const DEFAULT_FILES: Record<PearlSheet, string> = {
  DA255: join(DATA_DIR, "pearl-DA255.csv"),
  DA253: join(DATA_DIR, "pearl-DA253.csv"),
};
const EXPECTED_TOTAL_ROWS = 166; // 52 DA255 + 114 DA253 in the delivered export

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function isoDate(d: string): Date {
  // Noon-UTC anchor, the same convention as migrate-legacy's isoDate().
  return new Date(`${d}T12:00:00Z`);
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

function count<T>(arr: T[], pred: (t: T) => boolean): number {
  return arr.filter(pred).length;
}

function reportSheet(parse: PearlSheetParse, classified: ClassifiedRecord[]): void {
  const rows = classified.filter((r) => r.sheet === parse.sheet);
  const fresh = rows.filter((r) => r.classification === "new");
  console.log(`\n--- ${parse.sheet} (${PEARL_SHEETS[parse.sheet].courseTitle}) ---`);
  console.log(`parsed rows:            ${rows.length} (+ ${parse.skipped.length} skipped)`);
  for (const s of parse.skipped) {
    console.log(`  ! skipped row ${s.rowNumber} ${s.name} <${s.email}>: ${s.reason}`);
  }
  console.log(`already imported:       ${count(rows, (r) => r.classification === "already-imported")} (PEARL-… key present in DB)`);
  console.log(`duplicate of existing:  ${count(rows, (r) => r.classification === "duplicate-of-existing")} (already-migrated LEGACY-… certs)`);
  console.log(`new certificates:       ${fresh.length}  (${count(fresh, (r) => r.passed)} passed, ${count(fresh, (r) => !r.passed)} failed)`);

  const scores = new Map<number, number>();
  for (const r of rows) scores.set(r.score, (scores.get(r.score) ?? 0) + 1);
  const dist = [...scores.entries()].sort((a, b) => a[0] - b[0]).map(([s, n]) => `${s}:${n}`).join("  ");
  console.log(`score distribution:     ${dist}`);

  const fallbacks = rows.filter((r) => r.completedAtSource === "submit-date");
  console.log(`completion-date fallbacks (implausible course date -> Submit Date): ${fallbacks.length}`);
  for (const r of fallbacks) {
    console.log(`  row ${r.rowNumber} ${r.attendeeEmail}: "${r.courseDateRaw.slice(0, 10)}" -> ${r.completedAt} [${r.classification}]`);
  }

  const disagree = rows.filter((r) => r.signalsDisagree || !r.endingRecognized);
  console.log(`Ending-vs-score disagreements (pass threshold ${PASS_THRESHOLD}/5): ${disagree.length}`);
  for (const r of disagree) {
    console.log(
      `  row ${r.rowNumber} ${r.attendeeEmail}: score=${r.score}, ending says ${r.endingRecognized ? (r.passed ? "PASS" : "FAIL") : "UNRECOGNIZED (treated as FAIL)"}`,
    );
  }
  // The plan drafted a 70% (>=4 of 5) cross-check; the app and the export both
  // use 3 of 5 (lib/attend/scoring.ts PASS_THRESHOLD, PRD Flow C). Surface the
  // rows that would flip under a 70% rule so the discrepancy is reviewable.
  const wouldFlipAt70 = rows.filter((r) => r.passed && r.score < 4);
  console.log(`passing rows below 70% (score 3 of 5 — pass under the app's 3/5 rule): ${wouldFlipAt70.length}`);
  for (const r of wouldFlipAt70) console.log(`  row ${r.rowNumber} ${r.attendeeEmail}: score=${r.score}`);

  const droppedStates = rows.flatMap((r) => r.droppedStates);
  if (droppedStates.length) console.log(`dropped (unmappable) states: ${droppedStates.join(", ")}`);
  const unmappedOcc = rows.filter((r) => !r.licenseType && r.occupationRaw);
  if (unmappedOcc.length) {
    const byOcc = new Map<string, number>();
    for (const r of unmappedOcc) byOcc.set(r.occupationRaw, (byOcc.get(r.occupationRaw) ?? 0) + 1);
    console.log(`occupations with no license-type mapping (stored as null): ${[...byOcc.entries()].map(([k, v]) => `${v}x ${k}`).join(", ")}`);
  }
  const unmappedFmt = rows.filter((r) => !r.deliveryMethod && r.courseFormatRaw);
  if (unmappedFmt.length) console.log(`course formats with no deliveryMethod mapping: ${unmappedFmt.length}`);

  console.log(`sample new rows:`);
  for (const r of fresh.slice(0, 3)) {
    console.log(
      `  ${r.certNumber}  ${r.attendeeName} <${r.attendeeEmail}>  ${r.licenseType ?? "-"} [${r.licenseStates.join(",") || "-"}]  score ${r.score}/5 ${r.passed ? "PASS" : "FAIL"}  completed ${r.completedAt} (${r.completedAtSource})`,
    );
  }
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const fileFor = (sheet: PearlSheet): string => {
    const arg = args.find((a) => a.startsWith(`--${sheet.toLowerCase()}=`));
    return arg ? arg.slice(`--${sheet.toLowerCase()}=`.length) : DEFAULT_FILES[sheet];
  };

  // --- Parse (no DB) ---
  const parses: PearlSheetParse[] = (Object.keys(PEARL_SHEETS) as PearlSheet[]).map((sheet) =>
    parsePearlSheet(readFileSync(fileFor(sheet), "utf8"), sheet),
  );
  const records = parses.flatMap((p) => p.records);
  const totalRows = records.length + parses.reduce((s, p) => s + p.skipped.length, 0);

  // The PEARL-… key must be unique across the whole export — abort loudly on a
  // collision rather than silently dropping a row via skipDuplicates.
  const byKey = new Map<string, PearlRecord>();
  for (const r of records) {
    const clash = byKey.get(r.certNumber);
    if (clash) {
      throw new Error(
        `cert-number collision ${r.certNumber}: ${clash.sheet} row ${clash.rowNumber} vs ${r.sheet} row ${r.rowNumber}`,
      );
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
    console.log(`Pearl legacy quiz delta import  |  target DB: ${host}  |  mode: ${apply ? "APPLY" : "DRY RUN"}`);
    console.log(
      `source rows: ${totalRows} (${parses.map((p) => `${p.sheet}: ${p.records.length + p.skipped.length}`).join(", ")}) — expected ${EXPECTED_TOTAL_ROWS}${totalRows === EXPECTED_TOTAL_ROWS ? "" : "  ** MISMATCH **"}`,
    );

    // --- Targets: look up, never create ---
    const company = await prisma.company.findUnique({
      where: { legacyId: PEARL_COMPANY_LEGACY_ID },
      select: { id: true, name: true, totalCertsIssued: true },
    });
    if (!company) throw new Error(`Company legacy_id ${PEARL_COMPANY_LEGACY_ID} (${PEARL_ORG_NAME}) not found`);
    if (company.name !== PEARL_ORG_NAME) {
      console.log(`note: company legacy_id ${PEARL_COMPANY_LEGACY_ID} is named "${company.name}" in the DB (expected "${PEARL_ORG_NAME}")`);
    }

    const courseIds = new Map<PearlSheet, string>();
    for (const sheet of Object.keys(PEARL_SHEETS) as PearlSheet[]) {
      const meta = PEARL_SHEETS[sheet];
      const course = await prisma.accreditedCourse.findUnique({
        where: { legacyId: meta.courseLegacyId },
        select: {
          id: true,
          companyId: true,
          certsIssuedCount: true,
          application: { select: { courseTitle: true, ceHours: true } },
        },
      });
      if (!course) throw new Error(`AccreditedCourse legacy_id ${meta.courseLegacyId} (${sheet}) not found`);
      if (course.companyId !== company.id) {
        throw new Error(`Course legacy_id ${meta.courseLegacyId} belongs to a different company — refusing to import`);
      }
      if (course.application.courseTitle !== meta.courseTitle) {
        throw new Error(
          `Course legacy_id ${meta.courseLegacyId} title mismatch: DB "${course.application.courseTitle}" vs expected "${meta.courseTitle}" — refusing to import`,
        );
      }
      courseIds.set(sheet, course.id);
      console.log(`course ${sheet} -> ${course.id}  ("${course.application.courseTitle}", ${Number(course.application.ceHours ?? 0)} CE hours, certs_issued_count=${course.certsIssuedCount})`);
    }
    const courseIdOf = (sheet: PearlSheet): string => courseIds.get(sheet)!;

    // --- Existing certs on the two courses (drives both dedup layers) ---
    const existingRows = await prisma.issuedCertificate.findMany({
      where: { courseId: { in: [...courseIds.values()] } },
      select: { legacyCertNumber: true, attendeeEmail: true, completedAt: true, issuedAt: true, courseId: true, passed: true },
    });
    // courseId is nullable in the schema (event certs); the filter above
    // guarantees it here.
    const existing = existingRows.map((e) => ({ ...e, courseId: e.courseId! }));
    console.log(`existing certificates on these courses: ${existing.length} (${count(existing, (e) => !!e.legacyCertNumber?.startsWith("PEARL-"))} from this importer)`);

    const classified = classifyRecords(records, existing, courseIdOf);
    for (const p of parses) reportSheet(p, classified);

    // --- Expected resulting counters (recomputed from passed=true rows) ---
    const fresh = classified.filter((r) => r.classification === "new");
    console.log(`\n--- Totals ---`);
    console.log(`new certificates to insert: ${fresh.length} (${count(fresh, (r) => r.passed)} passed, ${count(fresh, (r) => !r.passed)} failed)`);
    for (const sheet of Object.keys(PEARL_SHEETS) as PearlSheet[]) {
      const cid = courseIdOf(sheet);
      const existingPassed = count(existing, (e) => e.courseId === cid && e.passed);
      const newPassed = count(fresh, (r) => r.sheet === sheet && r.passed);
      console.log(`${sheet}: certs_issued_count -> ${existingPassed + newPassed} (currently-stored rows: ${existingPassed} passed + ${newPassed} new passed)`);
    }
    const companyPassed = await prisma.issuedCertificate.count({ where: { companyId: company.id, passed: true } });
    const companyTarget = companyPassed + count(fresh, (r) => r.passed);
    console.log(`company total_certs_issued: ${company.totalCertsIssued} -> ${companyTarget}`);

    if (!apply) {
      console.log(`\nDRY RUN — nothing written. Re-run with --apply to insert ${fresh.length} certificate(s) and recompute counters.`);
      return;
    }

    // --- Apply: insert, then recompute counters under the company row lock ---
    const data: Prisma.IssuedCertificateCreateManyInput[] = fresh.map((r) => ({
      legacyCertNumber: r.certNumber,
      courseId: courseIdOf(r.sheet),
      companyId: company.id,
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
      // ceHours intentionally omitted (null): course certs read hours from the
      // course application, like the previously-migrated Pearl certs.
    }));

    let inserted = 0;
    for (const c of chunk(data, 500)) {
      const res = await prisma.issuedCertificate.createMany({ data: c, skipDuplicates: true });
      inserted += res.count;
    }
    console.log(`\nInserted ${inserted} certificate(s) (${data.length - inserted} already present, skipped).`);

    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`select id from public.companies where id = ${company.id}::uuid for update`;
      for (const sheet of Object.keys(PEARL_SHEETS) as PearlSheet[]) {
        const cid = courseIdOf(sheet);
        const passedCount = await tx.issuedCertificate.count({ where: { courseId: cid, passed: true } });
        await tx.accreditedCourse.update({ where: { id: cid }, data: { certsIssuedCount: passedCount } });
        console.log(`${sheet}: certs_issued_count = ${passedCount}`);
      }
      const totalPassed = await tx.issuedCertificate.count({ where: { companyId: company.id, passed: true } });
      await tx.company.update({ where: { id: company.id }, data: { totalCertsIssued: totalPassed } });
      console.log(`company total_certs_issued = ${totalPassed}`);
    });
    console.log(`Done.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
