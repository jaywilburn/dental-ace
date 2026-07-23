"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { Prisma, EventType } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import {
  orgStepSchema,
  step2Schema,
  step3Schema,
} from "@/lib/forms/application/schemas";
import {
  eventDetailsSchema,
  qualifierSchema,
  eventQuizSchema,
  eventStep1Schema,
  inlineSessionsDraftSchema,
  isInlineSessionComplete,
  mcQuestionSchema,
  attachedCoursesSchema,
  deriveEventType,
  eventApplicationStepRoute,
  isEventOnly,
  isInlineFullCourse,
  nextEventApplicationStep,
  type EventData,
  type InlineSessionDraft,
} from "@/lib/forms/event/schemas";
import {
  applicationDataSchema,
  type ApplicationData,
} from "@/lib/forms/application/schemas";
import {
  courseInfoRawFromForm,
  creatorRawFromForm,
  presentersRawFromForm,
} from "@/lib/forms/application/form-mapping";
import {
  sanitizeRichText,
  richTextPlainLength,
} from "@/lib/forms/application/rich-text";
import { sendEmail } from "@/lib/email/send";
import ApplicationSubmittedEmail from "@/emails/application-submitted";
import {
  getReviewerNotificationRecipients,
  reviewerNotificationToAddress,
} from "@/lib/reviewer/notify";

/*
  Server actions for the event-submission wizard. Mirrors the course application
  flow (lib/forms/application/actions.ts): per-step validate + merge into
  Event.eventData; submit consumes a credit (event-level types only) and moves
  DRAFT -> PENDING for the reviewer queue.
*/

const ROUTES = {
  details: "/company/events/new",
  qualifiers: "/company/events/new/qualifiers",
  quiz: "/company/events/new/quiz",
  sessions: "/company/events/new/sessions",
  courses: "/company/events/new/courses",
  review: "/company/events/new/review",
} as const;

async function customerCompanyId(): Promise<string> {
  const user = await getCurrentUser();
  if (!user || !user.companyId) redirect("/login");
  return user.companyId;
}

/** The wizard step a given event type routes to after the qualifiers step. */
function typeStepRoute(type: EventType): string {
  // SELECTIVE_INLINE first captures the event-level application content
  // (Course Information -> Creator -> Presenters, entered once per event),
  // then its lightweight Session/Question/Answer grid. FULL_EVENT_QUIZ goes
  // straight to the sessions list (each session there is a full application).
  if (type === EventType.SELECTIVE_INLINE) {
    return eventApplicationStepRoute("course");
  }
  if (isEventOnly(type)) return ROUTES.sessions;
  return ROUTES.courses; // FULL_PER_COURSE | SELECTIVE_PER_COURSE
}

