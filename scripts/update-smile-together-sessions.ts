/*
  One-off content correction for the approved Smile Together event
  (ACE-EVT-2026-00024, SELECTIVE_INLINE), client request 2026-09-29:

    1. Session "Marketing + Recruiting: The Collab You Didn't Know You Needed"
       (Matthew Simko) is replaced outright by Dr. Catrise Austin's "From
       Dentist to Authority" session (content from her submission .docx + CV).
    2. The "Your Brand Is Already Being Written" panel drops Brandi Marzolino
       and Brandi Carter and adds Dr. Catrise Austin.

  Edited in place so the event stays APPROVED: Event ID, attendee link, QR and
  approval letter (event name + total hours only) are unchanged. Both rows are
  re-validated against the submit-gate schemas (sessionApplicationSchema +
  mcQuestionSchema) before any write, and the original rows are backed up.

  Usage:
    pnpm exec tsx scripts/update-smile-together-sessions.ts              dry run
    pnpm exec tsx scripts/update-smile-together-sessions.ts --apply      write
    BACKUP_DIR=<dir> overrides where the pre-write JSON backup lands.
*/
import { config } from "dotenv";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "@prisma/client";
import {
  isInlineSessionComplete,
  mcQuestionSchema,
  sessionApplicationSchema,
} from "../lib/forms/event/schemas";

config({ path: ".env.local" });

const EVENT_ID = "4905d814-89e8-4dda-bc77-0954c37db0c2";
const SIMKO_SESSION_ID = "b25c7009-95e1-4d75-a3f0-515f104b2d4a";
const PANEL_SESSION_ID = "17937f1c-fb4b-40d1-a554-1ff109a669d2";

const AUSTIN_TITLE =
  "From Dentist to Authority: 7 PR Strategies to Get Featured, Attract Better Patients & Create New Revenue";

const AUSTIN_PROFILE =
  "Award-winning cosmetic and celebrity dentist with nearly three decades of experience in aesthetic dentistry, oral-health education, media, and professional visibility. Founded VIP Smiles Dentistry in 1998, built and successfully sold a New York City dental practice, and has treated high-profile entertainers, athletes, and public figures. National media experience includes NBC’s Today Show, The Dr. Oz Show, Good Morning America, Discovery Health, BET, ABC, Entrepreneur, and major consumer and dental-industry outlets. A 2024 Jeopardy! clue identified Dr. Austin as the celebrity dentist connected to Cardi B’s smile transformation. She now combines clinical expertise with branding and PR strategy to help dentists and other experts build authority, visibility, patient demand, and long-term practice value.";

const AUSTIN_EXPERIENCE_FULL =
  "Dr. Catrise Austin is an award-winning celebrity cosmetic dentist, #1 bestselling author, international speaker, media personality, podcast host, and founder of Celebrity Branding. She has built a nationally recognized platform through public relations, publishing, speaking, media, and strategic brand partnerships. Her national media experience includes NBC’s Today Show and The Dr. Oz Show, and in 2024 she was named in a Jeopardy! clue recognizing her work as a celebrity dentist. Dr. Austin has served as a national spokesperson for Colgate Total and collaborated with oral-care brands including Listerine and Sensodyne. She has authored multiple consumer and professional books and has presented for audiences including the Florida Dental Convention, Becker’s Future of Dentistry Roundtable, Yankee Dental Congress, and the National Dental Association. Through Celebrity Branding, she teaches dentists and other professionals how to turn expertise into visibility, authority, speaking opportunities, and business growth using strategies she has personally applied throughout her career.";

// Presenter experience is capped at 1,000 characters.
const AUSTIN_EXPERIENCE_SHORT =
  "Founder & Cosmetic Dentist, VIP Smiles Dentistry (1998–Present)\r\n" +
  "Founder & CEO, Celebrity Branding, LLC; creator of the Fame Formula authority-building framework\r\n" +
  "Host & Executive Producer, Let’s Talk Smiles Podcast (Best Podcast Host, Dental Socials Awards 2025)\r\n" +
  "National spokesperson: Listerine (2021–Present), Colgate Total (2013–2017), Crest/P&G ambassador (2011–2013), Sensodyne (2011)\r\n" +
  "National media: NBC Today Show, The Dr. Oz Show, Good Morning America, Discovery Health, BET, ABC, Entrepreneur\r\n" +
  "Speaker: Yankee Dental Congress 2026, Florida Dental Convention 2026, Becker’s Future of Dentistry Roundtable, National Dental Association\r\n" +
  "#1 bestselling author of multiple consumer and professional books";

