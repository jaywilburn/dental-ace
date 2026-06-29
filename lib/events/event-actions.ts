"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { Prisma, EventType } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { orgStepSchema } from "@/lib/forms/application/schemas";
import {
  eventDetailsSchema,
  qualifierSchema,
  eventQuizSchema,
  inlineSessionsSchema,
  attachedCoursesSchema,
  deriveEventType,
  isEventOnly,
  type EventData,
  type InlineSession,
} from "@/lib/forms/event/schemas";
import { sendEmail } from "@/lib/email/send";
import ApplicationSubmittedEmail from "@/emails/application-submitted";

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
  if (type === EventType.FULL_EVENT_QUIZ) return ROUTES.quiz;
  if (type === EventType.SELECTIVE_INLINE) return ROUTES.sessions;
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
        },
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
    })),
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
      select: { eventType: true },
    });
    if (current && current.eventType !== type) {
      await tx.eventSession.deleteMany({ where: { eventId } });
    }
    await tx.event.updateMany({
      where: { id: eventId, companyId, status: "DRAFT" },
      data: { eventType: type },
    });
  });
  redirect(typeStepRoute(type));
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

  // Fields: s{i}_name, s{i}_duration, s{i}_question, s{i}_option_{0..3}, s{i}_correct.
  const count = Number(formData.get("sessionCount") ?? 0);
  const sessions = Array.from({ length: count }, (_, i) => ({
    name: String(formData.get(`s${i}_name`) ?? ""),
    durationHours: Number(formData.get(`s${i}_duration`) ?? 0),
    question: {
      type: "MC" as const,
      question: String(formData.get(`s${i}_question`) ?? ""),
      options: [0, 1, 2, 3].map((j) =>
        String(formData.get(`s${i}_option_${j}`) ?? ""),
      ),
      correctIndex: Number(formData.get(`s${i}_correct`) ?? 0),
    },
  }));

  const parsed = inlineSessionsSchema.safeParse({ sessions });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const detail = issue
      ? `Session ${Number(issue.path[1] ?? 0) + 1}: ${issue.message}`.slice(0, 200)
      : "Please check each session.";
    redirect(`${ROUTES.sessions}?error=validation&detail=${encodeURIComponent(detail)}`);
  }
  const valid: InlineSession[] = parsed.data.sessions;
  const total = valid.reduce((sum, s) => sum + s.durationHours, 0);

  // Replace the event's inline sessions; recompute totalHours.
  await prisma.$transaction(async (tx) => {
    const owned = await tx.event.findFirst({
      where: { id: eventId, companyId, status: "DRAFT" },
      select: { id: true },
    });
    if (!owned) throw new Error("Event draft not found");
    await tx.eventSession.deleteMany({ where: { eventId } });
    await tx.eventSession.createMany({
      data: valid.map((s, position) => ({
        eventId,
        courseId: null,
        position,
        name: s.name,
        durationHours: new Prisma.Decimal(s.durationHours),
        question: s.question as unknown as Prisma.InputJsonValue,
      })),
    });
    await tx.event.update({
      where: { id: eventId },
      data: { totalHours: new Prisma.Decimal(total) },
    });
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
      sessions: { select: { id: true, courseId: true } },
    },
  });
  if (!draft) throw new Error("Event draft not found");
  if (!draft.eventType) redirect(ROUTES.qualifiers);
  const type = draft.eventType;
  const data = (draft.eventData as Partial<EventData>) ?? {};

  // Per-type completeness check.
  const missing = (() => {
    if (!draft.name || !draft.eventDate || !data.organizationName) {
      return ROUTES.details;
    }
    if (type === EventType.FULL_EVENT_QUIZ) {
      return data.quiz && draft.totalHours ? null : ROUTES.quiz;
    }
    if (type === EventType.SELECTIVE_INLINE) {
      return draft.sessions.some((s) => s.courseId === null)
        ? null
        : ROUTES.sessions;
    }
    // PER_COURSE types
    return draft.sessions.some((s) => s.courseId !== null) ? null : ROUTES.courses;
  })();
  if (missing) {
    redirect(
      `${missing}?error=validation&detail=${encodeURIComponent(
        "Some required details are missing. Finish this step.",
      )}`,
    );
  }

  const submittedAt = new Date();
  const consumesCredit = isEventOnly(type);

  await prisma.$transaction(async (tx) => {
    if (consumesCredit) {
      await tx.$executeRaw`select id from public.companies where id = ${companyId}::uuid for update`;
      const company = await tx.company.findUniqueOrThrow({
        where: { id: companyId },
        select: { applicationCredits: true },
      });
      if (company.applicationCredits <= 0) {
        throw new Error("No application credits available");
      }
      await tx.company.update({
        where: { id: companyId },
        data: { applicationCredits: { decrement: 1 } },
      });
    }
    const updated = await tx.event.updateMany({
      where: { id: eventId, companyId, status: "DRAFT" },
      data: { status: "PENDING", submittedAt },
    });
    if (updated.count !== 1) throw new Error("Event was already submitted");
  });

  // Reviewer notification (reuses the application-submitted template).
  const reviewerEmails = (process.env.REVIEWER_NOTIFICATION_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
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
        to: reviewerEmails,
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
