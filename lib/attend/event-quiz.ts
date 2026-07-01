import "server-only";
import { z } from "zod";
import { EventType, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { quizQuestionSchema, type QuizQuestion } from "@/lib/forms/application/schemas";

/*
  Event quiz assembly. The ONE place that decides which questions an event
  attendee answers, used by both the public page (questions stripped of answers)
  and the submit action (full questions, for scoring). Keeping it in one module
  guarantees the page and the server score the exact same set in the same order.

  Keyed off SESSION SHAPE, not just event type, so both the current model and
  already-approved legacy events work:

  - Course-backed sessions (EventSession.courseId set) — every event-only event
    approved under the full-course model, plus per-course events (Opt 2/4): one
    MC question per course. FULL coverage asks all; SELECTIVE asks the attended.
  - Legacy FULL_EVENT_QUIZ (no sessions): the 5 event-level questions (eventData.quiz).
  - Legacy SELECTIVE_INLINE (courseId null): one question per attended inline session.
*/

const quizArray = z.array(quizQuestionSchema);

export type EventForAttend = NonNullable<Awaited<ReturnType<typeof loadEventByToken>>>;
export type EventSessionForAttend = EventForAttend["sessions"][number];

export type PublicQuestion =
  | { type: "TF"; question: string }
  | { type: "MC"; question: string; options: string[] };

export type EventPublicForm =
  | { mode: "full"; questions: PublicQuestion[] }
  | {
      mode: "selective";
      items: Array<{ id: string; label: string; sub: string; question: PublicQuestion }>;
    };

export type AssembledQuiz = {
  questions: QuizQuestion[]; // WITH answers — never sent to the client
  hours: number;
  attendedSessionIds: string[];
  sessionNames: string[];
  passPct: number;
};

const SELECT = {
  id: true,
  companyId: true,
  name: true,
  eventIdNumber: true,
  status: true,
  eventType: true,
  totalHours: true,
  expiresAt: true,
  eventData: true,
  company: { select: { certBalance: true } },
  sessions: {
    orderBy: { position: "asc" as const },
    select: {
      id: true,
      position: true,
      name: true,
      durationHours: true,
      question: true,
      course: {
        select: {
          quizQuestions: true,
          application: { select: { courseTitle: true, ceHours: true } },
        },
      },
    },
  },
} satisfies Prisma.EventSelect;

export async function loadEventByToken(token: string) {
  return prisma.event.findUnique({ where: { attendeeLinkToken: token }, select: SELECT });
}

function strip(q: QuizQuestion): PublicQuestion {
  return q.type === "TF"
    ? { type: "TF", question: q.question }
    : { type: "MC", question: q.question, options: q.options };
}

/** First multiple-choice question of a course's stored quiz, or null. */
function firstCourseMc(session: EventSessionForAttend): QuizQuestion | null {
  const parsed = quizArray.safeParse(session.course?.quizQuestions);
  if (!parsed.success) return null;
  return parsed.data.find((q) => q.type === "MC") ?? null;
}

function inlineQuestion(session: EventSessionForAttend): QuizQuestion | null {
  const parsed = quizQuestionSchema.safeParse(session.question);
  return parsed.success ? parsed.data : null;
}

function eventQuiz(event: EventForAttend): QuizQuestion[] | null {
  const data = (event.eventData as { quiz?: unknown }) ?? {};
  const parsed = quizArray.safeParse(data.quiz);
  return parsed.success ? parsed.data : null;
}

/** True when every session points at an accredited course (vs legacy inline). */
function sessionsCourseBacked(event: EventForAttend): boolean {
  return event.sessions.length > 0 && event.sessions.every((s) => s.course != null);
}

function isSelectiveType(t: EventType | null): boolean {
  return t === EventType.SELECTIVE_INLINE || t === EventType.SELECTIVE_PER_COURSE;
}

/** Shape the public (answer-stripped) form for the attendee page. */
export function buildPublicForm(event: EventForAttend): EventPublicForm | null {
  if (!event.eventType) return null;
  const courseBacked = sessionsCourseBacked(event);

  // Legacy event-only events (no course-backed sessions).
  if (!courseBacked) {
    if (event.eventType === EventType.FULL_EVENT_QUIZ) {
      const q = eventQuiz(event);
      return q ? { mode: "full", questions: q.map(strip) } : null;
    }
    if (event.eventType === EventType.SELECTIVE_INLINE) {
      const items = event.sessions.map((s) => {
        const q = inlineQuestion(s);
        return q
          ? {
              id: s.id,
              label: s.name ?? "Session",
              sub: `${s.durationHours ? Number(s.durationHours).toFixed(1) : "?"} hrs`,
              question: strip(q),
            }
          : null;
      });
      return items.some((i) => i === null)
        ? null
        : { mode: "selective", items: items as Exclude<(typeof items)[number], null>[] };
    }
    // Per-course event with no attached courses — nothing to ask.
    return null;
  }

  // Course-backed: one MC question per course.
  if (!isSelectiveType(event.eventType)) {
    const qs = event.sessions.map(firstCourseMc);
    if (qs.some((q) => q === null)) return null;
    return { mode: "full", questions: (qs as QuizQuestion[]).map(strip) };
  }
  const items = event.sessions.map((s) => {
    const q = firstCourseMc(s);
    return q
      ? {
          id: s.id,
          label: s.course?.application.courseTitle ?? "Course",
          sub: `${s.course?.application.ceHours ? Number(s.course.application.ceHours).toFixed(1) : "?"} hrs`,
          question: strip(q),
        }
      : null;
  });
  return items.some((i) => i === null)
    ? null
    : { mode: "selective", items: items as Exclude<(typeof items)[number], null>[] };
}

/**
 * Assemble the scored quiz for a submission. For selective types the questions
 * are derived from `selectedSessionIds` IN THE ORDER GIVEN (so answers[i] lines
 * up), each validated as belonging to this event. Returns null if anything is
 * invalid (unknown id, missing question, empty selection on a selective event).
 */
export function assembleForSubmit(
  event: EventForAttend,
  selectedSessionIds: string[],
): AssembledQuiz | null {
  if (!event.eventType) return null;
  const totalHours = event.totalHours ? Number(event.totalHours) : 0;
  const courseBacked = sessionsCourseBacked(event);

  // Legacy event-level quiz (full attendance, no course-backed sessions).
  if (event.eventType === EventType.FULL_EVENT_QUIZ && !courseBacked) {
    const q = eventQuiz(event);
    if (!q) return null;
    return { questions: q, hours: totalHours, attendedSessionIds: [], sessionNames: [], passPct: 0.6 };
  }

  // Full coverage, course-backed (FULL_PER_COURSE, or event-only under the
  // full-course model): one MC question per course, all of them.
  if (!isSelectiveType(event.eventType)) {
    const qs = event.sessions.map(firstCourseMc);
    if (qs.length === 0 || qs.some((q) => q === null)) return null;
    return {
      questions: qs as QuizQuestion[],
      hours: totalHours,
      attendedSessionIds: [],
      sessionNames: [],
      passPct: 0.7,
    };
  }

  // Selective: derive from the selected ids, in order. Legacy inline sessions
  // read their inline question; course-backed sessions read the course's first MC.
  if (selectedSessionIds.length === 0) return null;
  const useInline = event.eventType === EventType.SELECTIVE_INLINE && !courseBacked;
  const byId = new Map(event.sessions.map((s) => [s.id, s]));
  const questions: QuizQuestion[] = [];
  const sessionNames: string[] = [];
  let hours = 0;
  for (const id of selectedSessionIds) {
    const s = byId.get(id);
    if (!s) return null;
    if (useInline) {
      const q = inlineQuestion(s);
      if (!q) return null;
      questions.push(q);
      hours += s.durationHours ? Number(s.durationHours) : 0;
      sessionNames.push(s.name ?? "Session");
    } else {
      const q = firstCourseMc(s);
      if (!q) return null;
      questions.push(q);
      hours += s.course?.application.ceHours ? Number(s.course.application.ceHours) : 0;
      sessionNames.push(s.course?.application.courseTitle ?? "Course");
    }
  }
  return { questions, hours, attendedSessionIds: selectedSessionIds, sessionNames, passPct: 0.7 };
}
