import { describe, it, expect } from "vitest";
import { EventType } from "@prisma/client";
import {
  deriveEventType,
  isEventOnly,
  isSelective,
  isPerCourse,
  isInlineFullCourse,
  inlineSessionSchema,
  inlineSessionsSchema,
} from "@/lib/forms/event/schemas";

describe("deriveEventType", () => {
  it("maps the two qualifier answers to the four types", () => {
    expect(deriveEventType("FULL", "EVENT_ONLY")).toBe(EventType.FULL_EVENT_QUIZ);
    expect(deriveEventType("FULL", "PER_COURSE")).toBe(EventType.FULL_PER_COURSE);
    expect(deriveEventType("SELECTIVE", "EVENT_ONLY")).toBe(EventType.SELECTIVE_INLINE);
    expect(deriveEventType("SELECTIVE", "PER_COURSE")).toBe(EventType.SELECTIVE_PER_COURSE);
  });
});

describe("type predicates", () => {
  it("isEventOnly is true for the single-application types (consume a credit)", () => {
    expect(isEventOnly(EventType.FULL_EVENT_QUIZ)).toBe(true);
    expect(isEventOnly(EventType.SELECTIVE_INLINE)).toBe(true);
    expect(isEventOnly(EventType.FULL_PER_COURSE)).toBe(false);
    expect(isEventOnly(EventType.SELECTIVE_PER_COURSE)).toBe(false);
  });
  it("isSelective is true for the session-selection types", () => {
    expect(isSelective(EventType.SELECTIVE_INLINE)).toBe(true);
    expect(isSelective(EventType.SELECTIVE_PER_COURSE)).toBe(true);
    expect(isSelective(EventType.FULL_EVENT_QUIZ)).toBe(false);
  });
  it("isPerCourse is true for the reused types", () => {
    expect(isPerCourse(EventType.FULL_PER_COURSE)).toBe(true);
    expect(isPerCourse(EventType.SELECTIVE_PER_COURSE)).toBe(true);
    expect(isPerCourse(EventType.SELECTIVE_INLINE)).toBe(false);
  });
  it("isInlineFullCourse is FULL_EVENT_QUIZ only (SELECTIVE_INLINE is lightweight)", () => {
    expect(isInlineFullCourse(EventType.FULL_EVENT_QUIZ)).toBe(true);
    expect(isInlineFullCourse(EventType.SELECTIVE_INLINE)).toBe(false);
    expect(isInlineFullCourse(EventType.FULL_PER_COURSE)).toBe(false);
    expect(isInlineFullCourse(EventType.SELECTIVE_PER_COURSE)).toBe(false);
  });
});

describe("inlineSessionSchema", () => {
  const base = {
    name: "Intro to Sedation",
    durationHours: 1.5,
    question: { type: "MC", question: "What is X?", options: ["a", "b", "c", "d"], correctIndex: 1 },
  };
  it("accepts a valid 0.5-increment session", () => {
    expect(inlineSessionSchema.safeParse(base).success).toBe(true);
  });
  it("rejects a non-half-hour duration", () => {
    expect(inlineSessionSchema.safeParse({ ...base, durationHours: 1.25 }).success).toBe(false);
  });
  it("rejects a question without exactly 4 options", () => {
    expect(
      inlineSessionSchema.safeParse({
        ...base,
        question: { ...base.question, options: ["a", "b", "c"] },
      }).success,
    ).toBe(false);
    expect(
      inlineSessionSchema.safeParse({
        ...base,
        question: { ...base.question, options: ["a", "b", "c", "d", "e"] },
      }).success,
    ).toBe(false);
  });
  it("rejects a blank answer option", () => {
    expect(
      inlineSessionSchema.safeParse({
        ...base,
        question: { ...base.question, options: ["a", "", "c", "d"] },
      }).success,
    ).toBe(false);
  });
  it("rejects an out-of-range or non-integer correct index", () => {
    for (const correctIndex of [4, -1, 1.5]) {
      expect(
        inlineSessionSchema.safeParse({
          ...base,
          question: { ...base.question, correctIndex },
        }).success,
      ).toBe(false);
    }
    for (const correctIndex of [0, 3]) {
      expect(
        inlineSessionSchema.safeParse({
          ...base,
          question: { ...base.question, correctIndex },
        }).success,
      ).toBe(true);
    }
  });
  it("rejects a blank or too-short question", () => {
    expect(
      inlineSessionSchema.safeParse({
        ...base,
        question: { ...base.question, question: "" },
      }).success,
    ).toBe(false);
    expect(
      inlineSessionSchema.safeParse({
        ...base,
        question: { ...base.question, question: "Why?" },
      }).success,
    ).toBe(false);
  });
});

describe("inlineSessionsSchema", () => {
  const session = {
    name: "Intro to Sedation",
    durationHours: 1.5,
    question: { type: "MC", question: "What is X?", options: ["a", "b", "c", "d"], correctIndex: 1 },
  };
  it("requires at least one session and caps at 20", () => {
    expect(inlineSessionsSchema.safeParse({ sessions: [] }).success).toBe(false);
    expect(inlineSessionsSchema.safeParse({ sessions: [session] }).success).toBe(true);
    expect(
      inlineSessionsSchema.safeParse({ sessions: Array.from({ length: 21 }, () => session) })
        .success,
    ).toBe(false);
  });
});