export async function ensureEventDraft(): Promise<string> {
  const companyId = await customerCompanyId();
  const existing = await prisma.event.findFirst({
    where: { companyId, status: "DRAFT" },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await prisma.event.create({
    data: { companyId, name: "", eventDate: "", status: "DRAFT" },
    select: { id: true },
  });
  return created.id;
}

export type EventDraft = {
  id: string;
  name: string;
  eventDate: string;
  eventType: EventType | null;
  totalHours: number | null;
  data: Partial<EventData>;
  sessions: Array<{
    id: string;
    courseId: string | null;
    name: string | null;
    durationHours: number | null;
    position: number;
    // Inline MC question (SELECTIVE_INLINE lightweight sessions); parse with
    // mcQuestionSchema at the call site. Null for course-backed sessions.
    question: unknown;
    // Per-session Course Information (step1 shape); parse with
    // sessionCourseInfoReadSchema at the call site. Null for course-backed
    // sessions and rows saved before July 2026.
    courseInfo: unknown;
    // Course info + question both pass their strict schemas (submit gate).
    // Course-backed sessions report true (their info lives on the course).
    complete: boolean;
  }>;
  // Inline event-scoped session applications (event-only full-course path).
  sessionApplications: Array<{
    id: string;
    position: number;
    courseTitle: string;
    ceHours: number | null;
    complete: boolean;
  }>;
};

export async function getEventDraft(eventId: string): Promise<EventDraft | null> {
  const companyId = await customerCompanyId();
  const row = await prisma.event.findFirst({
    where: { id: eventId, companyId, status: "DRAFT" },
    select: {
      id: true,
      name: true,
      eventDate: true,
      eventType: true,
      totalHours: true,
      eventData: true,
      sessions: {
        orderBy: { position: "asc" },
        select: {
          id: true,
          courseId: true,
          name: true,
          durationHours: true,
          position: true,
          question: true,
          courseInfo: true,
        },
      },
      sessionApplications: {
        orderBy: { sessionPosition: "asc" },
        select: { id: true, sessionPosition: true, applicationData: true },
      },
    },
  });
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    eventDate: row.eventDate,
    eventType: row.eventType,
    totalHours: row.totalHours ? Number(row.totalHours) : null,
    data: (row.eventData as Partial<EventData> | null) ?? {},
    sessions: row.sessions.map((s) => ({
      ...s,
      durationHours: s.durationHours ? Number(s.durationHours) : null,
      complete: s.courseId !== null || isInlineSessionComplete(s),
    })),
    sessionApplications: row.sessionApplications.map((a) => {
      const data = (a.applicationData as Record<string, unknown> | null) ?? {};
      return {
        id: a.id,
        position: a.sessionPosition ?? 0,
        courseTitle:
          typeof data.courseTitle === "string" && data.courseTitle
            ? data.courseTitle
            : "Untitled session",
        ceHours:
          typeof data.ceCreditHours === "number" ? data.ceCreditHours : null,
        // Complete = the full application validates (org inherited + all steps).
        complete: applicationDataSchema.safeParse(data).success,
      };
    }),
  };
}

/** Validate a slice and merge it into the draft's eventData (mirrors mergeStep). */
async function mergeEventStep(
  eventId: string,
  schema: z.ZodTypeAny,
  raw: unknown,
  route: string,
): Promise<Record<string, unknown>> {
  const companyId = await customerCompanyId();
  const result = schema.safeParse(raw);
  if (!result.success) {
    const issue = result.error.issues[0];
    const detail = issue
      ? `${String(issue.path[0] ?? "Form")}: ${issue.message}`.slice(0, 200)
      : "Please check the highlighted fields.";
    redirect(`${route}?error=validation&detail=${encodeURIComponent(detail)}`);
  }
  const parsed = result.data as Record<string, unknown>;
  const existing = await prisma.event.findFirst({
    where: { id: eventId, companyId, status: "DRAFT" },
    select: { eventData: true },
  });
  if (!existing) throw new Error("Event draft not found");
  const merged = {
    ...((existing.eventData as Record<string, unknown>) ?? {}),
    ...parsed,
  };
  await prisma.event.update({
    where: { id: eventId },
    data: { eventData: merged as Prisma.InputJsonValue },
  });
  return parsed;
}

export async function saveEventDetails(formData: FormData) {
  const eventId = String(formData.get("eventId") ?? "");
  if (!eventId) throw new Error("Missing eventId");
  const companyId = await customerCompanyId();

  const org = {
    organizationName: String(formData.get("organizationName") ?? ""),
    organizationAddress: String(formData.get("organizationAddress") ?? ""),
    adminName: String(formData.get("adminName") ?? ""),
    adminEmail: String(formData.get("adminEmail") ?? ""),
    adminPhone: String(formData.get("adminPhone") ?? ""),
  };
  const details = {
    name: String(formData.get("name") ?? ""),
    eventDate: String(formData.get("eventDate") ?? ""),
  };

  await mergeEventStep(
    eventId,
    orgStepSchema.merge(eventDetailsSchema),
    { ...org, ...details },
    ROUTES.details,
  );
  // name + eventDate are real columns on Event (used by the list + assets).
  await prisma.event.updateMany({
    where: { id: eventId, companyId, status: "DRAFT" },
    data: { name: details.name, eventDate: details.eventDate },
  });
  redirect(ROUTES.qualifiers);
}

export async function saveQualifiers(formData: FormData) {
  const eventId = String(formData.get("eventId") ?? "");
  if (!eventId) throw new Error("Missing eventId");
  const companyId = await customerCompanyId();

  const raw = {
    coverage: String(formData.get("coverage") ?? ""),
    reuse: String(formData.get("reuse") ?? ""),
  };
  const parsed = await mergeEventStep(
    eventId,
    qualifierSchema,
    raw,
    ROUTES.qualifiers,
  );
  const type = deriveEventType(
    parsed.coverage as "FULL" | "SELECTIVE",
    parsed.reuse as "EVENT_ONLY" | "PER_COURSE",
  );
  // Setting the type column re-routes the wizard. If the type CHANGED, clear any
  // sessions from a prior branch so they don't leak across types.
  await prisma.$transaction(async (tx) => {
    const current = await tx.event.findFirst({
      where: { id: eventId, companyId, status: "DRAFT" },
      select: { eventType: true, eventData: true },
    });
    if (current && current.eventType !== type) {
      await tx.eventSession.deleteMany({ where: { eventId } });
      // Also drop inline session applications from a prior event-only branch so
      // they don't linger (and keep charging) after switching away.
      await tx.courseApplication.deleteMany({
        where: { eventId, status: "DRAFT" },
      });
      // Drop the event-level application content (SELECTIVE_INLINE) so it does
      // not linger in eventData after switching to another type.
      const ed = (current.eventData as Record<string, unknown> | null) ?? {};
      if ("eventApplication" in ed) {
        delete ed.eventApplication;
        await tx.event.update({
          where: { id: eventId },
          data: { eventData: ed as Prisma.InputJsonValue },
        });
      }
    }
    await tx.event.updateMany({
      where: { id: eventId, companyId, status: "DRAFT" },
      data: { eventType: type },
    });
  });
  redirect(typeStepRoute(type));
}

/*
  SELECTIVE_INLINE event-level application steps (Course Information -> Creator
  -> Presenters). Entered ONCE per event, validated with the same step schemas
  as the standalone application wizard, and persisted under
  eventData.eventApplication — NOT as an event-level CourseApplication row
  (approveEvent keys the accreditation model on pending session applications).
*/

/**
 * Validate a course-application step slice and merge it into
 * eventData.eventApplication. Mirrors mergeEventStep, one level down.
 */
async function mergeEventApplicationStep(
  eventId: string,
  schema: z.ZodTypeAny,
  raw: unknown,
  route: string,
): Promise<void> {
  const companyId = await customerCompanyId();
  const result = schema.safeParse(raw);
  if (!result.success) {
    const issue = result.error.issues[0];
    const detail = issue
      ? `${String(issue.path[0] ?? "Form")}: ${issue.message}`.slice(0, 200)
      : "Please check the highlighted fields.";
    redirect(`${route}?error=validation&detail=${encodeURIComponent(detail)}`);
  }
  const existing = await prisma.event.findFirst({
    where: { id: eventId, companyId, status: "DRAFT" },
    select: { eventType: true, eventData: true },
  });
  if (!existing) throw new Error("Event draft not found");
  if (existing.eventType !== EventType.SELECTIVE_INLINE) {
    throw new Error(
      "The event-level application applies only to selective event-only events",
    );
  }
  const data = (existing.eventData as Record<string, unknown>) ?? {};
  const app = (data.eventApplication as Record<string, unknown> | undefined) ?? {};
  const merged = {
    ...data,
    eventApplication: { ...app, ...(result.data as Record<string, unknown>) },
  };
  await prisma.event.update({
    where: { id: eventId },
    data: { eventData: merged as Prisma.InputJsonValue },
  });
}

export async function saveEventCourseInfo(formData: FormData) {
  const eventId = String(formData.get("eventId") ?? "");
  if (!eventId) throw new Error("Missing eventId");
  await mergeEventApplicationStep(
    eventId,
    // Event-level variant: the outline field is the "Event Outline" and gets
    // the high EVENT_OUTLINE_MAX ceiling instead of the per-course 20k cap.
    eventStep1Schema,
    courseInfoRawFromForm(formData),
    eventApplicationStepRoute("course"),
  );
  redirect(eventApplicationStepRoute("creator"));
}

export async function saveEventCreator(formData: FormData) {
  const eventId = String(formData.get("eventId") ?? "");
  if (!eventId) throw new Error("Missing eventId");
  const detailedBioHtml = sanitizeRichText(
    String(formData.get("detailedBioHtml") ?? ""),
  );
  if (richTextPlainLength(detailedBioHtml) < 20) {
    redirect(
      `${eventApplicationStepRoute("creator")}?error=validation&detail=${encodeURIComponent(
        "Detailed bio: please write at least 20 characters.",
      )}`,
    );
  }
  await mergeEventApplicationStep(
    eventId,
    step2Schema,
    creatorRawFromForm(formData, detailedBioHtml),
    eventApplicationStepRoute("creator"),
  );
  redirect(eventApplicationStepRoute("presenters"));
}

export async function saveEventPresenters(formData: FormData) {
  const eventId = String(formData.get("eventId") ?? "");
  if (!eventId) throw new Error("Missing eventId");
  await mergeEventApplicationStep(
    eventId,
    step3Schema,
    presentersRawFromForm(formData),
    eventApplicationStepRoute("presenters"),
  );
  redirect(ROUTES.sessions);
}

export async function saveEventQuiz(formData: FormData) {
  const eventId = String(formData.get("eventId") ?? "");
  if (!eventId) throw new Error("Missing eventId");
  const companyId = await customerCompanyId();

  const quiz = [
    {
      type: "TF" as const,
      question: String(formData.get("q1_question") ?? ""),
      correctAnswer: (formData.get("q1_correct") === "True" ? "True" : "False") as
        | "True"
        | "False",
    },
    {
      type: "TF" as const,
      question: String(formData.get("q2_question") ?? ""),
      correctAnswer: (formData.get("q2_correct") === "True" ? "True" : "False") as
        | "True"
        | "False",
    },
    ...[2, 3, 4].map((i) => ({
      type: "MC" as const,
      question: String(formData.get(`q${i + 1}_question`) ?? ""),
      options: [0, 1, 2, 3].map((j) =>
        String(formData.get(`q${i + 1}_option_${j}`) ?? ""),
      ),
      correctIndex: Number(formData.get(`q${i + 1}_correct`) ?? 0),
    })),
  ];
  const totalHours = Number(formData.get("totalHours") ?? 0);

  const parsed = await mergeEventStep(
    eventId,
    eventQuizSchema,
    { totalHours, quiz },
    ROUTES.quiz,
  );
  await prisma.event.updateMany({
    where: { id: eventId, companyId, status: "DRAFT" },
    data: { totalHours: new Prisma.Decimal(parsed.totalHours as number) },
  });
  redirect(ROUTES.review);
}

export async function saveInlineSessions(formData: FormData) {
  const eventId = String(formData.get("eventId") ?? "");
  if (!eventId) throw new Error("Missing eventId");
  const companyId = await customerCompanyId();

  // Fields per session: s{i}_courseTitle ... s{i}_courseOutline (the Course
  // Information group, mapped by courseInfoRawFromForm with the s{i}_ prefix)
  // plus s{i}_question, s{i}_option_{0..3}, s{i}_correct.
  const count = Number(formData.get("sessionCount") ?? 0);
  const sessions = Array.from({ length: count }, (_, i) => ({
    courseInfo: courseInfoRawFromForm(formData, `s${i}_`),
    question: {
      type: "MC" as const,
      question: String(formData.get(`s${i}_question`) ?? ""),
      options: [0, 1, 2, 3].map((j) =>
        String(formData.get(`s${i}_option_${j}`) ?? ""),
      ),
      correctIndex: Number(formData.get(`s${i}_correct`) ?? 0),
    },
  }));

  // Tolerant draft save: blank fields drop out, only max caps enforced here.
  // The strict per-session gate runs at submit (isInlineSessionComplete), so
  // one missing field never loses the rest of a typed-out session.
  const parsed = inlineSessionsDraftSchema.safeParse({ sessions });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const detail = issue
      ? `Session ${Number(issue.path[1] ?? 0) + 1}: ${issue.message}`.slice(0, 200)
      : "Please check each session.";
    redirect(`${ROUTES.sessions}?error=validation&detail=${encodeURIComponent(detail)}`);
  }
  const valid: InlineSessionDraft[] = parsed.data.sessions;
  const total = valid.reduce(
    (sum, s) => sum + (s.courseInfo.ceCreditHours ?? 0),
    0,
  );
  const allComplete = valid.every((s) => isInlineSessionComplete(s));

  // Replace the event's inline sessions; recompute totalHours. name and
  // durationHours mirror courseTitle/ceCreditHours so downstream consumers
  // (quiz assembly, scoring, certificates) keep reading them unchanged.
  await prisma.$transaction(async (tx) => {
    const owned = await tx.event.findFirst({
      where: { id: eventId, companyId, status: "DRAFT" },
      select: { id: true, eventType: true },
    });
    if (!owned) throw new Error("Event draft not found");
    // Only the lightweight inline type stores Session/Question/Answer rows;
    // FULL_EVENT_QUIZ sessions are full course applications (session-actions).
    if (owned.eventType !== EventType.SELECTIVE_INLINE) {
      throw new Error("Inline sessions apply only to selective event-only events");
    }
    await tx.eventSession.deleteMany({ where: { eventId } });
    await tx.eventSession.createMany({
      data: valid.map((s, position) => ({
        eventId,
        courseId: null,
        position,
        name: s.courseInfo.courseTitle ?? null,
        durationHours:
          s.courseInfo.ceCreditHours != null
            ? new Prisma.Decimal(s.courseInfo.ceCreditHours)
            : null,
        question: s.question as unknown as Prisma.InputJsonValue,
        courseInfo: s.courseInfo as Prisma.InputJsonValue,
      })),
    });
    await tx.event.update({
      where: { id: eventId },
      data: { totalHours: new Prisma.Decimal(total) },
    });
  });
  if (allComplete) redirect(ROUTES.review);
  redirect(`${ROUTES.sessions}?saved=1`);
}

