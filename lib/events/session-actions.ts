"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import {
  step1Schema,
  step2Schema,
  step3Schema,
  orgStepSchema,
} from "@/lib/forms/application/schemas";
import {
  mcQuestionSchema,
  eventSessionQuizStepSchema,
} from "@/lib/forms/event/schemas";
import { mergeApplicationStep } from "@/lib/forms/application/merge-step";
import {
  sanitizeRichText,
  richTextPlainLength,
} from "@/lib/forms/application/rich-text";

/*
  Server actions for the inline event-session sub-wizard (event-only full-course
  path). Each session of a non-reusable event is a full CourseApplication scoped
  to the event (eventId + sessionPosition), captured here instead of the
  standalone application wizard. Org/contact is inherited from the event at
  creation, so the sub-wizard only covers Course -> Creator -> Presenters -> Quiz.

  Validation + persistence reuse the exact same schemas + merge core as the
  standalone wizard (lib/forms/application/merge-step.ts). Only the redirect
  targets differ (they stay inside the event flow).
*/

const SESSIONS_LIST = "/company/events/new/sessions";

/** Per-session sub-wizard step routes, keyed by the session application id. */
function sessionStep(sessionAppId: string, step: "course" | "creator" | "presenters" | "quiz") {
  return `${SESSIONS_LIST}/${sessionAppId}/${step}`;
}

async function customerCompanyId(): Promise<string> {
  const user = await getCurrentUser();
  if (!user || !user.companyId) redirect("/login");
  return user.companyId;
}

/** The company's own DRAFT event, or redirect out. */
async function requireDraftEvent(eventId: string, companyId: string) {
  const event = await prisma.event.findFirst({
    where: { id: eventId, companyId, status: "DRAFT" },
    select: { id: true, eventData: true },
  });
  if (!event) throw new Error("Event draft not found");
  return event;
}

/**
 * Add a new session to the event: a DRAFT CourseApplication scoped to the event
 * (eventId + next sessionPosition), pre-seeded with the event's org/contact so
 * the sub-wizard can skip the org step. Redirects into the new session's first
 * step (Course Info).
 */
export async function addSessionApplication(formData: FormData) {
  const eventId = String(formData.get("eventId") ?? "");
  if (!eventId) throw new Error("Missing eventId");
  const companyId = await customerCompanyId();
  const event = await requireDraftEvent(eventId, companyId);

  // Inherit org/contact from the event so every session shares one provider.
  const ed = (event.eventData as Record<string, unknown> | null) ?? {};
  const org = orgStepSchema.partial().safeParse({
    organizationName: ed.organizationName,
    organizationAddress: ed.organizationAddress,
    adminName: ed.adminName,
    adminEmail: ed.adminEmail,
    adminPhone: ed.adminPhone,
  });
  const seededOrg = org.success ? org.data : {};

  const count = await prisma.courseApplication.count({
    where: { eventId, companyId, status: "DRAFT" },
  });

  const created = await prisma.courseApplication.create({
    data: {
      companyId,
      status: "DRAFT",
      eventId,
      sessionPosition: count,
      applicationData: seededOrg as Prisma.InputJsonValue,
    },
    select: { id: true },
  });

  redirect(sessionStep(created.id, "course"));
}

/** Delete a session application and keep the remaining positions contiguous. */
export async function removeSessionApplication(formData: FormData) {
  const eventId = String(formData.get("eventId") ?? "");
  const sessionAppId = String(formData.get("sessionAppId") ?? "");
  if (!eventId || !sessionAppId) throw new Error("Missing ids");
  const companyId = await customerCompanyId();

  await prisma.$transaction(async (tx) => {
    // Ownership: the session app must belong to this company's DRAFT event.
    const target = await tx.courseApplication.findFirst({
      where: { id: sessionAppId, eventId, companyId, status: "DRAFT" },
      select: { id: true },
    });
    if (!target) throw new Error("Session not found");
    await tx.courseApplication.delete({ where: { id: sessionAppId } });

    // Repack sessionPosition so the list stays 0..n-1 in order.
    const rest = await tx.courseApplication.findMany({
      where: { eventId, companyId, status: "DRAFT" },
      orderBy: { sessionPosition: "asc" },
      select: { id: true },
    });
    await Promise.all(
      rest.map((r, position) =>
        tx.courseApplication.update({
          where: { id: r.id },
          data: { sessionPosition: position },
        }),
      ),
    );
  });

  revalidatePath(SESSIONS_LIST);
  redirect(SESSIONS_LIST);
}

/** Persist a new ordering of the event's session applications. */
export async function reorderSessionApplications(formData: FormData) {
  const eventId = String(formData.get("eventId") ?? "");
  if (!eventId) throw new Error("Missing eventId");
  const companyId = await customerCompanyId();
  const orderedIds = formData.getAll("orderedIds").map((v) => String(v));

  await prisma.$transaction(async (tx) => {
    const owned = await tx.courseApplication.findMany({
      where: { eventId, companyId, status: "DRAFT" },
      select: { id: true },
    });
    const ownedIds = new Set(owned.map((o) => o.id));
    // Only reorder ids we own; ignore anything unexpected.
    const clean = orderedIds.filter((id) => ownedIds.has(id));
    await Promise.all(
      clean.map((id, position) =>
        tx.courseApplication.update({
          where: { id },
          data: { sessionPosition: position },
        }),
      ),
    );
  });

  revalidatePath(SESSIONS_LIST);
  redirect(SESSIONS_LIST);
}

