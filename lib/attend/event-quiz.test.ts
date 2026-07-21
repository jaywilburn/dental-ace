import { describe, it, expect } from "vitest";
import { EventType } from "@prisma/client";
import {
  assembleForSubmit,
  buildPublicForm,
  type EventForAttend,
} from "@/lib/attend/event-quiz";

/*
  assembleForSubmit / buildPublicForm are pure given the loaded event row, so
  the SELECTIVE branches are exercised with hand-built events: the lightweight
  inline shape (courseId null + inline question), the course-backed shape (a
  SELECTIVE_INLINE event approved under the July full-course model), and
  SELECTIVE_PER_COURSE (which must keep the single overall threshold).
*/

const mc = (correctIndex: number, question = "What was covered?") => ({
  type: "MC" as const,
  question,
  options: ["a", "b", "c", "d"],
  correctIndex,
});

function baseEvent(overrides: Record<string, unknown>): EventForAttend {
  return {
    id: "event-1",
    companyId: "company-1",
    name: "Annual Meeting",
    eventIdNumber: "ACE-EVT-2026-0001",
    status: "APPROVED",
    totalHours: 10,
    expiresAt: new Date(Date.now() + 864e5),
    eventData: {},
    company: { certBalance: 5 },
    sessions: [],
    ...overrides,
  } as unknown as EventForAttend;
}

function inlineSelectiveEvent(): EventForAttend {
  return baseEvent({
    eventType: EventType.SELECTIVE_INLINE,
    sessions: [
      { id: "s1", position: 0, name: "Session A", durationHours: 1.5, question: mc(0, "About A?"), course: null },
      { id: "s2", position: 1, name: "Session B", durationHours: 2, question: mc(1, "About B?"), course: null },
      { id: "s3", position: 2, name: "Session C", durationHours: 0.5, question: mc(2, "About C?"), course: null },
    ],
  });
}

function courseSession(id: string, title: string, hours: number, correctIndex: number) {
  return {
    id,
    position: 0,
    name: null,
    durationHours: null,
    question: null,
    course: {
      quizQuestions: [
        { type: "TF", question: "True or false question here?", correctAnswer: "True" },
        mc(correctIndex, `${title}?`),
      ],
      application: { courseTitle: title, ceHours: hours },
    },
  };
}

describe("assembleForSubmit — SELECTIVE_INLINE (lightweight inline sessions)", () => {
  it("assembles attended sessions in selection order with per-session hours and credit", () => {
    const a = assembleForSubmit(inlineSelectiveEvent(), ["s2", "s1"]);
    expect(a).not.toBeNull();
    expect(a!.questions.map((q) => q.question)).toEqual(["About B?", "About A?"]);
    expect(a!.sessionNames).toEqual(["Session B", "Session A"]);
    expect(a!.sessionHours).toEqual([2, 1.5]);
    expect(a!.hours).toBe(3.5);
    expect(a!.attendedSessionIds).toEqual(["s2", "s1"]);
    expect(a!.perSessionCredit).toBe(true);
  });
  it("returns null for an unknown session id or empty selection", () => {
    expect(assembleForSubmit(inlineSelectiveEvent(), ["nope"])).toBeNull();
    expect(assembleForSubmit(inlineSelectiveEvent(), [])).toBeNull();
  });
  it("returns null when a session id is repeated (no double hours)", () => {
    expect(assembleForSubmit(inlineSelectiveEvent(), ["s1", "s1"])).toBeNull();
  });
});

describe("assembleForSubmit — SELECTIVE_INLINE (course-backed back-compat)", () => {
  it("still assembles from the courses' first MC questions, with per-session credit", () => {
    const event = baseEvent({
      eventType: EventType.SELECTIVE_INLINE,
      sessions: [
        courseSession("c1", "Course One", 1, 0),
        courseSession("c2", "Course Two", 2.5, 3),
      ],
    });
    const a = assembleForSubmit(event, ["c1", "c2"]);
    expect(a).not.toBeNull();
    expect(a!.questions.map((q) => q.question)).toEqual(["Course One?", "Course Two?"]);
    expect(a!.sessionHours).toEqual([1, 2.5]);
    expect(a!.hours).toBe(3.5);
    expect(a!.sessionNames).toEqual(["Course One", "Course Two"]);
    expect(a!.perSessionCredit).toBe(true);
  });
});

describe("assembleForSubmit — SELECTIVE_PER_COURSE keeps the overall gate", () => {
  it("assembles with perSessionCredit false and the 0.7 threshold", () => {
    const event = baseEvent({
      eventType: EventType.SELECTIVE_PER_COURSE,
      sessions: [
        courseSession("c1", "Course One", 1, 0),
        courseSession("c2", "Course Two", 2.5, 3),
      ],
    });
    const a = assembleForSubmit(event, ["c1", "c2"]);
    expect(a).not.toBeNull();
    expect(a!.perSessionCredit).toBe(false);
    expect(a!.passPct).toBe(0.7);
    expect(a!.hours).toBe(3.5);
  });
});

describe("buildPublicForm — SELECTIVE_INLINE (lightweight inline sessions)", () => {
  it("lists every session with its title and strips answers", () => {
    const form = buildPublicForm(inlineSelectiveEvent());
    expect(form).not.toBeNull();
    if (!form || form.mode !== "selective") throw new Error("expected selective form");
    expect(form.items.map((i) => i.label)).toEqual(["Session A", "Session B", "Session C"]);
    for (const item of form.items) {
      expect(item.question).not.toHaveProperty("correctIndex");
      expect(item.question).not.toHaveProperty("correctAnswer");
    }
  });
});
