"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { Prisma, EventType } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { appBaseUrl } from "@/lib/app-url";
import { rateLimit } from "@/lib/rate-limit";
import { orgStepSchema } from "@/lib/forms/application/schemas";
import { orgRawFromForm } from "@/lib/forms/application/form-mapping";
import { sanitizeEcho } from "@/lib/forms/draft-echo";
import { normalizeFormText } from "@/lib/forms/normalize";
import {
  eventDetailsSchema,
  qualifierSchema,
  eventQuizSchema,
  isInlineSessionComplete,
  mcQuestionSchema,
  attachedCoursesSchema,
  deriveEventType,
  isEventOnly,
  eventCreditCost,
  isInlineFullCourse,
  eventSessionApplicationSchema,
  type EventData,
  type EventSessionApplicationData,
} from "@/lib/forms/event/schemas";
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
  list: "/company/events",
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
  // Both event-only types go straight to the sessions list. Each session there
  // is a full course application: SELECTIVE_INLINE captures it inline on
  // event_sessions (per-session mini-wizard), FULL_EVENT_QUIZ as a full
  // CourseApplication per session.
  if (isEventOnly(type)) return ROUTES.sessions;
  return ROUTES.courses; // FULL_PER_COURSE | SELECTIVE_PER_COURSE
}

/**
 * Append the event id to a wizard URL so every step edits an explicit draft.
 * ALWAYS appended last: lib/events/event-actions.test.ts asserts redirect URLs
 * with unanchored regexes, which keep matching only while eventId is the final
 * query parameter.
 */
function withEventId(route: string, eventId: string): string {
  return `${route}${route.includes("?") ? "&" : "?"}eventId=${eventId}`;
}

/**
 * Resolve which event draft the wizard is editing.
 *
 * With an explicit id (the `?eventId=` the wizard now threads through), verify
 * the caller owns it and it is a DRAFT. Without one, fall back to the company's
 * single in-progress draft, creating one if there is none.
 *
 * The `submittedAt: null` scope on the implicit branch is load-bearing. A
 * revised event is a DRAFT whose credit is already settled, so if "+ New Event"
 * could implicitly resume one, a provider could build an entirely different
 * event on top of a paid row and submit it for free. A revision is reachable
 * only by explicit id.
 *
 * Two implicit candidates means we cannot know which the provider meant, so
 * send them to the list to choose rather than silently editing the wrong one.
 */
export async function ensureEventDraft(explicitId?: string): Promise<string> {
  const companyId = await customerCompanyId();

  if (explicitId) {
    const owned = await prisma.event.findFirst({
      where: { id: explicitId, companyId, status: "DRAFT" },
      select: { id: true },
    });
    if (!owned) redirect(`${ROUTES.list}?error=draft_not_found`);
    return owned.id;
  }

  const drafts = await prisma.event.findMany({
    where: { companyId, status: "DRAFT", submittedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true },
    take: 2,
  });
  if (drafts.length > 1) redirect(`${ROUTES.list}?error=multiple_drafts`);
  if (drafts.length === 1) return drafts[0].id;

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
  /** Non-null once this event's credit has been taken. The review step reads
   *  the SAME value submitEvent charges on, so quote and charge cannot drift. */
  creditChargedAt: Date | null;
  /** Non-null if this draft has been through review before (a revision). */
  submittedAt: Date | null;
  /** Kept through a revision so the provider can see what to fix. */
  reviewerNotes: string | null;
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
      creditChargedAt: true,
      submittedAt: true,
      reviewerNotes: true,
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
    creditChargedAt: row.creditChargedAt,
    submittedAt: row.submittedAt,
    reviewerNotes: row.reviewerNotes,
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
        // Complete = the full event-session application validates (org inherited
        // + course info + creator + presenters + one MC question).
        complete: eventSessionApplicationSchema.safeParse(data).success,
      };
    }),
  };
}

/**
 * Validate a slice and merge it into the draft's eventData (mirrors mergeStep).
 *
 * On failure it persists the RAW slice and redirects with ?error=validation so
 * the step page can re-render what the provider typed and re-derive the
 * messages from it. See the two editing rules in
 * lib/forms/application/merge-step.ts (no transaction, no bare try/catch).
 */
