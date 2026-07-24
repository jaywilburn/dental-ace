"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma, EventType } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import {
  step2Schema,
  step3Schema,
} from "@/lib/forms/application/schemas";
import {
  sessionCourseInfoSchema,
  mcQuestionSchema,
} from "@/lib/forms/event/schemas";
import {
  courseInfoRawFromForm,
  creatorRawFromForm,
  presentersRawFromForm,
} from "@/lib/forms/application/form-mapping";
import {
  sanitizeRichText,
  richTextPlainLength,
} from "@/lib/forms/application/rich-text";

/*
  Server actions for the SELECTIVE_INLINE per-session mini-wizard. Each session
  is an inline EventSession row (courseId null) whose whole front-half
  application (Course Info + Creator + Presenters) is stored MERGED in
  event_sessions.course_info, with its one MC question in
  event_sessions.question. This is the lightweight event-only path: NO
  CourseApplication / AccreditedCourse rows are ever created (approveEvent keys
  the accreditation model on pending session applications existing), and billing
  stays one application credit per session at submit.

  Parallels lib/events/session-actions.ts (the FULL_EVENT_QUIZ full-course
  sub-wizard) but targets event_sessions JSONB instead of course_applications,
  and ends in a single MC question rather than a 5-question quiz.
*/

const SESSIONS_LIST = "/company/events/new/sessions";

type InlineStep = "course" | "creator" | "presenters" | "question";

function sessionStep(sessionId: string, step: InlineStep): string {
  return `/company/events/new/inline-sessions/${sessionId}/${step}`;
}

async function customerCompanyId(): Promise<string> {
  const user = await getCurrentUser();
  if (!user || !user.companyId) redirect("/login");
  return user.companyId;
}

/** Recompute Event.totalHours from the inline sessions' mirrored durations. */
async function recomputeEventTotalHours(
  tx: Prisma.TransactionClient | typeof prisma,
  eventId: string,
): Promise<void> {
  const sessions = await tx.eventSession.findMany({
    where: { eventId, courseId: null },
    select: { durationHours: true },
  });
  const total = sessions.reduce(
    (sum, s) => sum + (s.durationHours ? Number(s.durationHours) : 0),
    0,
  );
  await tx.event.update({
    where: { id: eventId },
    data: { totalHours: new Prisma.Decimal(total) },
  });
}

/**
 * Validate a course-application step slice and merge it into the session's
 * course_info JSONB (scoped to the caller's company + a DRAFT, inline session).
 * Mirrors mergeApplicationStep, but on EventSession instead of CourseApplication.
 * Returns the parsed slice + the parent event id.
 */
async function mergeSessionSlice(
  sessionId: string,
  companyId: string,
  schema: z.ZodTypeAny,
  raw: unknown,
  errorRoute: string,
  extraColumns?: (parsed: Record<string, unknown>) => Record<string, unknown>,
): Promise<{ parsed: Record<string, unknown>; eventId: string }> {
  const result = schema.safeParse(raw);
  if (!result.success) {
    const issue = result.error.issues[0];
    const detail = issue
      ? `${String(issue.path[0] ?? "Form")}: ${issue.message}`.slice(0, 200)
      : "Please check the highlighted fields.";
    redirect(`${errorRoute}?error=validation&detail=${encodeURIComponent(detail)}`);
  }
  const parsed = result.data as Record<string, unknown>;

  const session = await prisma.eventSession.findFirst({
    where: {
      id: sessionId,
      courseId: null,
      event: { companyId, status: "DRAFT" },
    },
    select: { courseInfo: true, eventId: true },
  });
  if (!session) throw new Error("Session not found");

  const merged = {
    ...((session.courseInfo as Record<string, unknown>) ?? {}),
    ...parsed,
  };
  await prisma.eventSession.update({
    where: { id: sessionId },
    data: {
      courseInfo: merged as Prisma.InputJsonValue,
      ...(extraColumns ? extraColumns(parsed) : {}),
    },
  });
  return { parsed, eventId: session.eventId };
}

/**
 * Add a session: create a DRAFT inline EventSession (courseId null, next
 * position) and route into its first sub-step (Course Information). Multiple
 * null-courseId rows are allowed (@@unique([eventId, courseId]) ignores NULLs).
 */
export async function addInlineSession(formData: FormData) {
  const eventId = String(formData.get("eventId") ?? "");
  if (!eventId) throw new Error("Missing eventId");
  const companyId = await customerCompanyId();

  const event = await prisma.event.findFirst({
    where: { id: eventId, companyId, status: "DRAFT" },
    select: { id: true, eventType: true },
  });
  if (!event) throw new Error("Event draft not found");
  if (event.eventType !== EventType.SELECTIVE_INLINE) {
    throw new Error("Inline sessions apply only to selective event-only events");
  }

  const count = await prisma.eventSession.count({
    where: { eventId, courseId: null },
  });
  const created = await prisma.eventSession.create({
    data: {
      eventId,
      courseId: null,
      position: count,
      courseInfo: {} as Prisma.InputJsonValue,
    },
    select: { id: true },
  });
  redirect(sessionStep(created.id, "course"));
}

