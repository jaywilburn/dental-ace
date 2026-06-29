/**
 * Dev helper: seed APPROVED courses + one APPROVED event of each of the four
 * event types for the test company, so the Events feature is testable end to
 * end (create is via the wizard; this gives ready-to-attend approved events).
 *
 * Run:   pnpm seed:events   (or: pnpm tsx scripts/seed-event-courses.ts)
 *
 * Idempotent: skips a course/event whose title/name already exists for the
 * company, so re-running never duplicates.
 */
import { config } from "dotenv";
import WebSocket from "ws";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma, EventType } from "@prisma/client";
import { formatCourseId, nextSeqFromLast } from "@/lib/reviewer/course-id";
import { formatEventId } from "@/lib/reviewer/event-id";

config({ path: ".env.local" });

if (typeof globalThis.WebSocket === "undefined") {
  Object.assign(globalThis, { WebSocket });
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const ORG = {
  organizationName: "Texas Dental Association",
  organizationAddress: "1946 S IH-35, Suite 400, Austin, TX 78704",
  adminName: "Pat Coordinator",
  adminEmail: "pat.coordinator@example.com",
  adminPhone: "512-555-0100",
};

const mc = (question: string, options: string[], correctIndex: number) => ({
  type: "MC" as const,
  question,
  options,
  correctIndex,
});
const tf = (question: string, correctAnswer: "True" | "False") => ({
  type: "TF" as const,
  question,
  correctAnswer,
});

const FIVE_Q = [
  tf("Evidence-based protocols improve long-term clinical outcomes.", "True"),
  tf("A single visit reliably resolves all advanced cases without follow-up.", "False"),
  mc("Which factor most directly guides the treatment plan?", ["Patient age", "Clinical findings and staging", "Office schedule", "Insurance type"], 1),
  mc("Re-evaluation of initial therapy is best performed at:", ["1 week", "2 weeks", "4-6 weeks", "12 weeks"], 2),
  mc("The strongest predictor of long-term success is:", ["Marketing", "Patient adherence and maintenance", "Equipment brand", "Room lighting"], 1),
];

const BASE = {
  ...ORG,
  subjectMatter: "Scientific",
  deliveryFormat: "Live/In Person",
  primaryDistributionFormat: "Live/In Person",
  creatorName: "Dr. Alex Morgan",
  credentials: "DDS, MS, Diplomate ABP",
  currentPosition: "Director of Education, Texas Dental Association",
  detailedBioHtml: "<p>Dr. Morgan has 18 years of clinical and teaching experience.</p>",
  creatorEmail: "alex.morgan@example.com",
  creatorPhone: "512-555-0101",
  creatorAddress: "1946 S IH-35, Suite 400, Austin, TX 78704",
  highestDegree: "Doctoral",
  educationPart1: "DDS, Baylor College of Dentistry, 2002; MS, UT Health San Antonio, 2005",
  educationPart4: "N/A",
  creatorExperience: "Eighteen years of clinical practice plus dental school faculty appointments.",
  presenters: [
    {
      name: "Dr. Alex Morgan",
      role: "Primary Presenter",
      commercialDisclosure: "No relevant financial relationships with ineligible companies.",
      experience: "Eighteen years presenting CE for state associations and dental schools.",
      training: "Faculty development and train-the-trainer programs at two dental schools.",
      bio: "Board-certified specialist and past president of a state society.",
    },
  ],
  quiz: FIVE_Q,
};

const COURSES = [
  {
    courseTitle: "Advanced Periodontal Therapy: Evidence-Based Approaches",
    ceCreditHours: 4,
    shortDescription: "A four-hour live course on the 2017 periodontitis classification and evidence-based non-surgical therapy.",
    courseObjectives: "1. Identify the stages and grades of periodontitis.\n2. Apply evidence-based non-surgical therapy.\n3. Recognize systemic-periodontal relationships.",
    courseOutline: "Hour 1: Classification. Hour 2: Therapy. Hour 3: Systemic links. Hour 4: Cases and Q&A.",
  },
  {
    courseTitle: "Dental Implant Complications: Prevention and Management",
    ceCreditHours: 3,
    shortDescription: "A three-hour live course on identifying, preventing, and managing common implant complications.",
    courseObjectives: "1. Recognize early and late implant complications.\n2. Apply prevention protocols.\n3. Select management and referral pathways.",
    courseOutline: "Hour 1: Risk factors. Hour 2: Peri-implant disease. Hour 3: Management and cases.",
  },
  {
    courseTitle: "Oral Pathology Update for General Practice",
    ceCreditHours: 2,
    shortDescription: "A two-hour live update on recognizing and triaging common and high-risk oral lesions.",
    courseObjectives: "1. Recognize common oral mucosal lesions.\n2. Identify red-flag findings requiring referral.\n3. Document and triage appropriately.",
    courseOutline: "Hour 1: Common lesions. Hour 2: High-risk findings, referral, and cases.",
  },
];

// Inline sessions for the SELECTIVE_INLINE (Opt 3) example event.
const INLINE_SESSIONS = [
  { name: "Infection Control Update", durationHours: 1.5, question: mc("OSHA bloodborne pathogen training is required:", ["Once ever", "Annually", "Every 5 years", "Never"], 1) },
  { name: "Opioid Prescribing & Pain Management", durationHours: 2, question: mc("First-line post-op analgesia for most cases is:", ["Opioids", "NSAIDs/acetaminophen", "Antibiotics", "Sedatives"], 1) },
  { name: "Dental Practice Ethics", durationHours: 1, question: mc("Informed consent must include:", ["Only the fee", "Risks, benefits, and alternatives", "Just the diagnosis", "Nothing in writing"], 1) },
];

async function ensureCourses(companyId: string, reviewerId: string | null, approvedAt: Date, expiresAt: Date, year: number) {
  const last = await prisma.accreditedCourse.findFirst({
    where: { courseIdNumber: { startsWith: `ACE-${year}-` } },
    orderBy: { courseIdNumber: "desc" },
    select: { courseIdNumber: true },
  });
  let seq = nextSeqFromLast(last?.courseIdNumber ?? null);

  for (const course of COURSES) {
    const exists = await prisma.courseApplication.findFirst({
      where: { companyId, status: "APPROVED", applicationData: { path: ["courseTitle"], equals: course.courseTitle } },
      select: { id: true },
    });
    if (exists) {
      console.log(`  ⚠ course exists: ${course.courseTitle}`);
      continue;
    }
    const applicationData = { ...BASE, ...course } as unknown as Prisma.InputJsonValue;
    const courseIdNumber = formatCourseId(year, seq++);
    await prisma.$transaction(async (tx) => {
      const app = await tx.courseApplication.create({
        data: {
          companyId,
          status: "APPROVED",
          courseTitle: course.courseTitle,
          ceHours: course.ceCreditHours,
          courseType: BASE.subjectMatter,
          deliveryMethod: BASE.deliveryFormat,
          applicationData,
          submittedAt: approvedAt,
          reviewedById: reviewerId,
          reviewedAt: approvedAt,
          reviewerNotes: "Seeded course.",
        },
        select: { id: true },
      });
      await tx.accreditedCourse.create({
        data: { applicationId: app.id, companyId, courseIdNumber, approvedAt, expiresAt, quizQuestions: BASE.quiz as unknown as Prisma.InputJsonValue },
      });
    });
    console.log(`  ✓ approved ${courseIdNumber}: ${course.courseTitle}`);
  }
}

async function main() {
  const company = await prisma.company.findFirst({
    where: { name: "Texas Dental Association" },
    select: { id: true, name: true },
  });
  if (!company) throw new Error("Texas Dental Association not found. Run `pnpm seed` first.");
  const reviewer = await prisma.user.findFirst({
    where: { staffRole: { in: ["REVIEWER", "ADMIN"] } },
    select: { id: true },
  });
  console.log(`Target company: ${company.name} (${company.id})`);

  const approvedAt = new Date();
  const expiresAt = new Date(approvedAt);
  expiresAt.setFullYear(expiresAt.getFullYear() + 3);
  const year = approvedAt.getFullYear();

  await ensureCourses(company.id, reviewer?.id ?? null, approvedAt, expiresAt, year);

  // The approved courses to attach to the per-course event types — the three
  // seeded demo courses specifically (not whatever else is approved).
  const courses = await prisma.accreditedCourse.findMany({
    where: {
      companyId: company.id,
      supersededAt: null,
      application: { courseTitle: { in: COURSES.map((c) => c.courseTitle) } },
    },
    orderBy: { approvedAt: "asc" },
    select: { id: true, application: { select: { ceHours: true } } },
    take: 3,
  });
  const courseHours = courses.reduce((s, c) => s + (c.application.ceHours ? Number(c.application.ceHours) : 0), 0);
  const inlineHours = INLINE_SESSIONS.reduce((s, x) => s + x.durationHours, 0);

  const lastEvt = await prisma.event.findFirst({
    where: { eventIdNumber: { startsWith: `ACE-EVT-${year}-` } },
    orderBy: { eventIdNumber: "desc" },
    select: { eventIdNumber: true },
  });
  let evtSeq = nextSeqFromLast(lastEvt?.eventIdNumber ?? null);

  const EVENTS = [
    { name: "TDA Annual Session 2026 (Full Day)", eventDate: "June 14, 2026", type: EventType.FULL_EVENT_QUIZ, coverage: "FULL", reuse: "EVENT_ONLY", totalHours: 8, quiz: FIVE_Q, kind: "quiz" as const },
    { name: "TDA Implant Symposium 2026", eventDate: "June 15, 2026", type: EventType.FULL_PER_COURSE, coverage: "FULL", reuse: "PER_COURSE", totalHours: courseHours, kind: "courses" as const },
    { name: "TDA Breakout Sessions 2026", eventDate: "June 16, 2026", type: EventType.SELECTIVE_INLINE, coverage: "SELECTIVE", reuse: "EVENT_ONLY", totalHours: inlineHours, kind: "inline" as const },
    { name: "TDA Multi-Track Conference 2026", eventDate: "June 17, 2026", type: EventType.SELECTIVE_PER_COURSE, coverage: "SELECTIVE", reuse: "PER_COURSE", totalHours: courseHours, kind: "courses" as const },
  ];

  // Re-runnable: drop any prior seeded demo events (scoped to these exact
  // names) so a re-run always produces correct data. Cascades to their sessions.
  await prisma.event.deleteMany({
    where: { companyId: company.id, name: { in: EVENTS.map((e) => e.name) } },
  });

  let created = 0;
  for (const ev of EVENTS) {
    if (ev.kind === "courses" && courses.length === 0) {
      console.log(`  ⚠ skip ${ev.name}: no approved courses to attach`);
      continue;
    }

    const eventIdNumber = formatEventId(year, evtSeq++);
    const eventData = {
      ...ORG,
      name: ev.name,
      eventDate: ev.eventDate,
      coverage: ev.coverage,
      reuse: ev.reuse,
      ...(ev.kind === "quiz" ? { quiz: ev.quiz } : {}),
    } as unknown as Prisma.InputJsonValue;

    const event = await prisma.event.create({
      data: {
        companyId: company.id,
        name: ev.name,
        eventDate: ev.eventDate,
        status: "APPROVED",
        eventType: ev.type,
        eventData,
        totalHours: new Prisma.Decimal(ev.totalHours),
        eventIdNumber,
        approvedAt,
        expiresAt,
        reviewedById: reviewer?.id ?? null,
        reviewedAt: approvedAt,
        reviewerNotes: "Seeded event.",
        // Deterministic asset paths; the events list regenerates the objects
        // on demand (eventAssetUrls self-heals) if they aren't uploaded yet.
        qrCodeUrl: null,
        approvalLetterUrl: null,
      },
      select: { id: true },
    });
    await prisma.event.update({
      where: { id: event.id },
      data: {
        qrCodeUrl: `qrcodes/event-${event.id}.png`,
        approvalLetterUrl: `approval-letters/event-${event.id}.pdf`,
      },
    });

    if (ev.kind === "courses") {
      await prisma.eventSession.createMany({
        data: courses.map((c, position) => ({ eventId: event.id, courseId: c.id, position })),
      });
    } else if (ev.kind === "inline") {
      await prisma.eventSession.createMany({
        data: INLINE_SESSIONS.map((s, position) => ({
          eventId: event.id,
          courseId: null,
          position,
          name: s.name,
          durationHours: new Prisma.Decimal(s.durationHours),
          question: s.question as unknown as Prisma.InputJsonValue,
        })),
      });
    }
    created++;
    console.log(`  ✓ approved event ${eventIdNumber}: ${ev.name} [${ev.type}]`);
  }

  console.log(`\nDone. ${created} new event(s) approved. Visit http://localhost:3000/company/events`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
