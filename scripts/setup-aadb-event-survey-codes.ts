/*
  One-off setup for AADB's approved SELECTIVE_INLINE event (client request,
  October 2026):

    1. Every session's question becomes an attendance code: the attendee types
       the code announced in that session ({type:"CODE", question, code}).
    2. The event gets AADB's starter attendee survey (13 questions) in
       events.survey.

  Edited in place so the event stays APPROVED: Event ID, attendee link, QR and
  approval letter are unchanged. It aborts unless the event is exactly the
  expected shape and NO attendee has submitted yet (zero issued_certificates),
  so no existing attempt was scored against the old MC questions.

  RUN IT BEFORE THE ATTENDEE LINK IS SHARED. The write holds the company row
  lock, which serializes it against attendee passes only; failed-attempt
  inserts are not serialized by this lock. The attempt count is re-checked
  inside the transaction before and after the writes, which narrows but does
  not close that window. Every new
  question is re-validated (codeQuestionSchema, unique after normalising,
  isInlineSessionComplete) and the survey against eventSurveySchema before any
  write, and the original rows are backed up as JSON.

  The two company feature flags (surveyEnabled, attendanceCodesEnabled) are NOT
  set here: flip them on /admin/companies/[id] so the change is audited. The
  script only warns when they are off. Note the asymmetry: the survey stays
  hidden from attendees until surveyEnabled is on, but the CODE questions are
  live on the attendee link as soon as this applies (attendanceCodesEnabled
  gates authoring and submitEvent, not the attendee path).

  SURVEY-ONLY MODE (--survey-only). AADB decided (October 2026) to KEEP their
  multiple-choice session questions, whose correct answers act as their codes.
  This mode writes the starter survey and nothing else: no --codes file, no
  session checks, no session writes. It still verifies the company and that
  the event is AADB's one APPROVED SELECTIVE_INLINE event, keeps an existing
  survey unless --force-survey, writes the backup, and is a dry run unless
  --apply. The zero-submissions guard is skipped on purpose: the survey is
  not scored and is editable at any time after approval (the same edit the
  provider or an admin can make in the UI), answers are snapshotted per
  attempt with their prompts, and an attendee holding a form rendered from
  the old survey gets a reload prompt (surveyVersion mismatch) rather than a
  mis-scored or mis-stored answer. Prefer --force-survey only before anyone
  has answered; replacing gives every question a new id, so earlier answers
  appear in the CSV under the old questions.

  Usage:
    pnpm exec tsx scripts/setup-aadb-event-survey-codes.ts --codes <file.json>            dry run
    pnpm exec tsx scripts/setup-aadb-event-survey-codes.ts --codes <file.json> --apply    write
    pnpm exec tsx scripts/setup-aadb-event-survey-codes.ts --survey-only                  dry run, survey only
    pnpm exec tsx scripts/setup-aadb-event-survey-codes.ts --survey-only --apply          write survey only
    --force-survey   replace an existing survey (default: keep it and skip)
    --survey-only    starter survey only; session questions untouched (no --codes)
    BACKUP_DIR=<dir> overrides where the pre-write JSON backup lands
    (default: logic/, gitignored; the backup holds the old MC answers).

  The codes file maps each session id to its code (AADB supplies the codes):
    { "<sessionId>": "CODE1", ... }   exactly the event's 5 sessions
  Without --survey-only the CODE behaviour above is unchanged.
*/
import { config } from "dotenv";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "@prisma/client";
import { z } from "zod";
import {
  codeQuestionSchema,
  isInlineSessionComplete,
  type CodeQuestion,
} from "../lib/forms/event/schemas";
import { duplicateCodeIds } from "../lib/attend/attendance-code";
import { eventSurveySchema, type SurveyQuestion } from "../lib/events/survey-schemas";

config({ path: ".env.local" });

const COMPANY_ID = "5425fb59-00a1-481c-8e07-f5fdbbfa364d";
const COMPANY_NAME = "AADB";
const EVENT_ID = "2e5bab85-4945-4f98-94ec-f72379fcb342";
const SESSION_COUNT = 5;

const CODE_PROMPT = "Enter the attendance code announced during this session.";

// --- Args (strict: anything unrecognised is an error) ---

type Args = { apply: boolean; forceSurvey: boolean } & (
  | { surveyOnly: false; codesPath: string }
  | { surveyOnly: true; codesPath: null }
);