export async function saveAttachedCourses(formData: FormData) {
  const eventId = String(formData.get("eventId") ?? "");
  if (!eventId) throw new Error("Missing eventId");
  const companyId = await customerCompanyId();

  const courseIds = formData.getAll("courseIds").map((v) => String(v));
  const parsed = attachedCoursesSchema.safeParse({ courseIds });
  if (!parsed.success) {
    redirect(
      `${ROUTES.courses}?error=validation&detail=${encodeURIComponent(
        "Select at least one approved course.",
      )}`,
    );
  }

  // Ownership: every course must belong to the caller's company.
  const owned = await prisma.accreditedCourse.findMany({
    where: { id: { in: parsed.data.courseIds }, companyId },
    select: { id: true, application: { select: { ceHours: true } } },
  });
  if (owned.length !== parsed.data.courseIds.length) {
    throw new Error("One or more courses do not belong to your company");
  }
  const total = owned.reduce(
    (sum, c) => sum + (c.application.ceHours ? Number(c.application.ceHours) : 0),
    0,
  );

  await prisma.$transaction(async (tx) => {
    await tx.eventSession.deleteMany({ where: { eventId } });
    await tx.eventSession.createMany({
      data: parsed.data.courseIds.map((courseId, position) => ({
        eventId,
        courseId,
        position,
      })),
    });
    await tx.event.update({
      where: { id: eventId },
      data: { totalHours: new Prisma.Decimal(total) },
    });
  });
  redirect(ROUTES.review);
}

