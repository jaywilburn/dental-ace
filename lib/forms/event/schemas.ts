import { z } from "zod";
import { EventType } from "@prisma/client";
import {
  orgStepSchema,
  step1Schema,
  step2Schema,
  step3Schema,
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

/*
  Inline full-course path: each session is captured as a full CourseApplication
  inside the Event wizard and accredited as an event-scoped course. Since
  2026-07-21 this is FULL_EVENT_QUIZ only; SELECTIVE_INLINE reverted to the
  lightweight path (one event application whose sessions are Session/Question/
  Answer rows on event_sessions, one MC question each). Both event-only types
  still bill one application credit per session at submit. Reviewer-side code
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
  name: z.string().min(3).max(200),
  eventDate: z.string().min(3).max(120),
});

// Step: the two qualifier answers.
export const qualifierSchema = z.object({
  coverage: z.enum(EVENT_COVERAGE),
  reuse: z.enum(EVENT_REUSE),
});

// One multiple-choice question (Opt 3 inline sessions, and the event quiz MCs).
export const mcQuestionSchema = z.object({
  type: z.literal("MC"),
  question: z.string().min(5).max(500),
  options: z.array(z.string().min(1).max(200)).length(4),
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

// Opt 3 (SELECTIVE_INLINE): inline sessions, each with a title, CE hours (0.5
// increments), and ONE multiple-choice question (exactly 4 non-empty options +
// a correct index; mcQuestionSchema mirrors the standard MC question shape in
// lib/forms/application/schemas.ts). A correct answer earns that session's
// hours on the certificate; a wrong answer drops the session.
export const inlineSessionSchema = z.object({
  name: z.string().min(2).max(200),
  durationHours: z.number().min(0.5).max(40).refine(halfHour, {
    message: "Duration must be in 0.5 increments",
  }),
  question: mcQuestionSchema,
});

export const inlineSessionsSchema = z.object({
  sessions: z.array(inlineSessionSchema).min(1).max(20),
});

// Opt 2/4: attach existing approved courses by id.
export const attachedCoursesSchema = z.object({
  courseIds: z.array(z.string().uuid()).min(1).max(20),
});

/*
  Opt 3 (SELECTIVE_INLINE) event-level application content: the front half of a
  course application (Course Information + Creator + Presenters), entered ONCE
  for the whole event before the Session/Question/Answer grid. Stored under
  eventData.eventApplication, NOT as an event-level CourseApplication row —
  approveEvent keys the accreditation model on whether pending session
  applications exist, and an event-level row would trip that branch. The quiz
  half of the application is replaced by the per-session questions on
  event_sessions.
*/
export const eventApplicationSchema = step1Schema
  .merge(step2Schema)
  .merge(step3Schema);

export type EventApplicationData = z.infer<typeof eventApplicationSchema>;

/** Event-application step slugs; each is also its wizard route segment. */
export type EventApplicationStep = "course" | "creator" | "presenters";

/** Route for a SELECTIVE_INLINE event-application step page. */
export function eventApplicationStepRoute(step: EventApplicationStep): string {
  return `/company/events/new/${step}`;
}

/**
 * First unfinished event-application step for a SELECTIVE_INLINE draft, or
 * null when Course Information + Creator + Presenters are all complete. The
 * step schemas ignore unknown keys, so each slice is checked against the same
 * merged eventApplication object.
 */
export function nextEventApplicationStep(
  raw: unknown,
): EventApplicationStep | null {
  if (!step1Schema.safeParse(raw).success) return "course";
  if (!step2Schema.safeParse(raw).success) return "creator";
  if (!step3Schema.safeParse(raw).success) return "presenters";
  return null;
}

/** All three event-application steps valid (SELECTIVE_INLINE submit gate). */
export function isEventApplicationComplete(raw: unknown): boolean {
  return nextEventApplicationStep(raw) === null;
}

// Persisted in Event.eventData. Qualifier answers + (Opt 1) the event quiz live
// here; sessions/attached courses live in event_sessions; hours on Event.totalHours.
export const eventDataSchema = orgStepSchema
  .merge(eventDetailsSchema)
  .merge(qualifierSchema)
  .partial()
  .extend({
    // Opt 1 only.
    quiz: eventQuizSchema.shape.quiz.optional(),
    // Opt 3 only: event-level Course Info + Creator + Presenters. Partial while
    // the wizard is in progress; validated in full at submit
    // (isEventApplicationComplete).
    eventApplication: eventApplicationSchema.partial().optional(),
  });

export type EventData = z.infer<typeof eventDataSchema>;
export type InlineSession = z.infer<typeof inlineSessionSchema>;
export type McQuestion = z.infer<typeof mcQuestionSchema>;
