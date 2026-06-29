import { z } from "zod";
import { EventType } from "@prisma/client";
import { orgStepSchema } from "@/lib/forms/application/schemas";

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

// Opt 3: inline sessions, each with a name, a duration (0.5 increments), and a
// single multiple-choice question.
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

// Persisted in Event.eventData. Qualifier answers + (Opt 1) the event quiz live
// here; sessions/attached courses live in event_sessions; hours on Event.totalHours.
export const eventDataSchema = orgStepSchema
  .merge(eventDetailsSchema)
  .merge(qualifierSchema)
  .partial()
  .extend({
    // Opt 1 only.
    quiz: eventQuizSchema.shape.quiz.optional(),
  });

export type EventData = z.infer<typeof eventDataSchema>;
export type InlineSession = z.infer<typeof inlineSessionSchema>;
export type McQuestion = z.infer<typeof mcQuestionSchema>;
