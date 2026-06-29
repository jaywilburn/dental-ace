import { describe, it, expect } from "vitest";
import { EventType } from "@prisma/client";
import {
  deriveEventType,
  isEventOnly,
  isSelective,
  isPerCourse,
  inlineSessionSchema,
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
  });
});
