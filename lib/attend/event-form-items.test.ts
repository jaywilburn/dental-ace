import { describe, it, expect } from "vitest";
import {
  activeQuizItems,
  type EventPublicForm,
} from "@/lib/attend/event-form-items";

const q = (question: string): { type: "MC"; question: string; options: string[] } => ({
  type: "MC",
  question,
  options: ["a", "b", "c", "d"],
});

const SELECTIVE: EventPublicForm = {
  mode: "selective",
  items: [
    { id: "s1", label: "Session A", sub: "1.5 hrs", question: q("A?") },
    { id: "s2", label: "Session B", sub: "2.0 hrs", question: q("B?") },
    { id: "s3", label: "Session C", sub: "0.5 hrs", question: q("C?") },
  ],
};

describe("activeQuizItems", () => {
  it("full mode: one item per question, index keys, no session labels", () => {
    const form: EventPublicForm = { mode: "full", questions: [q("1?"), q("2?")] };
    expect(activeQuizItems(form, [])).toEqual([
      { key: "0", label: null, question: q("1?") },
      { key: "1", label: null, question: q("2?") },
    ]);
  });

  it("selective mode: carries each session's label onto its question", () => {
    const items = activeQuizItems(SELECTIVE, ["s1", "s3"]);
    expect(items.map((i) => i.label)).toEqual(["Session A", "Session C"]);
    expect(items.map((i) => i.question.question)).toEqual(["A?", "C?"]);
  });

  it("selective mode: preserves item order regardless of click order", () => {
    // Attendee checked C, then A — submit order must stay A, C so answers[i]
    // lines up with the server's re-assembly from the same ids.
    const items = activeQuizItems(SELECTIVE, ["s3", "s1"]);
    expect(items.map((i) => i.key)).toEqual(["s1", "s3"]);
  });

  it("selective mode: unknown ids and empty selections yield no items", () => {
    expect(activeQuizItems(SELECTIVE, ["nope"])).toEqual([]);
    expect(activeQuizItems(SELECTIVE, [])).toEqual([]);
  });
});
