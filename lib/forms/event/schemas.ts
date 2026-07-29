import { z } from "zod";
import { EventType } from "@prisma/client";
import {
  orgStepSchema,
  step1Schema,
  step2Schema,
  step3Schema,
  quizQuestionSchema,
  applicationDataReadSchema,
} from "@/lib/forms/application/schemas";

/*
  Event-submission form schemas. An event is accredited through its own
  lifecycle on the Event row (DRAFT -> PENDING -> APPROVED); these validate each
  wizard step's slice (merged into Event.eventData) plus the final submit.

  The two qualifier answers (coverage + reuse) map to one of four EventTypes:
    FULL      + EVENT_ONLY  -> FULL_EVENT_QUIZ      (Opt 1)
    FULL      + PER_COURSE  -> FULL_PER_COURSE      (Opt 2)
    SELECTIVE + EVENT_ONLY  -> SELECTIVE_INLINE     (Opt 3)
    SELECTIVE + PER_COURSE  -> SELECTIVE_PER_COURSE (Opt 4)
*/

export const EVENT_COVERAGE = ["FULL", "SELECTIVE"] as const;
export const EVENT_REUSE = ["EVENT_ONLY", "PER_COURSE"] as const;

export type EventCoverage = (typeof EVENT_COVERAGE)[number];
export type EventReuse = (typeof EVENT_REUSE)[number];

/** Derive the EventType enum from the two qualifier answers. */
export function deriveEventType(
  coverage: EventCoverage,
  reuse: EventReuse,
): EventType {
  if (coverage === "FULL") {
    return reuse === "EVENT_ONLY"
      ? EventType.FULL_EVENT_QUIZ
      : EventType.FULL_PER_COURSE;
  }
  return reuse === "EVENT_ONLY"
    ? EventType.SELECTIVE_INLINE
    : EventType.SELECTIVE_PER_COURSE;
}

/** Event-level accreditation (one application, costs 1 credit). */
export function isEventOnly(type: EventType): boolean {
  return (
    type === EventType.FULL_EVENT_QUIZ || type === EventType.SELECTIVE_INLINE
  );
}

/**
 * Application credits consumed when this event is submitted.
 *
 * Event-only types are accredited as ONE application no matter how many
 * sessions they list, so they cost exactly one credit. Per-course types cost
 * nothing (their courses were already paid for individually).
 *
 * Consumed by BOTH submitEvent and the review page so the amount charged and
 * the amount quoted to the customer can never drift apart. Between 2026-06-30
 * and 2026-07-29 submit charged one credit per session while the qualifier
 * screen promised "accredited as a single application"; that mismatch billed an
 * 8-session event 8 credits for a single Event ID.
 */
export function eventCreditCost(type: EventType): number {
  return isEventOnly(type) ? 1 : 0;
}

/*
  Inline full-course path: each session is captured as a full CourseApplication
  inside the Event wizard and accredited as an event-scoped course. Since
  2026-07-21 this is FULL_EVENT_QUIZ only; SELECTIVE_INLINE reverted to the
  lightweight path (one event application whose sessions are Session/Question/
  Answer rows on event_sessions, one MC question each). Both event-only types
  bill one application credit for the whole event at submit, no matter how many
  sessions they list (see eventCreditCost). Reviewer-side code
  keys on data shape (pending session applications present or not) so
  SELECTIVE_INLINE events submitted under the full-course model keep working.
*/
export function isInlineFullCourse(type: EventType): boolean {
  return type === EventType.FULL_EVENT_QUIZ;
}

/** Selective attendance (attendee picks sessions/courses). */
export function isSelective(type: EventType): boolean {
  return (
    type === EventType.SELECTIVE_INLINE ||
    type === EventType.SELECTIVE_PER_COURSE
  );
}

/** Per-course accreditation (attaches existing approved courses). */
export function isPerCourse(type: EventType): boolean {
  return (
    type === EventType.FULL_PER_COURSE ||
    type === EventType.SELECTIVE_PER_COURSE
  );
}

// Step: event details (name + free-form dates). Org/contact reuses orgStepSchema.
export const eventDetailsSchema = z.object({
  name: z
    .string()
    .min(3, "Enter an event name.")
    .max(200, "Keep the event name under 200 characters."),
  eventDate: z
    .string()
    .min(3, "Enter the event date(s).")
    .max(120, "Keep the event dates under 120 characters."),
});

// Step: the two qualifier answers.
export const qualifierSchema = z.object({
  coverage: z.enum(EVENT_COVERAGE),
  reuse: z.enum(EVENT_REUSE),
});

