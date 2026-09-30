/*
  Attach the 5-question quizzes for the missing KLOwen legacy courses (parsed
  out of the .docx specs the client sent) onto the AccreditedCourse rows the
  legacy loader created. The loader (scripts/migrate-legacy.ts) always writes
  quizQuestions: [], which makes the attendee page render "not configured for
  certificates". This script closes that gap for the courses whose quiz JSON
  lives in scripts/data/legacy/klowen-missing-quizzes.json.

  Contract mirrors the admin UI action at lib/admin/course-quiz.ts:
    - Validate every quiz against quizQuestionSchema.length(5) with the same
      Q1/Q2=TF, Q3-Q5=MC refinements (step4Schema). A rejected quiz stops the
      run before any DB writes — no partial states.
    - Look up each AccreditedCourse by courseIdNumber (unique). A missing row
      or a row that is an event session (single-MC eventId + non-5-question
      quiz) is skipped with a warning.
    - Write quizQuestions AND a COURSE_QUIZ_UPDATED admin_audit_log row inside
      the same transaction, so approval flow and audit history stay consistent
      with a human running the admin editor.

  Usage:
    pnpm exec tsx scripts/attach-klowen-missing-quizzes.ts             dry run
    pnpm exec tsx scripts/attach-klowen-missing-quizzes.ts --apply     write

  Actor selection:
    ADMIN_ACTOR_EMAIL=<email>  attach as that ADMIN user (must exist + be ADMIN)
    (unset)                    attach as the first `staff_role = ADMIN` user
                               ordered by createdAt asc; script fails if none.

  The Prisma client here uses the same tsx-compatible adapter pattern as
  scripts/migrate-legacy.ts (no "@/" aliases, no "server-only" imports), so it
  runs cleanly under `pnpm exec tsx` without a Next.js runtime.
*/
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, AdminAuditAction, type Prisma } from "@prisma/client";
import { z } from "zod";
import { step4Schema } from "../lib/forms/application/schemas";

config({ path: ".env.local" });

const DATA_PATH = join(process.cwd(), "scripts", "data", "legacy", "klowen-missing-quizzes.json");

const entrySchema = z.object({
  legacyCourseId: z.string(),
  quiz: step4Schema.shape.quiz,
});

type Entry = z.infer<typeof entrySchema>;

function loadEntries(): Map<string, Entry> {
  const raw = JSON.parse(readFileSync(DATA_PATH, "utf8")) as Record<string, unknown>;
  const entries = new Map<string, Entry>();
  for (const [courseIdNumber, value] of Object.entries(raw)) {
    // Skip the underscore-prefixed doc keys ("_source", "_repairs", ...).
    if (courseIdNumber.startsWith("_")) continue;
    const parsed = entrySchema.safeParse(value);
    if (!parsed.success) {
      throw new Error(
        `Invalid quiz payload for ${courseIdNumber}:\n${JSON.stringify(parsed.error.issues, null, 2)}`,
      );
    }
    entries.set(courseIdNumber, parsed.data);
  }
  return entries;
}

function quizEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function resolveActor(prisma: PrismaClient): Promise<{ id: string; email: string }> {
  const emailEnv = process.env.ADMIN_ACTOR_EMAIL?.trim();
  if (emailEnv) {
    const u = await prisma.user.findUnique({ where: { email: emailEnv }, select: { id: true, email: true, staffRole: true } });
    if (!u) throw new Error(`ADMIN_ACTOR_EMAIL=${emailEnv} not found`);
    if (u.staffRole !== "ADMIN") throw new Error(`ADMIN_ACTOR_EMAIL=${emailEnv} is not an ADMIN (staff_role=${u.staffRole})`);
    return { id: u.id, email: u.email };
  }
  const admin = await prisma.user.findFirst({
    where: { staffRole: "ADMIN" },
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true },
  });
  if (!admin) throw new Error("No ADMIN user found — seed one, or set ADMIN_ACTOR_EMAIL.");
  return admin;
}