const AUSTIN_EDUCATION =
  "Doctor of Dental Surgery (DDS), University of Maryland at Baltimore Dental School, 1996\r\n" +
  "General Practice Residency, Lutheran Medical Center, 1996–1997\r\n" +
  "Bachelor of Arts, Psychology, University of Michigan, 1991";

const AUSTIN_LICENSURE =
  "Licensed dentist: New York, New Jersey, and Michigan (Pennsylvania inactive). Additional training includes dental practice risk management, dental practice management, OSHA compliance, CPR for healthcare providers, and HIV/AIDS counseling certification.";

const AUSTIN_POSITION =
  "Founder & Cosmetic Dentist, VIP Smiles Dentistry; Founder & CEO, Celebrity Branding, LLC";

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function austinPresenter(role: "Primary Presenter" | "Co-Presenter") {
  return {
    name: "Dr. Catrise Austin",
    role,
    bio: AUSTIN_PROFILE,
    experience: AUSTIN_EXPERIENCE_SHORT,
    training: AUSTIN_EDUCATION,
    commercialDisclosure: "No relevant financial relationships to disclose",
  };
}

const AUSTIN_OBJECTIVES = [
  "Upon completion of this course, attendees will be able to:",
  "1. Identify the key elements of a clear professional positioning statement that communicates expertise, target audience, and areas of authority.",
  "2. Leverage educational content, including articles, books, podcasts, videos, and expert commentary, to build professional authority and increase visibility.",
  "3. Develop a stronger public presence that differentiates their dental practice and increases discoverability among prospective patients, media professionals, and professional organizations.",
  "4. Implement practical methods for connecting with media professionals and positioning themselves as trusted dental experts for interviews, features, and commentary.",
  "5. Create a PR and visibility strategy that leverages dental expertise to increase patient awareness, strengthen brand authority, and generate additional business opportunities.",
].join("\r\n");

const AUSTIN_DESCRIPTION = [
  "Being an excellent clinician is no longer enough to stand out in today’s competitive dental marketplace. Dentists must also know how to communicate their expertise, build professional authority, and strategically increase their visibility.",
  "In this practical session, celebrity cosmetic dentist, author, media personality, and Celebrity Branding founder Dr. Catrise Austin shares seven PR strategies dental professionals can use to position themselves as trusted authorities inside and outside the operatory.",
  "Attendees will learn how to clarify their expert positioning, turn their existing knowledge into authority-building content, increase discoverability, develop media-ready assets, connect with journalists and producers, pursue public speaking opportunities, leverage interviews and media appearances, and use third-party recognition to strengthen professional credibility.",
  "The session will also explore how strategic visibility can help dentists attract better-fit patients, expand professional opportunities, and create additional revenue opportunities beyond traditional chairside dentistry.",
].join("\r\n\r\n");

const AUSTIN_OUTLINE = [
  "I. Why Authority Matters in Dentistry",
  "- The difference between expertise, visibility, and authority",
  "- Why excellent dentists can still be overlooked",
  "- Moving from clinician to recognized expert",
  "II. Strategy #1: Position Yourself as an Authority",
  "- Creating a clear expert position",
  "- Identifying what you want to be known for",
  "- The importance of media-ready brand assets",
  "- Media kits, professional bios, promotional reels, websites, and optimized social profiles",
  "III. Strategy #2: Publish to Build Authority",
  "- Using educational content to demonstrate expertise",
  "- Turning existing knowledge into books, articles, guides, podcasts, and other authority assets",
  "- Repurposing one idea across multiple platforms",
  "IV. Strategy #3: Promote for Discovery",
  "- How social platforms function as modern discovery tools",
  "- Creating expert commentary rather than simply promotional content",
  "- Increasing the likelihood of being discovered by patients, journalists, event organizers, and brands",
  "V. Strategy #4: Connect Directly With the Media",
  "- Identify timely dental topics and trends that can become media-worthy story angles",
  "- Translate clinical expertise into clear, consumer-friendly commentary for interviews and media features",
  "- Become a trusted resource for journalists seeking dental expertise",
  "- Develop relationships with producers, editors, and reporters",
  "VI. Strategy #5: Leverage Podcast and Media Tours",
  "- Using multiple aligned interviews to expand reach",
  "- Building authority through repeated third-party exposure",
  "- Repurposing interviews into additional authority assets",
  "VII. Strategy #6: Become a Public Speaker",
  "- Position yourself as a dental expert for conferences, associations, panels, webinars, and community events",
  "- Turn your clinical expertise into presentation topics that attract the right audiences",
  "- Use speaking opportunities to build credibility, expand visibility, and generate new patient and business opportunities",
  "VIII. Strategy #7: Pursue Awards and Third-Party Recognition",
  "- Using awards and nominations as credibility signals",
  "- Leveraging recognition for additional media and professional opportunities",
  "- Why third-party validation can be more powerful than self-promotion",
  "IX. Turning Visibility Into Business Growth",
  "- Moving from attention to patient and business opportunities",
  "- Creating a digital pathway from media exposure to your website and offers",
  "- Turning professional authority into new revenue opportunities",
  "X. Action Plan & Closing",
  "- Selecting the PR strategies attendees can implement immediately",
  "- Developing a personal authority action plan",
  "- Key takeaways and Q&A",
  "",
  "Timing: Exact timing for each section will be provided once the final allotted session length is confirmed.",
].join("\r\n");

