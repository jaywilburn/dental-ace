"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import {
  step1Schema,
  step3Schema,
  orgStepSchema,
} from "@/lib/forms/application/schemas";
import { eventSessionQuizStepSchema } from "@/lib/forms/event/schemas";
import { mergeApplicationStep } from "@/lib/forms/application/merge-step";
import { step2WriteSchema } from "@/lib/forms/application/write-schemas";
import {
  courseInfoRawFromForm,
  creatorRawFromForm,
  presentersRawFromForm,
} from "@/lib/forms/application/form-mapping";
import { sanitizeRichText } from "@/lib/forms/application/rich-text";
import { normalizeFormText } from "@/lib/forms/normalize";

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

/** The sessions list for a specific event. A revised event is reachable only by
 *  explicit id, so returning to the bare list would open a different draft. */
function sessionsList(eventId: string): string {
  return `${SESSIONS_LIST}?eventId=${eventId}`;
}

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
  redirect(sessionsList(eventId));
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
  redirect(sessionsList(eventId));
}

// --- Per-session step savers (reuse the standalone wizard's schemas) ---

export async function saveSessionCourse(formData: FormData) {
  const sessionAppId = String(formData.get("sessionAppId") ?? "");
  if (!sessionAppId) throw new Error("Missing sessionAppId");
  const companyId = await customerCompanyId();

  await mergeApplicationStep(
    sessionAppId,
    companyId,
    step1Schema,
    courseInfoRawFromForm(formData),
    sessionStep(sessionAppId, "course"),
  );
  redirect(sessionStep(sessionAppId, "creator"));
}

export async function saveSessionCreator(formData: FormData) {
  const sessionAppId = String(formData.get("sessionAppId") ?? "");
  if (!sessionAppId) throw new Error("Missing sessionAppId");
  const companyId = await customerCompanyId();

  // Sanitize first so the echo can never store raw pasted markup. The visible
  // -text floor/ceiling live in step2WriteSchema; they used to be an ad-hoc
  // pre-check here that redirected BEFORE the merge helper ran, bypassing the
  // echo and blanking all 13 creator fields.
  const detailedBioHtml = sanitizeRichText(String(formData.get("detailedBioHtml") ?? ""));
  await mergeApplicationStep(
    sessionAppId,
    companyId,
    step2WriteSchema,
    creatorRawFromForm(formData, detailedBioHtml),
    sessionStep(sessionAppId, "creator"),
  );
  redirect(sessionStep(sessionAppId, "presenters"));
}

export async function saveSessionPresenters(formData: FormData) {
  const sessionAppId = String(formData.get("sessionAppId") ?? "");
  if (!sessionAppId) throw new Error("Missing sessionAppId");
  const companyId = await customerCompanyId();

  await mergeApplicationStep(
    sessionAppId,
    companyId,
    step3Schema,
    presentersRawFromForm(formData),
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
  //
  // Validated by the merge helper rather than a pre-check, so a bad question
  // echoes back to the form instead of blanking it. The helper's schema wraps
  // mcQuestionSchema, so the error paths stay quiz[0].* and map to q1_* keys.
  const question = {
    type: "MC" as const,
    question: normalizeFormText(formData.get("question")),
    options: [0, 1, 2, 3].map((j) => normalizeFormText(formData.get(`option_${j}`))),
    correctIndex: Number(formData.get("correctIndex") ?? 0),
  };
  await mergeApplicationStep(
    sessionAppId,
    companyId,
    eventSessionQuizStepSchema,
    { quiz: [question] },
    sessionStep(sessionAppId, "quiz"),
  );
  // Last step: back to the sessions list to add another or review.
  revalidatePath(SESSIONS_LIST);
  redirect(SESSIONS_LIST);
}