async function main(): Promise<void> {
  const apply = process.argv.slice(2).includes("--apply");

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL is not set (populate .env.local first)");
  const host = (() => {
    try { return new URL(dbUrl).host; } catch { return "unknown"; }
  })();

  const entries = loadEntries();
  console.log(`Target DB: ${host}  |  quizzes to attach: ${entries.size}  |  mode: ${apply ? "APPLY" : "dry run"}\n`);

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: dbUrl }) });
  try {
    const actor = await resolveActor(prisma);
    console.log(`Actor: ${actor.email} (${actor.id})\n`);

    const courseIdNumbers = [...entries.keys()];
    const rows = await prisma.accreditedCourse.findMany({
      where: { courseIdNumber: { in: courseIdNumbers } },
      select: { id: true, courseIdNumber: true, eventId: true, quizQuestions: true },
    });
    const byIdNumber = new Map(rows.map((r) => [r.courseIdNumber, r]));

    let willWrite = 0;
    let alreadyCorrect = 0;
    let missing = 0;
    let skippedEventSession = 0;
    const plan: { courseId: string; courseIdNumber: string; quiz: Entry["quiz"] }[] = [];

    for (const courseIdNumber of courseIdNumbers) {
      const entry = entries.get(courseIdNumber)!;
      const row = byIdNumber.get(courseIdNumber);
      if (!row) {
        console.log(`  MISSING  ${courseIdNumber} (${entry.legacyCourseId}) — no accredited_courses row. Load courses first via pnpm migrate:legacy.`);
        missing++;
        continue;
      }
      // Event-session courses with a single-MC quiz are managed via the event
      // wizard; refuse to overwrite them here (matches lib/admin/course-quiz.ts).
      const isEventSingleQuestion =
        row.eventId != null && !Array.isArray(row.quizQuestions);
      const isEventShortQuiz =
        row.eventId != null &&
        Array.isArray(row.quizQuestions) &&
        row.quizQuestions.length > 0 &&
        row.quizQuestions.length !== 5;
      if (isEventSingleQuestion || isEventShortQuiz) {
        console.log(`  SKIP     ${courseIdNumber} — event session; leave quiz management to the event wizard.`);
        skippedEventSession++;
        continue;
      }
      if (quizEqual(row.quizQuestions, entry.quiz)) {
        console.log(`  OK       ${courseIdNumber} (${entry.legacyCourseId}) — quiz already matches, nothing to do.`);
        alreadyCorrect++;
        continue;
      }
      console.log(`  QUEUE    ${courseIdNumber} (${entry.legacyCourseId}) — will attach 5-question quiz.`);
      willWrite++;
      plan.push({ courseId: row.id, courseIdNumber, quiz: entry.quiz });
    }

    console.log(
      `\nSummary: ${entries.size} quiz payloads · ${willWrite} to write · ${alreadyCorrect} already correct · ${missing} missing course row · ${skippedEventSession} event-session skipped`,
    );

    if (!apply) {
      console.log("\nDry run — nothing written. Re-run with --apply to commit.");
      return;
    }
    if (plan.length === 0) {
      console.log("\nNothing to apply.");
      return;
    }

    for (const item of plan) {
      await prisma.$transaction(async (tx) => {
        await tx.accreditedCourse.update({
          where: { id: item.courseId },
          data: { quizQuestions: item.quiz as unknown as Prisma.InputJsonValue },
        });
        await tx.adminAuditLog.create({
          data: {
            actorUserId: actor.id,
            targetUserId: null,
            action: AdminAuditAction.COURSE_QUIZ_UPDATED,
            summary: `Updated the certificate quiz for course ${item.courseIdNumber} (legacy KLOwen backfill)`,
            details: {
              courseId: item.courseId,
              courseIdNumber: item.courseIdNumber,
              source: "scripts/attach-klowen-missing-quizzes.ts",
            } as unknown as Prisma.InputJsonValue,
          },
        });
      });
      console.log(`  wrote ${item.courseIdNumber}`);
    }

    console.log(`\nApplied ${plan.length} quiz update(s).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