const AUSTIN_QUESTION = {
  type: "MC" as const,
  question:
    "Which of the following best demonstrates a dentist using PR to build professional authority?",
  options: [
    "Posting promotional offers for dental services on social media",
    "Increasing the number of paid advertisements for the practice",
    "Sharing expertise through educational content, media opportunities, speaking, and third-party visibility",
    "Relying primarily on patient referrals to grow the practice",
  ],
  correctIndex: 2,
};

type CourseInfo = Record<string, unknown>;

function replaceOnce(s: string, find: string | RegExp, replacement: string, label: string): string {
  const matches = typeof find === "string" ? s.split(find).length - 1 : (s.match(new RegExp(find, "g")) ?? []).length;
  if (matches !== 1) throw new Error(`${label}: expected exactly 1 match, found ${matches}`);
  return s.replace(find, replacement);
}

function buildSimkoReplacement(old: CourseInfo, org: { adminEmail: string; adminPhone: string }): CourseInfo {
  return {
    ...old,
    courseTitle: AUSTIN_TITLE,
    ceCreditHours: 1,
    shortDescription: AUSTIN_DESCRIPTION,
    courseObjectives: AUSTIN_OBJECTIVES,
    courseOutline: AUSTIN_OUTLINE,
    creatorName: "Dr. Catrise Austin",
    credentials: "DDS",
    currentPosition: AUSTIN_POSITION,
    detailedBioHtml: `<p>${escapeHtml(AUSTIN_PROFILE)}</p>`,
    creatorEmail: org.adminEmail,
    creatorPhone: org.adminPhone,
    creatorAddress: "2230 Hyde Park Rd, Detroit, MI 48207",
    highestDegree: "Doctoral",
    educationPart1: AUSTIN_EDUCATION,
    educationPart2: AUSTIN_LICENSURE,
    educationPart3: "N/A",
    educationPart4: "N/A",
    creatorExperience: AUSTIN_EXPERIENCE_FULL,
    presenters: [austinPresenter("Primary Presenter")],
  };
}

function buildPanelUpdate(old: CourseInfo): CourseInfo {
  const position = replaceOnce(
    String(old.currentPosition),
    "Business & Lifestyle Coach at Courage and Joy at Work, Chief Operating Officer of Integrity Dental Group, ",
    "",
    "currentPosition",
  );
  const edu = String(old.educationPart1);
  const sarahAt = edu.indexOf("Sarah Ruberg");
  if (!edu.startsWith("Brandi Marzolino") || sarahAt < 0) {
    throw new Error("educationPart1: unexpected shape, refusing to trim");
  }
  let bio = String(old.detailedBioHtml);
  bio = replaceOnce(bio, /<p>Brandi Marzolino\s*-\s*<\/p><p>[\s\S]*?<\/p>/, "", "bio Marzolino");
  bio = replaceOnce(bio, /<p>Brandi Carter\s*-\s*[\s\S]*?<\/p>/, "", "bio Carter");
  bio = bio.replace(/<p><\/p>\s*$/, "") + `<p>Dr. Catrise Austin - ${escapeHtml(AUSTIN_PROFILE)}</p>`;

  const presenters = old.presenters as unknown[];
  return {
    ...old,
    creatorName: "Sarah Ruberg, Dr. Avi Patel, Dr. Catrise Austin",
    credentials: "N/A, DDS, DDS",
    currentPosition: `${position}, ${AUSTIN_POSITION}`,
    educationPart1: `${edu.slice(sarahAt)}\r\nDr. Catrise Austin\r\n${AUSTIN_EDUCATION}`,
    detailedBioHtml: bio,
    presenters: [...presenters, austinPresenter("Co-Presenter")],
  };
}