async function mergeEventStep(
  eventId: string,
  schema: z.ZodTypeAny,
  raw: unknown,
  route: string,
): Promise<Record<string, unknown>> {
  const companyId = await customerCompanyId();
  const existing = await prisma.event.findFirst({
    where: { id: eventId, companyId, status: "DRAFT" },
    select: { eventData: true },
  });
  if (!existing) throw new Error("Event draft not found");
  const current = (existing.eventData as Record<string, unknown>) ?? {};

  const result = schema.safeParse(raw);
  if (!result.success) {
    const echo = sanitizeEcho(raw);
    await prisma.event.updateMany({
      where: { id: eventId, companyId, status: "DRAFT" },
      data: { eventData: { ...current, ...echo.value } as Prisma.InputJsonValue },
    });
    redirect(`${route}?error=${echo.truncated ? "too_long" : "validation"}`);
  }
  const parsed = result.data as Record<string, unknown>;
  const merged = {
    ...current,
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

  const org = orgRawFromForm(formData);
  const details = {
    name: normalizeFormText(formData.get("name")),
    eventDate: normalizeFormText(formData.get("eventDate")),
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

export async function saveEventQuiz(formData: FormData) {
  const eventId = String(formData.get("eventId") ?? "");
  if (!eventId) throw new Error("Missing eventId");
  const companyId = await customerCompanyId();

  const quiz = [
    {
      type: "TF" as const,
      question: normalizeFormText(formData.get("q1_question")),
      correctAnswer: (formData.get("q1_correct") === "True" ? "True" : "False") as
        | "True"
        | "False",
    },
    {
      type: "TF" as const,
      question: normalizeFormText(formData.get("q2_question")),
      correctAnswer: (formData.get("q2_correct") === "True" ? "True" : "False") as
        | "True"
        | "False",
    },
    ...[2, 3, 4].map((i) => ({
      type: "MC" as const,
      question: normalizeFormText(formData.get(`q${i + 1}_question`)),
      options: [0, 1, 2, 3].map((j) =>
        normalizeFormText(formData.get(`q${i + 1}_option_${j}`)),
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


export async function saveAttachedCourses(formData: FormData) {
  const eventId = String(formData.get("eventId") ?? "");
  if (!eventId) throw new Error("Missing eventId");
  const companyId = await customerCompanyId();

  const courseIds = formData.getAll("courseIds").map((v) => String(v));
  const parsed = attachedCoursesSchema.safeParse({ courseIds });
  if (!parsed.success) {
    redirect(
        withEventId(
          `${ROUTES.courses}?error=validation&detail=${encodeURIComponent(
          "Select at least one approved course.",
          )}`,
          eventId,
        ),
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
  if (!limited.ok) redirect(withEventId(`${ROUTES.review}?error=rate_limited`, eventId));

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
  //
  // This MUST be a strict parse, not a presence check. Drafts now save
  // tolerantly (mergeEventStep echoes the raw slice back on validation failure
  // so the provider does not lose the screen), so a merely non-empty
  // organizationName or an unvalidated adminEmail can sit in eventData. Without
  // the strict gate that invalid provider data would reach PENDING and land on
  // the accreditation record. Mirrors the per-session gates below.
  const detailsGate = orgStepSchema.merge(eventDetailsSchema).safeParse({
    ...data,
    name: draft.name,
    eventDate: draft.eventDate,
  });
  if (!detailsGate.success) {
    redirect(withEventId(`${ROUTES.details}?error=validation`, eventId));
  }

  // Lightweight inline path (SELECTIVE_INLINE): the event is ONE application
  // whose sessions are Session/Question/Answer rows on event_sessions. Charge
  // one application credit for the whole event (approval mints a single Event
  // ID and no courses) and move the event to PENDING atomically.
  if (type === EventType.SELECTIVE_INLINE) {
    const inline = draft.sessions.filter((s) => s.courseId === null);
    if (inline.length === 0) {
      redirect(
        withEventId(
          `${ROUTES.sessions}?error=validation&detail=${encodeURIComponent(
            "Add at least one session before submitting.",
          )}`,
          eventId,
        ),
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
        withEventId(
          `${ROUTES.sessions}?error=validation&detail=${encodeURIComponent(
            "One of your sessions is incomplete. Check each session's title, hours, and question.",
          )}`,
          eventId,
        ),
      );
    }
    // Drafts save tolerantly, so the strict per-session gate runs here: every
    // session's Course Information and question must fully validate. Keep this
    // separate from wellFormed above; they guard different corruption modes
    // (mirrored columns vs source JSON).
    const infoComplete = inline.every((s) => isInlineSessionComplete(s));
    if (!infoComplete) {
      redirect(
        withEventId(
          `${ROUTES.sessions}?error=validation&detail=${encodeURIComponent(
            "Each session needs its full course information before you can submit.",
          )}`,
          eventId,
        ),
      );
    }
    // Revising after a review decision is free: the credit for this submission
    // line was settled the first time (client decision 2026-07-29). Only stamp
    // when the cost is non-zero, or a free per-course event could be rejected,
    // switched to an event-only type, and resubmitted as a paid type for free.
    const cost = eventCreditCost(type);
    const chargeable = draft.creditChargedAt == null ? cost : 0;
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
    if ((bal?.applicationCredits ?? 0) < chargeable) {
      redirect(withEventId(`${ROUTES.review}?error=credits`, eventId));
    }

    await prisma.$transaction(async (tx) => {
      // The row lock stays unconditional even when cost is 0: it also serializes
      // the DRAFT -> PENDING transition below.
      await tx.$executeRaw`select id from public.companies where id = ${companyId}::uuid for update`;
      const company = await tx.company.findUniqueOrThrow({
        where: { id: companyId },
        select: { applicationCredits: true },
      });
      if (company.applicationCredits < chargeable) {
        throw new Error("Not enough application credits");
      }
      if (chargeable > 0) {
        await tx.company.update({
          where: { id: companyId },
          data: { applicationCredits: { decrement: chargeable } },
        });
      }
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
          // Stamped in the same transaction as the decrement, so a later
          // revision of this same event is free.
          ...(chargeable > 0 ? { creditChargedAt: submittedAt } : {}),
        },
      });
      if (updated.count !== 1) throw new Error("Event was already submitted");
    });
  } else if (inlineFull) {
    // Event-only full-course path (FULL_EVENT_QUIZ): each session is a full
    // course application. Validate every one, charge one application credit for
    // the whole event, and move them + the event to PENDING atomically.
    // Per-course types stay free (their courses were already paid).
    const apps = draft.sessionApplications;
    if (apps.length === 0) {
      redirect(
        withEventId(
          `${ROUTES.sessions}?error=validation&detail=${encodeURIComponent(
            "Add at least one session before submitting.",
          )}`,
          eventId,
        ),
      );
    }
    // Validate each session's full application; on the first miss, jump into it.
    const parsedSessions = apps.map((a) => ({
      id: a.id,
      parsed: eventSessionApplicationSchema.safeParse(a.applicationData),
    }));
    const bad = parsedSessions.find((s) => !s.parsed.success);
    if (bad) {
      // "incomplete", not "validation": the missing field may be on any of this
      // session's four steps, so the Course step we land on would re-derive
      // step1Schema and correctly find nothing wrong.
      redirect(withEventId(`${ROUTES.sessions}/${bad.id}/course?error=incomplete`, eventId));
    }
    const sessions = parsedSessions.map((s) => ({
      id: s.id,
      data: (s.parsed as { success: true; data: EventSessionApplicationData }).data,
    }));
    // Revising after a review decision is free: the credit for this submission
    // line was settled the first time (client decision 2026-07-29). Only stamp
    // when the cost is non-zero, or a free per-course event could be rejected,
    // switched to an event-only type, and resubmitted as a paid type for free.
    const cost = eventCreditCost(type);
    const chargeable = draft.creditChargedAt == null ? cost : 0;
    const totalHours = sessions.reduce((sum, s) => sum + s.data.ceCreditHours, 0);
    const submittedAt = new Date();

    // Pre-check for a friendly redirect (the locked re-check below is the guard).
    const bal = await prisma.company.findUnique({
      where: { id: companyId },
      select: { applicationCredits: true },
    });
    if ((bal?.applicationCredits ?? 0) < chargeable) {
      redirect(withEventId(`${ROUTES.review}?error=credits`, eventId));
    }

    await prisma.$transaction(async (tx) => {
      // The row lock stays unconditional even when cost is 0: it also serializes
      // the DRAFT -> PENDING transition below.
      await tx.$executeRaw`select id from public.companies where id = ${companyId}::uuid for update`;
      const company = await tx.company.findUniqueOrThrow({
        where: { id: companyId },
        select: { applicationCredits: true },
      });
      if (company.applicationCredits < chargeable) {
        throw new Error("Not enough application credits");
      }
      if (chargeable > 0) {
        await tx.company.update({
          where: { id: companyId },
          data: { applicationCredits: { decrement: chargeable } },
        });
      }

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
          // Stamped in the same transaction as the decrement, so a later
          // revision of this same event is free.
          ...(chargeable > 0 ? { creditChargedAt: submittedAt } : {}),
        },
      });
      if (updated.count !== 1) throw new Error("Event was already submitted");
    });
  } else {
    // PER_COURSE types: at least one attached course; no credit consumed.
    if (!draft.sessions.some((s) => s.courseId !== null)) {
      redirect(
        withEventId(
          `${ROUTES.courses}?error=validation&detail=${encodeURIComponent(
            "Attach at least one approved course before submitting.",
          )}`,
          eventId,
        ),
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
      reviewUrl: `${appBaseUrl()}/reviewer/events/${eventId}`,
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
