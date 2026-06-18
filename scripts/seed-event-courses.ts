/**
 * Dev helper: seed event-eligible APPROVED courses for the test company so the
 * Events feature is testable (client Row 4). Event Setup unlocks only when a
 * company has at least one approved course with a live delivery format plus
 * combinedCert + submitSessionsSeparately; seeding three gives enough to create
 * an event and tag multiple sessions.
 *
 * Run:   pnpm seed:events   (or: pnpm tsx scripts/seed-event-courses.ts)
 *
 * Idempotent: skips any course whose title already exists (approved) for the
 * company, so re-running never duplicates.
 */
import { config } from "dotenv";
import WebSocket from "ws";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "@prisma/client";
import { formatCourseId, nextSeqFromLast } from "@/lib/reviewer/course-id";

config({ path: ".env.local" });

if (typeof globalThis.WebSocket === "undefined") {
  Object.assign(globalThis, { WebSocket });
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

// Shared application data; per-course fields (title, hours, objectives) are
// overridden below. Live/In Person + combinedCert + submitSessionsSeparately
// make each course Event-Setup eligible once approved.
const BASE = {
  organizationName: "Texas Dental Association",
  organizationAddress: "1946 S IH-35, Suite 400, Austin, TX 78704",
  adminName: "Pat Coordinator",
  adminEmail: "pat.coordinator@example.com",
  adminPhone: "512-555-0100",
  subjectMatter: "Scientific",
  deliveryFormat: "Live/In Person",
  primaryDistributionFormat: "Live/In Person",
  combinedCert: true,
  submitSessionsSeparately: true,
  creatorName: "Dr. Alex Morgan",
  credentials: "DDS, MS, Diplomate ABP",
  currentPosition: "Director of Education, Texas Dental Association",
  detailedBioHtml:
    "<p>Dr. Morgan has 18 years of clinical and teaching experience and has authored two dozen peer-reviewed papers.</p>",
  creatorEmail: "alex.morgan@example.com",
  creatorPhone: "512-555-0101",
  creatorAddress: "1946 S IH-35, Suite 400, Austin, TX 78704",
  highestDegree: "Doctoral",
  educationPart1: "DDS, Baylor College of Dentistry, 2002; MS, UT Health San Antonio, 2005",
  educationPart4: "N/A",
  creatorExperience:
    "Eighteen years of clinical practice plus dental school faculty appointments.",
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
  quiz: [
    { type: "TF", question: "Evidence-based protocols improve long-term clinical outcomes.", correctAnswer: "True" },
    { type: "TF", question: "A single visit reliably resolves all advanced cases without follow-up.", correctAnswer: "False" },
    {
      type: "MC",
      question: "Which factor most directly guides the treatment plan?",
      options: ["Patient age", "Clinical findings and staging", "Office schedule", "Insurance type"],
      correctIndex: 1,
    },
    {
      type: "MC",
      question: "Re-evaluation of initial therapy is best performed at:",
      options: ["1 week", "2 weeks", "4-6 weeks", "12 weeks"],
      correctIndex: 2,
    },
    {
      type: "MC",
      question: "The strongest predictor of long-term success is:",
      options: ["Marketing", "Patient adherence and maintenance", "Equipment brand", "Room lighting"],
      correctIndex: 1,
    },
  ],
};

const COURSES = [
  {
    courseTitle: "Advanced Periodontal Therapy: Evidence-Based Approaches",
    ceCreditHours: 4,
    shortDescription:
      "A four-hour live course covering the 2017 periodontitis classification and evidence-based non-surgical therapy.",
    courseObjectives:
      "1. Identify the stages and grades of periodontitis.\n2. Apply evidence-based non-surgical therapy.\n3. Recognize systemic-periodontal relationships.",
    courseOutline: "Hour 1: Classification. Hour 2: Therapy. Hour 3: Systemic links. Hour 4: Cases and Q&A.",
  },
  {
    courseTitle: "Dental Implant Complications: Prevention and Management",
    ceCreditHours: 3,
    shortDescription:
      "A three-hour live course on identifying, preventing, and managing common implant complications.",
    courseObjectives:
      "1. Recognize early and late implant complications.\n2. Apply prevention protocols.\n3. Select appropriate management and referral pathways.",
    courseOutline: "Hour 1: Risk factors. Hour 2: Peri-implant disease. Hour 3: Management and cases.",
  },
  {
    courseTitle: "Oral Pathology Update for General Practice",
    ceCreditHours: 2,
    shortDescription:
      "A two-hour live update on recognizing and triaging common and high-risk oral lesions in general practice.",
    courseObjectives:
      "1. Recognize common oral mucosal lesions.\n2. Identify red-flag findings requiring referral.\n3. Document and triage appropriately.",
    courseOutline: "Hour 1: Common lesions. Hour 2: High-risk findings, referral, and cases.",
  },
];

async function main() {
  const company = await prisma.company.findFirst({
    where: { name: "Texas Dental Association" },
    select: { id: true, name: true },
  });
  if (!company) {
    throw new Error("Texas Dental Association company not found. Run `pnpm seed` first.");
  }
  const reviewer = await prisma.user.findFirst({
    where: { staffRole: { in: ["REVIEWER", "ADMIN"] } },
    select: { id: true },
  });

  console.log(`Target company: ${company.name} (${company.id})`);

  const approvedAt = new Date();
  const expiresAt = new Date(approvedAt);
  expiresAt.setFullYear(expiresAt.getFullYear() + 3);
  const year = approvedAt.getFullYear();

  // Seed sequence from the current max ACE-YYYY-##### so seeded IDs don't
  // collide with real approvals.
  const last = await prisma.accreditedCourse.findFirst({
    where: { courseIdNumber: { startsWith: `ACE-${year}-` } },
    orderBy: { courseIdNumber: "desc" },
    select: { courseIdNumber: true },
  });
  let seq = nextSeqFromLast(last?.courseIdNumber ?? null);

  let created = 0;
  for (const course of COURSES) {
    const exists = await prisma.courseApplication.findFirst({
      where: {
        companyId: company.id,
        status: "APPROVED",
        applicationData: { path: ["courseTitle"], equals: course.courseTitle },
      },
      select: { id: true },
    });
    if (exists) {
      console.log(`  ⚠ skip (exists): ${course.courseTitle}`);
      continue;
    }

    const applicationData = { ...BASE, ...course } as unknown as Prisma.InputJsonValue;
    const courseIdNumber = formatCourseId(year, seq++);

    await prisma.$transaction(async (tx) => {
      const app = await tx.courseApplication.create({
        data: {
          companyId: company.id,
          status: "APPROVED",
          courseTitle: course.courseTitle,
          ceHours: course.ceCreditHours,
          courseType: BASE.subjectMatter,
          deliveryMethod: BASE.deliveryFormat,
          applicationData,
          submittedAt: approvedAt,
          reviewedById: reviewer?.id ?? null,
          reviewedAt: approvedAt,
          reviewerNotes: "Seeded event-eligible course.",
        },
        select: { id: true },
      });
      await tx.accreditedCourse.create({
        data: {
          applicationId: app.id,
          companyId: company.id,
          courseIdNumber,
          approvedAt,
          expiresAt,
          quizQuestions: BASE.quiz as unknown as Prisma.InputJsonValue,
        },
      });
    });
    created++;
    console.log(`  ✓ approved ${courseIdNumber}: ${course.courseTitle}`);
  }

  console.log(`\nDone. ${created} new event-eligible course(s) approved.`);
  console.log("Create an event at: http://localhost:3000/company/events");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