// One multiple-choice question (Opt 3 inline sessions, and the event quiz MCs).
export const mcQuestionSchema = z.object({
  type: z.literal("MC"),
  question: z
    .string()
    .min(5, "Write a question of at least 5 characters.")
    .max(500, "Keep the question under 500 characters."),
  options: z
    .array(
      z
        .string()
        .min(1, "Every answer option needs text.")
        .max(200, "Keep each answer under 200 characters."),
    )
    .length(4),
  correctIndex: z.number().int().min(0).max(3),
});

// True/False question (event-level quiz, Opt 1).
export const tfQuestionSchema = z.object({
  type: z.literal("TF"),
  question: z.string().min(5).max(500),
  correctAnswer: z.enum(["True", "False"]),
});

const halfHour = (n: number) => Number.isInteger(n * 2);

// Opt 1: a 5-question event-level quiz (2 TF + 3 MC) + total event hours.
export const eventQuizSchema = z.object({
  totalHours: z.number().min(0.5).max(80).refine(halfHour, {
    message: "Total hours must be in 0.5 increments",
  }),
  quiz: z
    .array(z.discriminatedUnion("type", [tfQuestionSchema, mcQuestionSchema]))
    .length(5)
    .refine((q) => q[0]?.type === "TF" && q[1]?.type === "TF", {
      message: "Q1 and Q2 must be True/False",
    })
    .refine((q) => q.slice(2).every((x) => x.type === "MC"), {
      message: "Q3, Q4, and Q5 must be Multiple Choice",
    }),
});

/*
  Opt 3 (SELECTIVE_INLINE): each inline session carries its own full Course
  Information section (the application step1 shape; July 2026 client request)
  plus ONE multiple-choice question (mcQuestionSchema mirrors the standard MC
  question shape in lib/forms/application/schemas.ts). A correct answer earns
  that session's hours on the certificate; a wrong answer drops the session.
  EventSession.name/durationHours are mirrored from courseTitle/ceCreditHours
  at save time so downstream consumers (quiz assembly, scoring, certificates,
  totalHours) keep reading them unchanged.
*/
export const sessionCourseInfoSchema = step1Schema.extend({
  // Tighter than step1: certificates sum these per session.
  ceCreditHours: z
    .number()
    .min(0.5, "Enter at least 0.5 CE hours for this session.")
    .max(40, "Enter no more than 40 CE hours for one session.")
    .refine(halfHour, {
      message: "CE hours must be in 0.5 increments",
    }),
});
export type SessionCourseInfo = z.infer<typeof sessionCourseInfoSchema>;

/*
  Full per-session application (July 2026 client request): each SELECTIVE_INLINE
  session now carries the whole front-half of a course application, Course
  Information + Course Creator + Presenters, stored MERGED in
  event_sessions.course_info. The quiz half is replaced by ONE MC question in
  event_sessions.question. The three slices are captured through a per-session
  mini-wizard (app/company/events/new/inline-sessions/[sessionId]/...), each
  saved strictly with its own step schema (sessionCourseInfoSchema /
  step2Schema / step3Schema); this merged schema is the submit-gate
  completeness check (isInlineSessionComplete below). Outline stays at the
  per-course 20k cap (via step1Schema); there is no event-wide outline.
*/
export const sessionApplicationSchema = sessionCourseInfoSchema
  .merge(step2Schema)
  .merge(step3Schema);
export type SessionApplicationData = z.infer<typeof sessionApplicationSchema>;

export const inlineSessionSchema = z.object({
  courseInfo: sessionApplicationSchema,
  question: mcQuestionSchema,
});

// Tolerant READ of persisted courseInfo: a stored row must never become
// unviewable (mirrors applicationDataReadSchema's philosophy).
export const sessionCourseInfoReadSchema = z
  .object({
    courseTitle: z.string().optional(),
    ceCreditHours: z.number().optional(),
    subjectMatter: z.string().optional(),
    deliveryFormat: z.string().optional(),
    primaryDistributionFormat: z.string().optional(),
    shortDescription: z.string().optional(),
    publicProtectionStatement: z.string().optional(),
    courseObjectives: z.string().optional(),
    courseOutline: z.string().optional(),
  })
  .passthrough();
export type SessionCourseInfoRead = z.infer<typeof sessionCourseInfoReadSchema>;

/**
 * Submit-gate completeness for one stored inline session row. A complete
 * session carries the full front-half application (Course Info + Creator +
 * Presenters) plus its one MC question. Sessions saved before July 2026 hold
 * only the step1 course-info slice and correctly read incomplete until their
 * creator + presenters are added.
 */