/**
 * Final submit. Validates per event type, consumes 1 application credit for
 * event-level types (Opt 1 & 3), moves DRAFT -> PENDING, and notifies reviewers.
 */
export async function submitEvent(formData: FormData) {
  const eventId = String(formData.get("eventId") ?? "");
  const companyId = await customerCompanyId();

  const ip = ((await headers()).get("x-forwarded-for") ?? "unknown")
    .split(",")[0]
    .trim();
  const limited = rateLimit(`submit-event:${ip}:${companyId}`, {
    limit: 20,
    windowMs: 60 * 60 * 1000,
  });
  if (!limited.ok) redirect(`${ROUTES.review}?error=rate_limited`);

  const draft = await prisma.event.findFirst({
    where: { id: eventId, companyId, status: "DRAFT" },
    include: {
      company: { select: { name: true } },
      sessions: {
        orderBy: { position: "asc" },
        select: {
          id: true,
          courseId: true,
          name: true,
          durationHours: true,
          question: true,
          courseInfo: true,
        },
      },
      sessionApplications: {
        orderBy: { sessionPosition: "asc" },
        select: { id: true, applicationData: true },
      },
    },
  });
  if (!draft) throw new Error("Event draft not found");
  if (!draft.eventType) redirect(ROUTES.qualifiers);
  const type = draft.eventType;
  const data = (draft.eventData as Partial<EventData>) ?? {};
  const inlineFull = isInlineFullCourse(type);

  // Shared prerequisite: event name/date + org captured at the details step.
  if (!draft.name || !draft.eventDate || !data.organizationName) {
    redirect(
      `${ROUTES.details}?error=validation&detail=${encodeURIComponent(
        "Some required details are missing. Finish this step.",
      )}`,
    );
  }

  // Lightweight inline path (SELECTIVE_INLINE): the event is ONE application
  // whose sessions are Session/Question/Answer rows on event_sessions. Charge
  // one application credit per session (the same per-session rate as the
  // full-course path) and move the event to PENDING atomically.
  if (type === EventType.SELECTIVE_INLINE) {
    // The event-level application content (Course Information + Creator +
    // Presenters, entered once per event) must be complete before review.
    const appStep = nextEventApplicationStep(data.eventApplication);
    if (appStep) {
      redirect(
        `${eventApplicationStepRoute(appStep)}?error=validation&detail=${encodeURIComponent(
          "Finish this step before submitting your event.",
        )}`,
      );
    }
    const inline = draft.sessions.filter((s) => s.courseId === null);
    if (inline.length === 0) {
      redirect(
        `${ROUTES.sessions}?error=validation&detail=${encodeURIComponent(
          "Add at least one session before submitting.",
        )}`,
      );
    }
    // Defense in depth: every row was validated at save, but re-check the shape
    // before charging credits.
    const wellFormed = inline.every(
      (s) =>
        s.name &&
        s.durationHours !== null &&
        mcQuestionSchema.safeParse(s.question).success,
    );
    if (!wellFormed) {
      redirect(
        `${ROUTES.sessions}?error=validation&detail=${encodeURIComponent(
          "One of your sessions is incomplete. Check each session's title, hours, and question.",
        )}`,
      );
    }
    // Drafts save tolerantly, so the strict per-session gate runs here: every
    // session's Course Information and question must fully validate. Keep this
    // separate from wellFormed above; they guard different corruption modes
    // (mirrored columns vs source JSON).
    const infoComplete = inline.every((s) => isInlineSessionComplete(s));
    if (!infoComplete) {
      redirect(
        `${ROUTES.sessions}?error=validation&detail=${encodeURIComponent(
          "Each session needs its full course information before you can submit.",
        )}`,
      );
    }
    const n = inline.length;
    const totalHours = inline.reduce(
      (sum, s) => sum + (s.durationHours ? Number(s.durationHours) : 0),
      0,
    );
    const submittedAt = new Date();

    // Pre-check for a friendly redirect (the locked re-check below is the guard).
    const bal = await prisma.company.findUnique({
      where: { id: companyId },
      select: { applicationCredits: true },
    });
    if ((bal?.applicationCredits ?? 0) < n) {
      redirect(`${ROUTES.review}?error=credits`);
    }

    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`select id from public.companies where id = ${companyId}::uuid for update`;
      const company = await tx.company.findUniqueOrThrow({
        where: { id: companyId },
        select: { applicationCredits: true },
      });
      if (company.applicationCredits < n) {
        throw new Error("Not enough application credits");
      }
      await tx.company.update({
        where: { id: companyId },
        data: { applicationCredits: { decrement: n } },
      });
      // Drop any stale DRAFT session applications left behind by the retired
      // full-course SELECTIVE_INLINE flow so they cannot linger after submit.
      await tx.courseApplication.deleteMany({
        where: { eventId, companyId, status: "DRAFT" },
      });
      const updated = await tx.event.updateMany({
        where: { id: eventId, companyId, status: "DRAFT" },
        data: {
          status: "PENDING",
          submittedAt,
          totalHours: new Prisma.Decimal(totalHours),
        },
      });
      if (updated.count !== 1) throw new Error("Event was already submitted");
    });
  } else if (inlineFull) {
    // Event-only full-course path (FULL_EVENT_QUIZ): each session is a full
    // course application. Validate every one, charge one application credit per
    // session, and move them + the event to PENDING atomically. Per-course
    // types stay free (their courses were already paid).
    const apps = draft.sessionApplications;
    if (apps.length === 0) {
      redirect(
        `${ROUTES.sessions}?error=validation&detail=${encodeURIComponent(
          "Add at least one session before submitting.",
        )}`,
      );
    }
    // Validate each session's full application; on the first miss, jump into it.
    const parsedSessions = apps.map((a) => ({
      id: a.id,
      parsed: applicationDataSchema.safeParse(a.applicationData),
    }));
    const bad = parsedSessions.find((s) => !s.parsed.success);
    if (bad) {
      redirect(
        `${ROUTES.sessions}/${bad.id}/course?error=validation&detail=${encodeURIComponent(
          "This session is missing required fields. Finish each step and save.",
        )}`,
      );
    }
    const sessions = parsedSessions.map((s) => ({
      id: s.id,
      data: (s.parsed as { success: true; data: ApplicationData }).data,
    }));
    const n = sessions.length;
    const totalHours = sessions.reduce((sum, s) => sum + s.data.ceCreditHours, 0);
    const submittedAt = new Date();

    // Pre-check for a friendly redirect (the locked re-check below is the guard).
    const bal = await prisma.company.findUnique({
      where: { id: companyId },
      select: { applicationCredits: true },
    });
    if ((bal?.applicationCredits ?? 0) < n) {
      redirect(`${ROUTES.review}?error=credits`);
    }

    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`select id from public.companies where id = ${companyId}::uuid for update`;
      const company = await tx.company.findUniqueOrThrow({
        where: { id: companyId },
        select: { applicationCredits: true },
      });
      if (company.applicationCredits < n) {
        throw new Error("Not enough application credits");
      }
      await tx.company.update({
        where: { id: companyId },
        data: { applicationCredits: { decrement: n } },
      });

      // Flip each session application DRAFT -> PENDING, mirroring the columns the
      // reviewer queue + accreditation read (as submitApplication does).
      for (const s of sessions) {
        const moved = await tx.courseApplication.updateMany({
          where: { id: s.id, companyId, eventId, status: "DRAFT" },
          data: {
            status: "PENDING",
            courseTitle: s.data.courseTitle,
            ceHours: s.data.ceCreditHours,
            courseType: s.data.subjectMatter,
            deliveryMethod: s.data.deliveryFormat,
            submittedAt,
          },
        });
        if (moved.count !== 1) throw new Error("A session was already submitted");
      }

      const updated = await tx.event.updateMany({
        where: { id: eventId, companyId, status: "DRAFT" },
        data: {
          status: "PENDING",
          submittedAt,
          totalHours: new Prisma.Decimal(totalHours),
        },
      });
      if (updated.count !== 1) throw new Error("Event was already submitted");
    });
  } else {
    // PER_COURSE types: at least one attached course; no credit consumed.
    if (!draft.sessions.some((s) => s.courseId !== null)) {
      redirect(
        `${ROUTES.courses}?error=validation&detail=${encodeURIComponent(
          "Attach at least one approved course before submitting.",
        )}`,
      );
    }
    const submittedAt = new Date();
    await prisma.$transaction(async (tx) => {
      const updated = await tx.event.updateMany({
        where: { id: eventId, companyId, status: "DRAFT" },
        data: { status: "PENDING", submittedAt },
      });
      if (updated.count !== 1) throw new Error("Event was already submitted");
    });
  }

  const submittedAt = new Date();

  // Reviewer notification (reuses the application-submitted template). Notifies
  // all active Reviewer + Admin accounts (BCC'd) plus the env fallback list.
  const reviewerEmails = await getReviewerNotificationRecipients();
  if (reviewerEmails.length > 0) {
    const props = {
      recipientName: "AADB Reviewer",
      companyName: draft.company.name,
      courseTitle: `Event: ${draft.name}`,
      ceHours: draft.totalHours ? Number(draft.totalHours) : 0,
      deliveryFormat: "Live Event",
      submittedAt: submittedAt.toLocaleString(),
      reviewUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/reviewer/events/${eventId}`,
    };
    try {
      await sendEmail({
        to: reviewerNotificationToAddress(),
        bcc: reviewerEmails,
        subject: ApplicationSubmittedEmail.subject(props),
        react: ApplicationSubmittedEmail(props),
      });
    } catch (err) {
      console.error("[submitEvent] reviewer email failed", err);
    }
  }

  revalidatePath("/company/events");
  redirect("/company/events?just=submitted");
}
