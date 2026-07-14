/*
  Backfill expires_at for the migrated legacy courses.

  Background: scripts/migrate-legacy.ts originally imported the 106 legacy
  courses with expires_at == approved_at — deliberately already expired so the
  public attend links stayed closed. The client now wants those courses active
  (decided 2026-07-13), so migrated courses follow the same validity rule as
  live approvals: expires_at = approved_at + 3 years (lib/reviewer/actions.ts).
  migrate-legacy.ts computes that rule going forward; this script converges the
  rows that were already imported.

  Also corrects one bad source date via LEGACY_APPROVED_AT_OVERRIDES
  (scripts/legacy/normalize.ts): course 78 ("2024 Dental Beauty Boss") arrived
  with approved_at 1900-01-14; per the title it is a 2024 course, so
  approved_at becomes 2024-01-01 (noon UTC, the legacy-date convention).

  Targets are ABSOLUTE (approved_at + 3 years), so re-running after apply is a
  no-op. Matching is on legacy_id, the stable provenance key — natively
  accredited courses (legacy_id null) are never touched.

  Usage:
    pnpm backfill:course-expirations            dry run (default): print the plan, write nothing
    pnpm backfill:course-expirations --apply    write the new dates
*/
import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { LEGACY_APPROVED_AT_OVERRIDES } from "./legacy/normalize";

config({ path: ".env.local" });

function isoDate(d: string): Date {
  return new Date(`${d}T12:00:00Z`);
}

function plusThreeYears(d: Date): Date {
  const out = new Date(d);
  out.setUTCFullYear(out.getUTCFullYear() + 3);
  return out;
}

function pad(s: string | number, w: number): string {
  const str = String(s);
  return str.length >= w ? str : str + " ".repeat(w - str.length);
}

const day = (d: Date) => d.toISOString().slice(0, 10);

async function main(): Promise<void> {
  const apply = process.argv.slice(2).includes("--apply");

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
    console.log(`Target DB: ${host}  |  mode: ${apply ? "APPLY" : "dry run"}\n`);

    const courses = await prisma.accreditedCourse.findMany({
      where: { legacyId: { not: null } },
      select: { id: true, legacyId: true, courseIdNumber: true, approvedAt: true, expiresAt: true },
      orderBy: { legacyId: "asc" },
    });
    if (courses.length === 0) {
      console.log("No legacy courses found (legacy_id is null everywhere) — nothing to do.");
      return;
    }

    const now = new Date();
    const plan = courses.map((c) => {
      const override = LEGACY_APPROVED_AT_OVERRIDES[c.legacyId!];
      const newApprovedAt = override ? isoDate(override) : c.approvedAt;
      const newExpiresAt = plusThreeYears(newApprovedAt);
      const changed =
        newApprovedAt.getTime() !== c.approvedAt.getTime() || newExpiresAt.getTime() !== c.expiresAt.getTime();
      return { ...c, newApprovedAt, newExpiresAt, changed };
    });

    console.log(
      `${pad("legacyId", 10)}${pad("courseId", 16)}${pad("approvedAt", 27)}${pad("expiresAt", 27)}status`,
    );
    console.log("-".repeat(96));
    for (const r of plan) {
      const approvedCol =
        r.newApprovedAt.getTime() === r.approvedAt.getTime()
          ? day(r.approvedAt)
          : `${day(r.approvedAt)} -> ${day(r.newApprovedAt)}`;
      const expiresCol =
        r.newExpiresAt.getTime() === r.expiresAt.getTime()
          ? day(r.expiresAt)
          : `${day(r.expiresAt)} -> ${day(r.newExpiresAt)}`;
      const status = r.changed ? (r.newExpiresAt > now ? "active after fix" : "STAYS EXPIRED") : "already correct";
      console.log(`${pad(r.legacyId!, 10)}${pad(r.courseIdNumber, 16)}${pad(approvedCol, 27)}${pad(expiresCol, 27)}${status}`);
    }

    const changes = plan.filter((r) => r.changed);
    const activeAfter = plan.filter((r) => r.newExpiresAt > now).length;
    console.log(
      `\nSummary: ${plan.length} legacy courses · ${changes.length} to update · ` +
        `${plan.length - changes.length} already correct · after fix: ${activeAfter} active, ${plan.length - activeAfter} expired`,
    );

    if (!apply) {
      console.log(`\nDry run — nothing written. Re-run with --apply to commit ${changes.length} change(s).`);
      return;
    }
    if (changes.length === 0) {
      console.log("\nNothing to apply.");
      return;
    }

    // Interactive transaction with an explicit timeout: 100+ row-by-row updates
    // through the pooled connection overrun Prisma's 5s batch default.
    await prisma.$transaction(
      async (tx) => {
        for (const r of changes) {
          await tx.accreditedCourse.update({
            where: { id: r.id },
            data: { approvedAt: r.newApprovedAt, expiresAt: r.newExpiresAt },
          });
        }
      },
      { timeout: 120_000 },
    );
    console.log(`\nApplied ${changes.length} change(s).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
