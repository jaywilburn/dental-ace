import { describe, it, expect } from "vitest";
import { appendCopiedQuestions, stripSurveyQuestionId, type CopiedSurveyQuestion } from "@/lib/events/survey-copy";
import type { SurveyQuestion } from "@/lib/events/survey-schemas";

const ID1 = "11111111-1111-4111-8111-111111111111";
const ID2 = "22222222-2222-4222-8222-222222222222";
const ID3 = "33333333-3333-4333-8333-333333333333";

const single: SurveyQuestion = {
  id: ID1,
  type: "SINGLE_CHOICE",
  prompt: "Overall satisfaction",
  required: true,
  options: ["Very satisfied", "Satisfied", "Unsatisfied"],
};
const multi: SurveyQuestion = {
  id: ID2,
  type: "MULTI_CHOICE",
  prompt: "Participation",
  required: false,
  options: ["Sessions", "Networking"],
};
const long: SurveyQuestion = { id: ID3, type: "LONG_TEXT", prompt: "Comments", required: false };

const identity = (q: CopiedSurveyQuestion) => q;

describe("stripSurveyQuestionId", () => {
  it("drops the id and keeps type, prompt, required and options", () => {
    expect(stripSurveyQuestionId(single)).toEqual({
      type: "SINGLE_CHOICE",
      prompt: "Overall satisfaction",
      required: true,
      options: ["Very satisfied", "Satisfied", "Unsatisfied"],
    });
    expect(stripSurveyQuestionId(long)).toEqual({ type: "LONG_TEXT", prompt: "Comments", required: false });
    expect("id" in stripSurveyQuestionId(multi)).toBe(false);
  });

  it("copies the options array instead of sharing it with the source", () => {
    const copy = stripSurveyQuestionId(single);
    expect("options" in copy && copy.options).not.toBe(single.options);
  });
});

describe("appendCopiedQuestions", () => {
  it("appends the source after the current list, in source order", () => {
    const current = [{ key: "a" }, { key: "b" }];
    const result = appendCopiedQuestions(current, [long, single, multi], 40, (q) => ({
      key: q.prompt,
    }));
    expect(result).toEqual({
      ok: true,
      added: 3,
      list: [{ key: "a" }, { key: "b" }, { key: "Comments" }, { key: "Overall satisfaction" }, { key: "Participation" }],
    });
  });

  it("never passes a source id to the new items", () => {
    const result = appendCopiedQuestions([], [single, multi, long], 40, identity);
    if (!result.ok) throw new Error("expected ok");
    for (const q of result.list) expect("id" in q).toBe(false);
  });

  it("does not mutate the current list", () => {
    const current = [stripSurveyQuestionId(long)];
    appendCopiedQuestions(current, [single], 40, identity);
    expect(current).toHaveLength(1);
  });

  it("adds everything when the result lands exactly on the cap", () => {
    const current = Array.from({ length: 37 }, () => stripSurveyQuestionId(long));
    const result = appendCopiedQuestions(current, [single, multi, long], 40, identity);
    expect(result.ok && result.list.length).toBe(40);
  });

  it("adds nothing past the cap and reports how many fit", () => {
    const current = Array.from({ length: 38 }, () => stripSurveyQuestionId(long));
    expect(appendCopiedQuestions(current, [single, multi, long], 40, identity)).toEqual({
      ok: false,
      room: 2,
      needed: 3,
    });
  });

  it("reports zero room when the list is already over the cap", () => {
    const current = Array.from({ length: 41 }, () => stripSurveyQuestionId(long));
    expect(appendCopiedQuestions(current, [single], 40, identity)).toEqual({
      ok: false,
      room: 0,
      needed: 1,
    });
  });
});