function parseArgs(argv: string[]): Args {
  let apply = false;
  let forceSurvey = false;
  let surveyOnly = false;
  let codesPath: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--apply") apply = true;
    else if (arg === "--force-survey") forceSurvey = true;
    else if (arg === "--survey-only") surveyOnly = true;
    else if (arg === "--codes") {
      codesPath = argv[++i] ?? null;
      if (!codesPath || codesPath.startsWith("--")) throw new Error("--codes needs a path: --codes <file.json>");
    } else if (arg.startsWith("--codes=")) {
      codesPath = arg.slice("--codes=".length);
      if (!codesPath) throw new Error("--codes needs a path: --codes=<file.json>");
    } else throw new Error(`Unrecognised argument "${arg}".`);
  }
  if (surveyOnly) {
    // Refuse the mix rather than silently ignoring the codes file.
    if (codesPath) throw new Error("--survey-only leaves session questions alone; drop --codes.");
    return { apply, forceSurvey, surveyOnly: true, codesPath: null };
  }
  if (!codesPath) throw new Error("Missing --codes <file.json> (a {sessionId: code} map from AADB), or pass --survey-only.");
  return { apply, forceSurvey, surveyOnly: false, codesPath };
}

const codesFileSchema = z.record(z.guid(), z.string());

// --- Starter survey (AADB's list; see the report for the edits made to it) ---

type Draft =
  | { type: "SINGLE_CHOICE" | "MULTI_CHOICE"; prompt: string; required: boolean; options: string[] }
  | { type: "SHORT_TEXT" | "LONG_TEXT"; prompt: string; required: boolean };

const single = (prompt: string, options: string[]): Draft => ({ type: "SINGLE_CHOICE", prompt, required: true, options });
const multi = (prompt: string, options: string[], required = true): Draft => ({ type: "MULTI_CHOICE", prompt, required, options });
const long = (prompt: string): Draft => ({ type: "LONG_TEXT", prompt, required: false });

const STARTER_SURVEY: Draft[] = [
  single("Please indicate your relationship with the AADB", [
    "Individual Member (voting)",
    "Associate Member (non-voting)",
    "Non-member",
    "Unsure",
  ]),
  single("I am a", [
    "State Board Member",
    "State Board Administrator",
    "Faculty Member",
    "Testing Agency Representative",
    "Past State Board Member",
    "Exhibitor/Sponsor",
    "Other",
  ]),
  multi(
    "Which of the following categories describe your participation in the AADB meeting? (Select all that apply)",
    ["Attendee", "Speaker", "Exhibitor/Sponsor", "Other"],
  ),
  single("Overall, were you satisfied or dissatisfied with the meeting?", [
    "Very satisfied",
    "Satisfied",
    "Dissatisfied",
    "Very dissatisfied",
  ]),
  single("Did the conference meet your expectations?", ["Yes", "No"]),
  long("What was your favorite part of the meeting? How could we enrich your experience?"),
  // AADB's text read "entourage"; corrected to "encourage".
  long(
    "The structure of the dental boards varies greatly from jurisdiction to jurisdiction. Do you have any suggestions on how the organization can encourage more participation from your board members?",
  ),
  multi(
    "If you are a member, are you interested in participating in any of the following committees/councils/commissions in the future?",
    [
      "ACE Accreditation Committee",
      "Ad Hoc Committee for Revenue Generation",
      "Administrators' Committee",
      "Award Selection Committee",
      "Bylaws Committee",
    ],
    false,
  ),
  long("Do you have any suggestions for future venues/locations?"),
  long("Do you have any suggestions for future speakers and/or session topics?"),
  single("What days do you prefer for future meetings?", ["Friday/Saturday", "Saturday/Sunday", "Other"]),
  single("Will you and/or others from your organization be able to travel in the fall of 2027?", ["Yes", "No"]),
  long(
    "Please offer any closing comments and/or suggestions for improvements that you would like for the Program Committee to consider for future meetings.",
  ),
];

function buildSurvey(): SurveyQuestion[] {
  const parsed = eventSurveySchema.safeParse(STARTER_SURVEY.map((q) => ({ id: randomUUID(), ...q })));
  if (!parsed.success) {
    throw new Error(`Starter survey failed validation:\n${JSON.stringify(parsed.error.issues, null, 2)}`);
  }
  const text = JSON.stringify(parsed.data);
  if (text.includes("—")) throw new Error("Starter survey contains an em dash");
  return parsed.data;
}