// --- Per-session step savers (reuse the standalone wizard's schemas) ---

export async function saveSessionCourse(formData: FormData) {
  const sessionAppId = String(formData.get("sessionAppId") ?? "");
  if (!sessionAppId) throw new Error("Missing sessionAppId");
  const companyId = await customerCompanyId();

  const raw = {
    courseTitle: String(formData.get("courseTitle") ?? ""),
    ceCreditHours: Number(formData.get("ceCreditHours") ?? 0),
    subjectMatter: String(formData.get("subjectMatter") ?? ""),
    deliveryFormat: String(formData.get("deliveryFormat") ?? ""),
    primaryDistributionFormat: String(formData.get("primaryDistributionFormat") ?? ""),
    shortDescription: String(formData.get("shortDescription") ?? ""),
    publicProtectionStatement: String(formData.get("publicProtectionStatement") ?? ""),
    courseObjectives: String(formData.get("courseObjectives") ?? ""),
    courseOutline: String(formData.get("courseOutline") ?? ""),
  };
  await mergeApplicationStep(
    sessionAppId,
    companyId,
    step1Schema,
    raw,
    sessionStep(sessionAppId, "course"),
  );
  redirect(sessionStep(sessionAppId, "creator"));
}

export async function saveSessionCreator(formData: FormData) {
  const sessionAppId = String(formData.get("sessionAppId") ?? "");
  if (!sessionAppId) throw new Error("Missing sessionAppId");
  const companyId = await customerCompanyId();

  const detailedBioHtml = sanitizeRichText(String(formData.get("detailedBioHtml") ?? ""));
  if (richTextPlainLength(detailedBioHtml) < 20) {
    redirect(
      `${sessionStep(sessionAppId, "creator")}?error=validation&detail=${encodeURIComponent(
        "Detailed bio: please write at least 20 characters.",
      )}`,
    );
  }
  const raw = {
    creatorName: String(formData.get("creatorName") ?? ""),
    credentials: String(formData.get("credentials") ?? ""),
    currentPosition: String(formData.get("currentPosition") ?? ""),
    detailedBioHtml,
    creatorEmail: String(formData.get("creatorEmail") ?? ""),
    creatorPhone: String(formData.get("creatorPhone") ?? ""),
    creatorAddress: String(formData.get("creatorAddress") ?? ""),
    highestDegree: String(formData.get("highestDegree") ?? ""),
    educationPart1: String(formData.get("educationPart1") ?? ""),
    educationPart2: String(formData.get("educationPart2") ?? "") || undefined,
    educationPart3: String(formData.get("educationPart3") ?? "") || undefined,
    educationPart4: String(formData.get("educationPart4") ?? "") || "N/A",
    creatorExperience: String(formData.get("creatorExperience") ?? ""),
  };
  await mergeApplicationStep(
    sessionAppId,
    companyId,
    step2Schema,
    raw,
    sessionStep(sessionAppId, "creator"),
  );
  redirect(sessionStep(sessionAppId, "presenters"));
}

export async function saveSessionPresenters(formData: FormData) {
  const sessionAppId = String(formData.get("sessionAppId") ?? "");
  if (!sessionAppId) throw new Error("Missing sessionAppId");
  const companyId = await customerCompanyId();

  const presenters = [
    {
      name: String(formData.get("presenter_0_name") ?? ""),
      role: String(formData.get("presenter_0_role") ?? "Primary Presenter"),
      commercialDisclosure: String(formData.get("presenter_0_commercialDisclosure") ?? ""),
      experience: String(formData.get("presenter_0_experience") ?? ""),
      training: String(formData.get("presenter_0_training") ?? ""),
      bio: String(formData.get("presenter_0_bio") ?? ""),
    },
  ];
  await mergeApplicationStep(
    sessionAppId,
    companyId,
    step3Schema,
    { presenters },
    sessionStep(sessionAppId, "presenters"),
  );
  redirect(sessionStep(sessionAppId, "quiz"));
}

export async function saveSessionQuiz(formData: FormData) {
  const sessionAppId = String(formData.get("sessionAppId") ?? "");
  if (!sessionAppId) throw new Error("Missing sessionAppId");
  const companyId = await customerCompanyId();

  // One MC question per session (July 2026): it becomes the single question the
  // attendee answers for this session (course.quizQuestions -> firstCourseMc).
  // Stored as a 1-element quiz array so downstream reads are unchanged.
  const question = {
    type: "MC" as const,
    question: String(formData.get("question") ?? ""),
    options: [0, 1, 2, 3].map((j) => String(formData.get(`option_${j}`) ?? "")),
    correctIndex: Number(formData.get("correctIndex") ?? 0),
  };
  const result = mcQuestionSchema.safeParse(question);
  if (!result.success) {
    const issue = result.error.issues[0];
    const detail = issue
      ? `${String(issue.path[0] ?? "Question")}: ${issue.message}`.slice(0, 200)
      : "Please complete the question and all four answers.";
    redirect(
      `${sessionStep(sessionAppId, "quiz")}?error=validation&detail=${encodeURIComponent(detail)}`,
    );
  }
  await mergeApplicationStep(
    sessionAppId,
    companyId,
    eventSessionQuizStepSchema,
    { quiz: [result.data] },
    sessionStep(sessionAppId, "quiz"),
  );
  // Last step: back to the sessions list to add another or review.
  revalidatePath(SESSIONS_LIST);
  redirect(SESSIONS_LIST);
}