/** Delete an inline session; repack positions and recompute event hours. */
export async function removeInlineSession(formData: FormData) {
  const eventId = String(formData.get("eventId") ?? "");
  const sessionId = String(formData.get("sessionId") ?? "");
  if (!eventId || !sessionId) throw new Error("Missing ids");
  const companyId = await customerCompanyId();

  await prisma.$transaction(async (tx) => {
    const target = await tx.eventSession.findFirst({
      where: {
        id: sessionId,
        eventId,
        courseId: null,
        event: { companyId, status: "DRAFT" },
      },
      select: { id: true },
    });
    if (!target) throw new Error("Session not found");
    await tx.eventSession.delete({ where: { id: sessionId } });

    // Repack positions and recompute the event total from the SAME rowset
    // (select durationHours here so recompute needs no second scan).
    const rest = await tx.eventSession.findMany({
      where: { eventId, courseId: null },
      orderBy: { position: "asc" },
      select: { id: true, durationHours: true },
    });
    await Promise.all(
      rest.map((r, position) =>
        tx.eventSession.update({ where: { id: r.id }, data: { position } }),
      ),
    );
    const total = rest.reduce(
      (sum, s) => sum + (s.durationHours ? Number(s.durationHours) : 0),
      0,
    );
    await tx.event.update({
      where: { id: eventId },
      data: { totalHours: new Prisma.Decimal(total) },
    });
  });

  revalidatePath(SESSIONS_LIST);
  redirect(SESSIONS_LIST);
}

// --- Per-session mini-wizard step savers ---

export async function saveInlineSessionCourse(formData: FormData) {
  const sessionId = String(formData.get("sessionId") ?? "");
  if (!sessionId) throw new Error("Missing sessionId");
  const companyId = await customerCompanyId();

  // Mirror name/durationHours from courseTitle/ceCreditHours (in the same write
  // as the course_info merge) so downstream consumers (quiz assembly, scoring,
  // certificates, list badges) read them unchanged, then recompute the event
  // total from the freshly-persisted durations.
  const { eventId } = await mergeSessionSlice(
    sessionId,
    companyId,
    sessionCourseInfoSchema,
    courseInfoRawFromForm(formData),
    sessionStep(sessionId, "course"),
    (parsed) => ({
      name: String(parsed.courseTitle),
      durationHours: new Prisma.Decimal(parsed.ceCreditHours as number),
    }),
  );
  await recomputeEventTotalHours(prisma, eventId);
  redirect(sessionStep(sessionId, "creator"));
}

export async function saveInlineSessionCreator(formData: FormData) {
  const sessionId = String(formData.get("sessionId") ?? "");
  if (!sessionId) throw new Error("Missing sessionId");
  const companyId = await customerCompanyId();

  const detailedBioHtml = sanitizeRichText(
    String(formData.get("detailedBioHtml") ?? ""),
  );
  if (richTextPlainLength(detailedBioHtml) < 20) {
    redirect(
      `${sessionStep(sessionId, "creator")}?error=validation&detail=${encodeURIComponent(
        "Detailed bio: please write at least 20 characters.",
      )}`,
    );
  }
  await mergeSessionSlice(
    sessionId,
    companyId,
    step2Schema,
    creatorRawFromForm(formData, detailedBioHtml),
    sessionStep(sessionId, "creator"),
  );
  redirect(sessionStep(sessionId, "presenters"));
}

export async function saveInlineSessionPresenters(formData: FormData) {
  const sessionId = String(formData.get("sessionId") ?? "");
  if (!sessionId) throw new Error("Missing sessionId");
  const companyId = await customerCompanyId();

  await mergeSessionSlice(
    sessionId,
    companyId,
    step3Schema,
    presentersRawFromForm(formData),
    sessionStep(sessionId, "presenters"),
  );
  redirect(sessionStep(sessionId, "question"));
}

export async function saveInlineSessionQuestion(formData: FormData) {
  const sessionId = String(formData.get("sessionId") ?? "");
  if (!sessionId) throw new Error("Missing sessionId");
  const companyId = await customerCompanyId();

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
      `${sessionStep(sessionId, "question")}?error=validation&detail=${encodeURIComponent(detail)}`,
    );
  }

  // `question` is a full overwrite (no JSONB merge), so the ownership predicate
  // goes straight on the write — one round-trip, no TOCTOU window.
  const res = await prisma.eventSession.updateMany({
    where: {
      id: sessionId,
      courseId: null,
      event: { companyId, status: "DRAFT" },
    },
    data: { question: result.data as unknown as Prisma.InputJsonValue },
  });
  if (res.count === 0) throw new Error("Session not found");

  revalidatePath(SESSIONS_LIST);
  redirect(SESSIONS_LIST);
}