export function isInlineSessionComplete(s: {
  courseInfo: unknown;
  question: unknown;
}): boolean {
  return (
    sessionApplicationSchema.safeParse(s.courseInfo).success &&
    mcQuestionSchema.safeParse(s.question).success
  );
}

// Opt 2/4: attach existing approved courses by id.
export const attachedCoursesSchema = z.object({
  courseIds: z
    .array(z.string().uuid())
    .min(1, "Select at least one approved course.")
    .max(20, "You can attach up to 20 courses."),
});

/*
  FULL_EVENT_QUIZ (Opt 1) session quiz — July 2026 client request. Each session
  is a full course application, but its quiz is ONE multiple-choice question,
  matching the attendee form (which surfaces a single question per session)
  instead of the standalone 5-question quiz. Stored as a 1-element array in
  applicationData.quiz so the accredited course's quizQuestions and the attendee
  flow's firstCourseMc read it unchanged. saveSessionQuiz validates+persists the
  single question via eventSessionQuizStepSchema; eventSessionApplicationSchema
  is the submit/completeness gate and stays tolerant of legacy 5-question event
  sessions (>= 1 question, at least one MC) so older data still validates.
*/
export const eventSessionQuizStepSchema = z.object({
  quiz: z.array(quizQuestionSchema).length(1),
});

/*
  Quiz floor for an event session: at least one question with at least one MC
  (the attendee answers a single MC per session, resolved via firstCourseMc).
  SHARED by the write gate and the read schema so they can't diverge, so
  approveEvent can never accredit an empty / no-MC quiz (this is the
  approval-time safety net that the strict standalone quiz shape used to provide
  before events read with a variable-length quiz).
*/
const eventSessionQuizField = z
  .array(quizQuestionSchema)
  .min(1)
  .refine((q) => q.some((x) => x.type === "MC"), {
    message: "Each session needs one multiple-choice question",
  });

export const eventSessionApplicationSchema = orgStepSchema
  .merge(step1Schema)
  .merge(step2Schema)
  .merge(step3Schema)
  .extend({ quiz: eventSessionQuizField });
export type EventSessionApplicationData = z.infer<
  typeof eventSessionApplicationSchema
>;

/*
  READ variant for FULL_EVENT_QUIZ session applications. Identical to
  applicationDataReadSchema but with the quiz using the same variable-length
  floor as the write gate (>= 1 question, >= 1 MC), because event sessions carry
  a single MC question. The shared applicationDataReadSchema stays strict
  (exactly 5, TF/TF/MC/MC/MC) so STANDALONE course approval keeps its 5-question
  gate; only the event detail pages + approveEvent parse session applications
  with this variant.
*/
export const eventSessionApplicationReadSchema = applicationDataReadSchema.extend(
  { quiz: eventSessionQuizField },
);

/*
  LEGACY READ ONLY (event-level application content). Until July 2026,
  SELECTIVE_INLINE events captured the front half of a course application
  (Course Information + Creator + Presenters) ONCE for the whole event, stored
  under eventData.eventApplication, with an "Event Outline" that could
  concatenate every session's outline (hence the high ceiling). New events no
  longer collect this — each session now carries its own full application (see
  sessionApplicationSchema) — but two approved production events and any older
  drafts still hold it, so these schemas remain to keep those records readable
  and to type eventData.eventApplication. Never an event-level CourseApplication
  row: approveEvent keys the accreditation model on whether pending session
  applications exist.
*/
export const EVENT_OUTLINE_MAX = 200_000;

export const eventStep1Schema = step1Schema.extend({
  courseOutline: z
    .string()
    .min(1, "Event outline is required")
    .max(EVENT_OUTLINE_MAX),
});

export const eventApplicationSchema = eventStep1Schema
  .merge(step2Schema)
  .merge(step3Schema);

export type EventApplicationData = z.infer<typeof eventApplicationSchema>;

// Persisted in Event.eventData. Qualifier answers + (Opt 1) the event quiz live
// here; sessions/attached courses live in event_sessions; hours on Event.totalHours.
export const eventDataSchema = orgStepSchema
  .merge(eventDetailsSchema)
  .merge(qualifierSchema)
  .partial()
  .extend({
    // Opt 1 only.
    quiz: eventQuizSchema.shape.quiz.optional(),
    // Legacy read only (see eventApplicationSchema): older SELECTIVE_INLINE
    // events stored their event-level Course Info + Creator + Presenters here.
    eventApplication: eventApplicationSchema.partial().optional(),
  });

export type EventData = z.infer<typeof eventDataSchema>;
export type InlineSession = z.infer<typeof inlineSessionSchema>;
export type McQuestion = z.infer<typeof mcQuestionSchema>;