function assertValid(label: string, courseInfo: CourseInfo, question: unknown) {
  const ci = sessionApplicationSchema.safeParse(courseInfo);
  const q = mcQuestionSchema.safeParse(question);
  if (!ci.success || !q.success || !isInlineSessionComplete({ courseInfo, question })) {
    throw new Error(
      `${label} failed validation:\n${JSON.stringify([...(ci.error?.issues ?? []), ...(q.error?.issues ?? [])], null, 2)}`,
    );
  }
}

function printDiff(label: string, before: CourseInfo, after: CourseInfo) {
  console.log(`\n=== ${label} ===`);
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const a = JSON.stringify(before[key]);
    const b = JSON.stringify(after[key]);
    if (a === b) continue;
    console.log(`- ${key}: ${a?.slice(0, 160)}`);
    console.log(`+ ${key}: ${b?.slice(0, 160)}`);
  }
}

async function main() {
  const apply = process.argv.includes("--apply");
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL is not set (populate .env.local first)");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: dbUrl }) });

  try {
    const event = await prisma.event.findUniqueOrThrow({
      where: { id: EVENT_ID },
      select: { status: true, eventIdNumber: true, eventData: true },
    });
    if (event.status !== "APPROVED" || event.eventIdNumber !== "ACE-EVT-2026-00024") {
      throw new Error(`Unexpected event state: ${event.status} ${event.eventIdNumber}`);
    }
    const org = event.eventData as { adminEmail: string; adminPhone: string };

    const rows = await prisma.eventSession.findMany({
      where: { eventId: EVENT_ID, id: { in: [SIMKO_SESSION_ID, PANEL_SESSION_ID] } },
      select: { id: true, name: true, durationHours: true, courseInfo: true, question: true },
    });
    const simko = rows.find((r) => r.id === SIMKO_SESSION_ID);
    const panel = rows.find((r) => r.id === PANEL_SESSION_ID);
    if (!simko || !panel) throw new Error("Session rows not found on this event");

    const backupPath = join(
      process.env.BACKUP_DIR ?? process.cwd(),
      `smile-together-sessions-backup-${Date.now()}.json`,
    );
    writeFileSync(backupPath, JSON.stringify(rows, null, 2));
    console.log(`Backup written: ${backupPath}`);

    const simkoInfo = buildSimkoReplacement(simko.courseInfo as CourseInfo, org);
    const panelInfo = buildPanelUpdate(panel.courseInfo as CourseInfo);

    assertValid("Austin session", simkoInfo, AUSTIN_QUESTION);
    assertValid("Panel session", panelInfo, panel.question);
    for (const [label, info] of [["Austin session", simkoInfo], ["Panel session", panelInfo]] as const) {
      const leftover = JSON.stringify(info).match(/Marzolino|Brandi Carter|Simko|SIMKO/i);
      if (leftover) throw new Error(`${label} still mentions "${leftover[0]}"`);
    }

    printDiff("Simko -> Austin", simko.courseInfo as CourseInfo, simkoInfo);
    printDiff("Panel", panel.courseInfo as CourseInfo, panelInfo);

    if (!apply) {
      console.log("\nDry run only. Re-run with --apply to write.");
      return;
    }

    await prisma.$transaction([
      prisma.eventSession.update({
        where: { id: SIMKO_SESSION_ID },
        data: {
          name: AUSTIN_TITLE,
          durationHours: 1,
          courseInfo: simkoInfo as Prisma.InputJsonValue,
          question: AUSTIN_QUESTION,
        },
      }),
      prisma.eventSession.update({
        where: { id: PANEL_SESSION_ID },
        data: { courseInfo: panelInfo as Prisma.InputJsonValue },
      }),
    ]);
    console.log("\nApplied both session updates.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
