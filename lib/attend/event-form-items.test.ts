import { describe, it, expect } from "vitest";
import {
  activeQuizItems,
  selectedHoursTotal,
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
    { id: "s1", label: "Session A", sub: "1.5 CE hours", hours: 1.5, question: q("A?") },
    { id: "s2", label: "Session B", sub: "2 CE hours", hours: 2, question: q("B?") },
    { id: "s3", label: "Session C", sub: "0.5 CE hours", hours: 0.5, question: q("C?") },
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

  it("selective mode: carries presenter names through, omitting them when absent", () => {
    const form: EventPublicForm = {
      mode: "selective",
      items: [
        { ...SELECTIVE.items[0], presenters: ["Dr. Lead", "Dr. Co"] },
        SELECTIVE.items[1],
        { ...SELECTIVE.items[2], presenters: [] },
      ],
    };
    const items = activeQuizItems(form, ["s1", "s2", "s3"]);
    expect(items[0].presenters).toEqual(["Dr. Lead", "Dr. Co"]);
    expect(items[1]).not.toHaveProperty("presenters");
    expect(items[2]).not.toHaveProperty("presenters");
  });

  it("selective mode: carries each session's hours, omitting them when unknown", () => {
    const form: EventPublicForm = {
      mode: "selective",
      items: [SELECTIVE.items[0], { id: "s4", label: "Session D", sub: "? CE hours", question: q("D?") }],
    };
    const items = activeQuizItems(form, ["s1", "s4"]);
    expect(items[0].hours).toBe(1.5);
    expect(items[1]).not.toHaveProperty("hours");
  });

  it("full mode: items carry no hours", () => {
    const form: EventPublicForm = { mode: "full", questions: [q("1?")] };
    expect(activeQuizItems(form, [])[0]).not.toHaveProperty("hours");
  });

  it("selective mode: unknown ids and empty selections yield no items", () => {
    expect(activeQuizItems(SELECTIVE, ["nope"])).toEqual([]);
    expect(activeQuizItems(SELECTIVE, [])).toEqual([]);
  });
});

describe("selectedHoursTotal", () => {
  it("sums the selected sessions' hours (the maximum available)", () => {
    expect(selectedHoursTotal(activeQuizItems(SELECTIVE, ["s1", "s3"]))).toBe(2);
    expect(selectedHoursTotal(activeQuizItems(SELECTIVE, ["s1", "s2", "s3"]))).toBe(4);
  });

  it("treats unknown hours as zero and an empty selection as zero", () => {
    expect(selectedHoursTotal([{ key: "x", label: "X", question: q("X?") }])).toBe(0);
    expect(selectedHoursTotal([])).toBe(0);
  });
});