function hasStoredSurvey(json: unknown): boolean {
  return json != null && !(Array.isArray(json) && json.length === 0);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL is not set (populate .env.local first)");

  // Read the codes file before connecting so a bad file fails fast.
  let codes: Record<string, string> = {};
  if (!args.surveyOnly) {
    const codesParsed = codesFileSchema.safeParse(JSON.parse(readFileSync(args.codesPath, "utf8")));
    if (!codesParsed.success) {
      throw new Error(`Codes file must be a {sessionId: code} object:\n${JSON.stringify(codesParsed.error.issues, null, 2)}`);
    }
    codes = codesParsed.data;
  }
  if (args.surveyOnly) console.log("Mode: --survey-only (session questions are not read or changed).");

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: dbUrl }) });
  try {
    // 1. Company + event shape.
    const company = await prisma.company.findUniqueOrThrow({
      where: { id: COMPANY_ID },
      select: { name: true, surveyEnabled: true, attendanceCodesEnabled: true },
    });
    if (company.name !== COMPANY_NAME) {
      throw new Error(`Company ${COMPANY_ID} is "${company.name}", expected "${COMPANY_NAME}"`);
    }
    const approvedInline = await prisma.event.findMany({
      where: { companyId: COMPANY_ID, status: "APPROVED", eventType: "SELECTIVE_INLINE" },
      select: { id: true },
    });
    if (approvedInline.length !== 1 || approvedInline[0].id !== EVENT_ID) {
      throw new Error(
        `Expected exactly one APPROVED SELECTIVE_INLINE event (${EVENT_ID}) for ${COMPANY_NAME}, found: ${approvedInline.map((e) => e.id).join(", ") || "none"}`,
      );
    }
    const event = await prisma.event.findUniqueOrThrow({
      where: { id: EVENT_ID },
      select: {
        id: true,
        name: true,
        companyId: true,
        status: true,
        eventType: true,
        eventIdNumber: true,
        survey: true,
        sessions: {
          orderBy: { position: "asc" },
          select: { id: true, position: true, name: true, courseId: true, question: true, courseInfo: true },
        },
      },
    });
    if (event.companyId !== COMPANY_ID || event.status !== "APPROVED" || event.eventType !== "SELECTIVE_INLINE") {
      throw new Error(`Unexpected event state: ${event.companyId} ${event.status} ${event.eventType}`);
    }
    console.log(`Event: ${event.name} (${event.eventIdNumber ?? "no Event ID"})`);

    // Steps 2-4 guard the session-question rewrite only; --survey-only skips
    // them (see the header for why the zero-submissions guard is not needed).
    const newQuestions = new Map<string, CodeQuestion>();
    if (!args.surveyOnly) {
      // 2. Five lightweight inline sessions, no session CourseApplication rows.
      if (event.sessions.length !== SESSION_COUNT) {
        throw new Error(`Expected ${SESSION_COUNT} sessions, found ${event.sessions.length}`);
      }
      const courseBacked = event.sessions.filter((s) => s.courseId !== null);
      if (courseBacked.length > 0) {
        throw new Error(`Sessions are course-backed (course_id set): ${courseBacked.map((s) => s.id).join(", ")}`);
      }
      const sessionApps = await prisma.courseApplication.count({ where: { eventId: EVENT_ID } });
      if (sessionApps !== 0) {
        throw new Error(`Event has ${sessionApps} session CourseApplication rows; refusing (SELECTIVE_INLINE must have none)`);
      }

      // 3. Nobody has submitted: no attempt was scored against the old questions.
      const certs = await prisma.issuedCertificate.count({ where: { eventId: EVENT_ID } });
      if (certs !== 0) throw new Error(`Event already has ${certs} issued_certificates rows; refusing`);

      // 4. Codes: one per session, valid, unique after normalising.
      const sessionIds = new Set(event.sessions.map((s) => s.id));
      const codeIds = Object.keys(codes);
      const unknown = codeIds.filter((id) => !sessionIds.has(id));
      const missing = [...sessionIds].filter((id) => !(id in codes));
      if (unknown.length || missing.length) {
        throw new Error(
          `Codes file must cover exactly the event's sessions.\n  unknown: ${unknown.join(", ") || "none"}\n  missing: ${missing.join(", ") || "none"}`,
        );
      }
      const dupes = duplicateCodeIds(codeIds.map((id) => ({ id, code: codes[id] })));
      if (dupes.size > 0) {
        throw new Error(`Codes must be unique (case and spaces ignored). Duplicates on sessions: ${[...dupes].join(", ")}`);
      }
      for (const s of event.sessions) {
        const parsed = codeQuestionSchema.safeParse({ type: "CODE", question: CODE_PROMPT, code: codes[s.id] });
        if (!parsed.success) {
          throw new Error(`Session ${s.id} code is invalid:\n${JSON.stringify(parsed.error.issues, null, 2)}`);
        }
        if (!isInlineSessionComplete({ courseInfo: s.courseInfo, question: parsed.data })) {
          throw new Error(`Session ${s.id} would not be complete with the new question (check its course info)`);
        }
        newQuestions.set(s.id, parsed.data);
      }
    }

    // 5. Survey: keep an existing one unless --force-survey.
    const existingSurvey = hasStoredSurvey(event.survey);
    const writeSurvey = !existingSurvey || args.forceSurvey;
    const survey = buildSurvey();

    // 6. Flags are flipped in the admin UI (audited); warn only.
    if (!company.surveyEnabled) console.warn("WARN: AADB has event surveys OFF. Turn them on at /admin/companies/[id].");
    if (!args.surveyOnly && !company.attendanceCodesEnabled) {
      console.warn("WARN: AADB has attendance codes OFF. Turn them on at /admin/companies/[id].");
    }

    const backupPath = join(
      process.env.BACKUP_DIR ?? join(process.cwd(), "logic"),
      `aadb-event-survey-codes-backup-${Date.now()}.json`,
    );
    writeFileSync(
      backupPath,
      JSON.stringify(
        {
          eventId: event.id,
          mode: args.surveyOnly ? "survey-only" : "codes",
          survey: event.survey,
          sessions: event.sessions.map(({ id, name, question }) => ({ id, name, question })),
        },
        null,
        2,
      ),
    );
    console.log(`Backup written: ${backupPath}`);

    console.log("\n=== Session questions ===");
    if (args.surveyOnly) {
      console.log(`Unchanged (--survey-only): ${event.sessions.length} sessions keep their current questions.`);
    }
    for (const s of args.surveyOnly ? [] : event.sessions) {
      console.log(`- [${s.position}] ${s.name ?? "Session"} (${s.id})`);
      console.log(`    before: ${JSON.stringify(s.question)?.slice(0, 160)}`);
      console.log(`    after:  ${JSON.stringify(newQuestions.get(s.id))}`);
    }
    console.log("\n=== Survey ===");
    if (!writeSurvey) {
      console.log("Event already has a survey; keeping it (pass --force-survey to replace).");
    } else {
      if (existingSurvey) console.log("Replacing the existing survey (--force-survey).");
      survey.forEach((q, i) => {
        const opts = "options" in q ? ` [${q.options.join(" | ")}]` : "";
        console.log(`${i + 1}. (${q.type}${q.required ? ", required" : ", optional"}) ${q.prompt}${opts}`);
      });
    }

    if (!args.apply) {
      console.log("\nDry run only. Re-run with --apply to write.");
      return;
    }

    if (args.surveyOnly) {
      if (!writeSurvey) {
        console.log("\nNothing to write.");
        return;
      }
      // A survey edit is not scored and holds no lock in the app either (the
      // provider and admin editors write it the same way). Scoped to the
      // still-APPROVED event so a status change since the checks writes nothing.
      // Without --force-survey it is also scoped to "still has no survey" (the
      // same test as hasStoredSurvey: SQL/JSON null or an empty array), so a
      // survey the provider saved after the checks above is never overwritten.
      const { count } = await prisma.event.updateMany({
        where: {
          id: EVENT_ID,
          companyId: COMPANY_ID,
          status: "APPROVED",
          eventType: "SELECTIVE_INLINE",
          ...(args.forceSurvey
            ? {}
            : { OR: [{ survey: { equals: Prisma.AnyNull } }, { survey: { equals: [] } }] }),
        },
        data: { survey: survey as unknown as Prisma.InputJsonValue },
      });
      if (count === 0) {
        throw new Error(
          `Event ${EVENT_ID} changed since the checks (status, type or a survey saved meanwhile); nothing written. ` +
            "Re-run the dry run, or pass --force-survey to replace a saved survey.",
        );
      }
      console.log(`\nApplied the starter survey (${survey.length} questions). Session questions untouched.`);
      return;
    }

    await prisma.$transaction(async (tx) => {
      // Re-check inside the transaction: an attendee could have submitted
      // between the dry-run checks above and this write. The company row lock
      // is the one the attendee PASS path takes, so no pass can land while it
      // is held. FAILED attempts are inserted without that lock, so they are
      // not serialized by it: the count is taken again after the writes to
      // catch one that committed meanwhile (READ COMMITTED sees it), but one
      // committing after that last count can still slip through. That is why
      // this must run before the attendee link is shared.
      await tx.$executeRaw`select id from public.companies where id = ${COMPANY_ID}::uuid for update`;
      const assertNoAttempts = async (when: string) => {
        const late = await tx.issuedCertificate.count({ where: { eventId: EVENT_ID } });
        if (late !== 0) throw new Error(`An attendee submitted ${when} (${late} rows); aborting`);
      };
      await assertNoAttempts("before the write");
      for (const [id, question] of newQuestions) {
        await tx.eventSession.update({ where: { id }, data: { question } });
      }
      if (writeSurvey) {
        await tx.event.update({
          where: { id: EVENT_ID },
          data: { survey: survey as unknown as Prisma.InputJsonValue },
        });
      }
      await assertNoAttempts("during the write");
    });
    console.log(`\nApplied ${newQuestions.size} attendance-code questions${writeSurvey ? " and the starter survey" : ""}.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
