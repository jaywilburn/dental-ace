/**
 * Dev helper: insert a fully-filled DRAFT application for the test customer's
 * company so you can jump straight to /company/applications/new/review and
 * exercise the submit + reviewer-approve flow without typing 34 fields.
 *
 * Run:   pnpm tsx scripts/seed-test-application.ts
 *
 * Re-runnable: if a DRAFT already exists for Texas Dental Association, the
 * script overwrites its application_data with the canned payload.
 */

import { config } from "dotenv";
import WebSocket from "ws";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "@prisma/client";

config({ path: ".env.local" });

if (typeof globalThis.WebSocket === "undefined") {
  Object.assign(globalThis, { WebSocket });
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const APPLICATION_DATA = {
  // Step 1 — course info
  courseTitle: "Advanced Periodontal Therapy: Evidence-Based Approaches",
  ceCreditHours: 4,
  subjectMatter: "Periodontics",
  deliveryFormat: "In-Person",
  courseDurationHours: 4,
  publicProtectionStatement:
    "This course reduces patient risk by training clinicians on current evidence-based protocols for diagnosing and managing periodontitis, leading to better long-term clinical outcomes and fewer adverse events.",
  courseObjectives:
    "1. Identify the stages and grades of periodontitis per the 2017 classification.\n2. Apply evidence-based non-surgical periodontal therapy protocols.\n3. Recognize systemic-periodontal disease relationships and refer appropriately.",
  targetAudience: "General Dentists",
  adaCerpCategory: "Category 1",

  // Step 2 — creator
  creatorName: "Dr. Alex Morgan",
  credentials: "DDS, MS, Diplomate ABP",
  currentPosition: "Director of Periodontics, Texas Dental Association",
  professionalBio:
    "Dr. Morgan has practiced periodontics for 18 years, serving as faculty at two dental schools and authoring 24 peer-reviewed papers on periodontal regeneration. They are a past president of the State Periodontal Society.",

  // Step 3 — presenters
  presenters: [
    {
      name: "Dr. Alex Morgan",
      role: "Primary Presenter",
      commercialDisclosure:
        "No relevant financial relationships with ineligible companies. Receives research support from a university grant unrelated to this content.",
    },
  ],

  // Step 4 — quiz (Q1+Q2 TF, Q3-Q5 MC)
  quiz: [
    {
      type: "TF",
      question:
        "The 2017 classification system grades periodontitis based on rate of progression.",
      correctAnswer: "True",
    },
    {
      type: "TF",
      question:
        "Scaling and root planing alone reliably resolves Stage IV periodontitis without adjunctive therapy.",
      correctAnswer: "False",
    },
    {
      type: "MC",
      question:
        "Which staging factor is most directly tied to clinical attachment loss?",
      options: [
        "Probing depth",
        "Interdental clinical attachment loss",
        "Bone loss percentage by age",
        "Bleeding on probing",
      ],
      correctIndex: 1,
    },
    {
      type: "MC",
      question:
        "Which systemic condition has the strongest bi-directional relationship with periodontitis?",
      options: ["Hypertension", "Type 2 diabetes", "Asthma", "Hypothyroidism"],
      correctIndex: 1,
    },
    {
      type: "MC",
      question:
        "Initial non-surgical therapy outcomes are best evaluated at:",
      options: ["1 week", "2 weeks", "4-6 weeks", "12 weeks"],
      correctIndex: 2,
    },
  ],
};

async function main() {
  const company = await prisma.company.findFirst({
    where: { name: "Texas Dental Association" },
    select: { id: true, name: true, applicationCredits: true, expeditedCredits: true },
  });
  if (!company) {
    throw new Error(
      "Texas Dental Association company not found. Run `pnpm seed` first.",
    );
  }

  console.log(`Target company: ${company.name} (${company.id})`);
  console.log(
    `  applicationCredits=${company.applicationCredits}, expeditedCredits=${company.expeditedCredits}`,
  );

  const existing = await prisma.courseApplication.findFirst({
    where: { companyId: company.id, status: "DRAFT" },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  let applicationId: string;
  if (existing) {
    await prisma.courseApplication.update({
      where: { id: existing.id },
      data: { applicationData: APPLICATION_DATA as Prisma.InputJsonValue },
    });
    applicationId = existing.id;
    console.log(`  Overwrote existing DRAFT ${applicationId}`);
  } else {
    const created = await prisma.courseApplication.create({
      data: {
        companyId: company.id,
        status: "DRAFT",
        applicationData: APPLICATION_DATA as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
    applicationId = created.id;
    console.log(`  Created new DRAFT ${applicationId}`);
  }

  console.log("\nGo here to review + submit:");
  console.log("  http://localhost:3000/company/applications/new/review\n");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
