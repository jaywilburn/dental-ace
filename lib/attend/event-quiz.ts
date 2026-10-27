import "server-only";
import { z } from "zod";
import { EventType, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { quizQuestionSchema, type QuizQuestion } from "@/lib/forms/application/schemas";
import {
  inlineQuestionReadSchema,
  sessionCourseInfoReadSchema,
  type EventQuizQuestion,
} from "@/lib/forms/event/schemas";
import { formatCeHours } from "@/lib/attend/format-ce-hours";
import { parseStoredSurvey, type SurveyQuestion } from "@/lib/events/survey-schemas";
import type {
  PublicQuestion,
  EventPublicForm,
  EventFormItemDetails,
} from "@/lib/attend/event-form-items";

/*
  Event quiz assembly. The ONE place that decides which questions an event
  attendee answers, used by both the public page (questions stripped of answers)
  and the submit action (full questions, for scoring). Keeping it in one module
  guarantees the page and the server score the exact same set in the same order.

  Keyed off SESSION SHAPE, not just event type, so both the current model and
  already-approved legacy events work:

  - Course-backed sessions (EventSession.courseId set) — event-only events
    approved under the full-course model, plus per-course events (Opt 2/4): one
    MC question per course. FULL coverage asks all; SELECTIVE asks the attended.
  - Legacy FULL_EVENT_QUIZ (no sessions): the 5 event-level questions (eventData.quiz).
  - SELECTIVE_INLINE (courseId null) — the current lightweight model (and its
    pre-July twin): one question per attended inline session. This is the ONLY
    branch that can yield an attendance-code (CODE) question; course quizzes
    and the legacy event quiz are read with the TF/MC-only quiz schema.

  SELECTIVE_INLINE events (either branch) credit per session: a correct answer
  earns that session's hours, a wrong one drops the session from the
  certificate. The assembler flags this via perSessionCredit + sessionHours;
  the submit action applies it (lib/attend/event-actions.ts + event-scoring.ts).
*/

const quizArray = z.array(quizQuestionSchema);

export type EventForAttend = NonNullable<Awaited<ReturnType<typeof loadEventByToken>>>;
export type EventSessionForAttend = EventForAttend["sessions"][number];
/** The attendee PAGE shape: EventForAttend plus course applicationData (presenter names). */
export type EventForAttendPage = NonNullable<Awaited<ReturnType<typeof loadEventPageByToken>>>;

export type { PublicQuestion, EventPublicForm } from "@/lib/attend/event-form-items";

export type AssembledQuiz = {
  questions: EventQuizQuestion[]; // WITH answers (and codes) — never sent to the client
  hours: number;
  attendedSessionIds: string[];
  sessionNames: string[];
  /** Per-question session hours, aligned with questions[] (selective only). */
  sessionHours: number[];
  passPct: number;
  /** SELECTIVE_INLINE: score each session's question on its own (see header). */
  perSessionCredit: boolean;
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
  // Attendee survey (events.survey), shown only when the company has surveys
  // switched on. Ungraded: never part of scoring (see activeSurvey).
  survey: true,
  company: { select: { certBalance: true, surveyEnabled: true } },
  sessions: {
    orderBy: { position: "asc" as const },
    select: {
      id: true,
      position: true,
      name: true,
      durationHours: true,
      question: true,
      courseInfo: true,
      course: {
        select: {
          quizQuestions: true,
          // Retired attached courses issue no new credit (see courseRetired).
          retiredAt: true,
          application: { select: { courseTitle: true, ceHours: true } },
        },
      },
    },
  },
} satisfies Prisma.EventSelect;

/*
  The attendee page additionally reads each course's applicationData, but only
  for presenter NAMES on course-backed selective forms. It is a full application
  blob, so the public submit path (loadEventByToken) never selects it.
*/
const PAGE_SELECT = {
  ...SELECT,
  sessions: {
    ...SELECT.sessions,
    select: {
      ...SELECT.sessions.select,
      course: {
        select: {
          quizQuestions: true,
          retiredAt: true,
          application: {
            select: { courseTitle: true, ceHours: true, applicationData: true },
          },
        },
      },
    },
  },
} satisfies Prisma.EventSelect;

/** Submit path: everything scoring needs, no application blobs. */
export async function loadEventByToken(token: string) {
  return prisma.event.findUnique({ where: { attendeeLinkToken: token }, select: SELECT });
}

/** Attendee page: SELECT plus course applicationData for presenter names. */
export async function loadEventPageByToken(token: string) {
  return prisma.event.findUnique({ where: { attendeeLinkToken: token }, select: PAGE_SELECT });
}

/**
 * The survey an attendee of this event answers, or null when there is none:
 * the company's survey feature is off, or the event has no (valid) questions.
 * The ONE gate shared by the attendee page and the submit action, so the page
 * never shows a survey the server would ignore, or vice versa.
 */
export function activeSurvey(event: {
  survey: unknown;
  company: { surveyEnabled?: boolean | null };
}): SurveyQuestion[] | null {
  if (event.company.surveyEnabled !== true) return null;
  const questions = parseStoredSurvey(event.survey);
  return questions.length > 0 ? questions : null;
}

/** Answer-stripped copy for the public page. Exhaustive: a new question type
 *  must decide here what it may reveal. CODE ships its prompt only. */
export function strip(q: EventQuizQuestion): PublicQuestion {
  switch (q.type) {
    case "TF":
      return { type: "TF", question: q.question };
    case "MC":
      return { type: "MC", question: q.question, options: q.options };
    case "CODE":
      return { type: "CODE", question: q.question };
    default: {
      const never: never = q;
      throw new Error(`Unknown question type: ${JSON.stringify(never)}`);
    }
  }
}

/** First multiple-choice question of a course's stored quiz, or null. */
function firstCourseMc(session: EventSessionForAttend): QuizQuestion | null {
  const parsed = quizArray.safeParse(session.course?.quizQuestions);
  if (!parsed.success) return null;
  return parsed.data.find((q) => q.type === "MC") ?? null;
}

const PRESENTER_ROLE_ORDER = ["Primary Presenter", "Co-Presenter", "Moderator"];

const presenterNamesSchema = z.object({
  presenters: z
    .array(z.object({ name: z.unknown(), role: z.unknown().optional() }).passthrough())
    .optional(),
});

/**
 * Presenter NAMES from a stored application blob (inline course_info or a
 * course's application_data), ordered Primary, Co-Presenter, Moderator (stable
 * within a role, unknown roles last), trimmed, blank-dropped and deduped. Only
 * names ever leave this function: bio, experience, training, disclosure and
 * creator contact stay server-side. Tolerant: any malformed shape yields [].
 */
export function presenterNames(data: unknown): string[] {
  const parsed = presenterNamesSchema.safeParse(data ?? {});
  if (!parsed.success || !parsed.data.presenters) return [];
  const rank = (role: unknown) => {
    const i = typeof role === "string" ? PRESENTER_ROLE_ORDER.indexOf(role) : -1;
    return i === -1 ? PRESENTER_ROLE_ORDER.length : i;
  };
  const ordered = parsed.data.presenters
    .map((p, idx) => ({ name: typeof p.name === "string" ? p.name.trim() : "", r: rank(p.role), idx }))
    .filter((p) => p.name.length > 0)
    .sort((a, b) => a.r - b.r || a.idx - b.idx);
  const seen = new Set<string>();
  const names: string[] = [];
  for (const p of ordered) {
    const k = p.name.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    names.push(p.name);
  }
  return names;
}

function inlineQuestion(session: EventSessionForAttend): EventQuizQuestion | null {
  const parsed = inlineQuestionReadSchema.safeParse(session.question);
  return parsed.success ? parsed.data : null;
}

function eventQuiz(event: EventForAttend): QuizQuestion[] | null {
  const data = (event.eventData as { quiz?: unknown }) ?? {};
  const parsed = quizArray.safeParse(data.quiz);
  return parsed.success ? parsed.data : null;
}

/**
 * True when the session's attached course was retired by an admin
 * (lib/admin/course-retire.ts). A retired course must not earn new credit, so
 * a selective event stops offering that session and a full-attendance event
 * (which can only certify every session together) closes its form rather than
 * certify hours for it. Neither throws: the page shows its usual notice.
 */
function courseRetired(session: { course: { retiredAt?: Date | null } | null }): boolean {
  return session.course?.retiredAt != null;
}

/** True when every session points at an accredited course (vs legacy inline). */
function sessionsCourseBacked(event: EventForAttend): boolean {
  return event.sessions.length > 0 && event.sessions.every((s) => s.course != null);
}

function isSelectiveType(t: EventType | null): boolean {
  return t === EventType.SELECTIVE_INLINE || t === EventType.SELECTIVE_PER_COURSE;
}

/** Shape the public (answer-stripped) form for the attendee page. */
export function buildPublicForm(event: EventForAttendPage): EventPublicForm | null {
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
        if (!q) return null;
        // Per-session course info helps attendees pick sessions. Only the
        // displayed fields ship to the client; answers stay stripped. Null
        // courseInfo (sessions saved before July 2026) renders as before.
        const ci = sessionCourseInfoReadSchema.safeParse(s.courseInfo ?? {});
        const info = ci.success ? ci.data : {};
        const details: EventFormItemDetails = {
          objectives: info.courseObjectives,
          outline: info.courseOutline,
          category: info.subjectMatter,
          format: info.deliveryFormat,
        };
        const hasDetails = Object.values(details).some(Boolean);
        const presenters = presenterNames(s.courseInfo);
        const hours = s.durationHours ? Number(s.durationHours) : null;
        return {
          id: s.id,
          label: s.name ?? "Session",
          sub: formatCeHours(hours),
          ...(hours !== null ? { hours } : {}),
          question: strip(q),
          ...(info.shortDescription ? { description: info.shortDescription } : {}),
          ...(hasDetails ? { details } : {}),
          ...(presenters.length ? { presenters } : {}),
        };
      });
      return items.some((i) => i === null)
        ? null
        : {
            mode: "selective",
            items: items as Exclude<(typeof items)[number], null>[],
            perSessionCredit: true,
          };
    }
    // Per-course event with no attached courses — nothing to ask.
    return null;
  }

  // Course-backed: one MC question per course.
  if (!isSelectiveType(event.eventType)) {
    if (event.sessions.some(courseRetired)) return null;
    const qs = event.sessions.map(firstCourseMc);
    if (qs.some((q) => q === null)) return null;
    return { mode: "full", questions: (qs as QuizQuestion[]).map(strip) };
  }
  // Selective: a retired course's session is simply no longer offered.
  const offered = event.sessions.filter((s) => !courseRetired(s));
  if (offered.length === 0) return null;
  const items = offered.map((s) => {
    const q = firstCourseMc(s);
    if (!q) return null;
    const presenters = presenterNames(s.course?.application.applicationData);
    const hours = s.course?.application.ceHours ? Number(s.course.application.ceHours) : null;
    return {
      id: s.id,
      label: s.course?.application.courseTitle ?? "Course",
      sub: formatCeHours(hours),
      ...(hours !== null ? { hours } : {}),
      question: strip(q),
      ...(presenters.length ? { presenters } : {}),
    };
  });
  return items.some((i) => i === null)
    ? null
    : {
        mode: "selective",
        items: items as Exclude<(typeof items)[number], null>[],
        // Mirrors assembleForSubmit's perSessionCredit for this branch.
        perSessionCredit: event.eventType === EventType.SELECTIVE_INLINE,
      };
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
    return {
      questions: q,
      hours: totalHours,
      attendedSessionIds: [],
      sessionNames: [],
      sessionHours: [],
      passPct: 0.6,
      perSessionCredit: false,
    };
  }

  // Full coverage, course-backed (FULL_PER_COURSE, or event-only under the
  // full-course model): one MC question per course, all of them.
  if (!isSelectiveType(event.eventType)) {
    // Mirrors buildPublicForm: never certify a retired course's hours.
    if (event.sessions.some(courseRetired)) return null;
    const qs = event.sessions.map(firstCourseMc);
    if (qs.length === 0 || qs.some((q) => q === null)) return null;
    return {
      questions: qs as QuizQuestion[],
      hours: totalHours,
      attendedSessionIds: [],
      sessionNames: [],
      sessionHours: [],
      passPct: 0.7,
      perSessionCredit: false,
    };
  }

  // Selective: derive from the selected ids, in order. Inline sessions read
  // their inline question; course-backed sessions read the course's first MC.
  if (selectedSessionIds.length === 0) return null;
  // Reject duplicates — a repeated session id must not earn its hours twice.
  if (new Set(selectedSessionIds).size !== selectedSessionIds.length) return null;
  const useInline = event.eventType === EventType.SELECTIVE_INLINE && !courseBacked;
  const byId = new Map(event.sessions.map((s) => [s.id, s]));
  const questions: EventQuizQuestion[] = [];
  const sessionNames: string[] = [];
  const sessionHours: number[] = [];
  for (const id of selectedSessionIds) {
    const s = byId.get(id);
    if (!s) return null;
    if (useInline) {
      const q = inlineQuestion(s);
      if (!q) return null;
      questions.push(q);
      sessionHours.push(s.durationHours ? Number(s.durationHours) : 0);
      sessionNames.push(s.name ?? "Session");
    } else {
      // A retired course's session is not offered on the page; refuse a
      // hand-crafted submit that selects it.
      if (courseRetired(s)) return null;
      const q = firstCourseMc(s);
      if (!q) return null;
      questions.push(q);
      sessionHours.push(
        s.course?.application.ceHours ? Number(s.course.application.ceHours) : 0,
      );
      sessionNames.push(s.course?.application.courseTitle ?? "Course");
    }
  }
  return {
    questions,
    hours: sessionHours.reduce((sum, h) => sum + h, 0),
    attendedSessionIds: selectedSessionIds,
    sessionNames,
    sessionHours,
    passPct: 0.7,
    // SELECTIVE_INLINE (both branches): credit each attended session on its own
    // answer. SELECTIVE_PER_COURSE keeps the single overall threshold.
    perSessionCredit: event.eventType === EventType.SELECTIVE_INLINE,
  };
}
