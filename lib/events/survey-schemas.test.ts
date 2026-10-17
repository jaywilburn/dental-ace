import { describe, it, expect } from "vitest";
import {
  SURVEY_FORM_KEY,
  SURVEY_MAX_QUESTIONS,
  eventSurveySchema,
  normalizeSurveyInput,
  parseStoredSurvey,
  parseStoredSurveyResponses,
  surveyErrorKey,
  surveyVersion,
  validateSurveyResponses,
  type SurveyQuestion,
} from "@/lib/events/survey-schemas";

const ID1 = "11111111-1111-4111-8111-111111111111";
const ID2 = "22222222-2222-4222-8222-222222222222";
const ID3 = "33333333-3333-4333-8333-333333333333";
const ID4 = "44444444-4444-4444-8444-444444444444";

const single: SurveyQuestion = {
  id: ID1,
  type: "SINGLE_CHOICE",
  prompt: "Overall satisfaction",
  required: true,
  options: ["Great", "Fine", "Poor"],
};
const multi: SurveyQuestion = {
  id: ID2,
  type: "MULTI_CHOICE",
  prompt: "Participation",
  required: false,
  options: ["In person", "Virtual", "Recorded"],
};
const short: SurveyQuestion = { id: ID3, type: "SHORT_TEXT", prompt: "Your role", required: true };
const long: SurveyQuestion = { id: ID4, type: "LONG_TEXT", prompt: "Comments", required: false };
const DEF = [single, multi, short, long];

/** Deterministic id generator for normalizeSurveyInput. */
function ids() {
  let n = 0;
  return () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
}

describe("eventSurveySchema", () => {
  it("accepts a valid survey of every type", () => {
    expect(eventSurveySchema.safeParse(DEF).success).toBe(true);
  });

  it("accepts an empty survey", () => {
    expect(eventSurveySchema.safeParse([]).success).toBe(true);
  });

  it("caps the survey at 40 questions", () => {
    const make = (i: number): SurveyQuestion => ({
      id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      type: "SHORT_TEXT",
      prompt: `Q${i}`,
      required: false,
    });
    const at = Array.from({ length: SURVEY_MAX_QUESTIONS }, (_, i) => make(i));
    expect(eventSurveySchema.safeParse(at).success).toBe(true);
    expect(eventSurveySchema.safeParse([...at, make(99)]).success).toBe(false);
  });

  it("rejects duplicate ids", () => {
    expect(eventSurveySchema.safeParse([short, { ...long, id: ID3 }]).success).toBe(false);
  });

  it("rejects a blank or too-long prompt", () => {
    expect(eventSurveySchema.safeParse([{ ...short, prompt: "   " }]).success).toBe(false);
    expect(eventSurveySchema.safeParse([{ ...short, prompt: "x".repeat(501) }]).success).toBe(false);
    expect(eventSurveySchema.safeParse([{ ...short, prompt: "x".repeat(500) }]).success).toBe(true);
  });

  it("requires 2 to 20 options on choice questions", () => {
    expect(eventSurveySchema.safeParse([{ ...single, options: ["Only"] }]).success).toBe(false);
    const twenty = Array.from({ length: 20 }, (_, i) => `Opt ${i}`);
    expect(eventSurveySchema.safeParse([{ ...single, options: twenty }]).success).toBe(true);
    expect(eventSurveySchema.safeParse([{ ...single, options: [...twenty, "One more"] }]).success).toBe(false);
  });

  it("rejects blank, too-long and case-insensitive duplicate options", () => {
    expect(eventSurveySchema.safeParse([{ ...single, options: ["Yes", " "] }]).success).toBe(false);
    expect(eventSurveySchema.safeParse([{ ...single, options: ["Yes", "x".repeat(201)] }]).success).toBe(false);
    expect(eventSurveySchema.safeParse([{ ...single, options: ["Yes", "yes"] }]).success).toBe(false);
    expect(eventSurveySchema.safeParse([{ ...single, options: ["Yes", " YES "] }]).success).toBe(false);
  });

  it("strips options from text questions", () => {
    const parsed = eventSurveySchema.parse([{ ...short, options: ["a", "b"] }]);
    expect(parsed[0]).not.toHaveProperty("options");
  });

  it("rejects an unknown type", () => {
    expect(eventSurveySchema.safeParse([{ ...short, type: "RATING" }]).success).toBe(false);
  });
});

describe("normalizeSurveyInput", () => {
  it("assigns ids to new questions", () => {
    const res = normalizeSurveyInput(
      [{ type: "SHORT_TEXT", prompt: "Role", required: true }],
      [],
      ids(),
    );
    expect(res).toEqual({
      ok: true,
      questions: [
        { id: "00000000-0000-4000-8000-000000000001", type: "SHORT_TEXT", prompt: "Role", required: true },
      ],
    });
  });

  it("uses crypto.randomUUID by default", () => {
    const res = normalizeSurveyInput([{ type: "LONG_TEXT", prompt: "Notes", required: false }], []);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.questions[0].id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("keeps the id of an existing question whose type is unchanged", () => {
    const res = normalizeSurveyInput([{ ...single, prompt: "Edited prompt" }], DEF, ids());
    expect(res.ok && res.questions[0]).toMatchObject({ id: ID1, prompt: "Edited prompt" });
  });

  it("re-ids a question whose type changed", () => {
    const res = normalizeSurveyInput(
      [{ id: ID3, type: "LONG_TEXT", prompt: "Your role", required: true }],
      DEF,
      ids(),
    );
    expect(res.ok && res.questions[0].id).toBe("00000000-0000-4000-8000-000000000001");
  });

  it("re-ids a question switched between the two choice types", () => {
    const res = normalizeSurveyInput([{ ...single, type: "MULTI_CHOICE" }], DEF, ids());
    expect(res.ok && res.questions[0].id).not.toBe(ID1);
  });

  it("never keeps an id the server did not issue", () => {
    const forged = "99999999-9999-4999-8999-999999999999";
    const res = normalizeSurveyInput([{ ...short, id: forged }], DEF, ids());
    expect(res.ok && res.questions[0].id).not.toBe(forged);
  });

  it("gives a duplicated id to the first question only", () => {
    const res = normalizeSurveyInput([short, { ...short, prompt: "Copy" }], DEF, ids());
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.questions[0].id).toBe(ID3);
      expect(res.questions[1].id).not.toBe(ID3);
    }
  });

  it("keeps question order", () => {
    const res = normalizeSurveyInput([long, short, single], DEF, ids());
    expect(res.ok && res.questions.map((q) => q.id)).toEqual([ID4, ID3, ID1]);
  });

  it("trims prompts and options", () => {
    const res = normalizeSurveyInput(
      [{ type: "SINGLE_CHOICE", prompt: "  Pick  ", required: true, options: [" A ", "B "] }],
      [],
      ids(),
    );
    expect(res.ok && res.questions[0]).toMatchObject({ prompt: "Pick", options: ["A", "B"] });
  });

  it("accepts the JSON string a hidden input posts", () => {
    const res = normalizeSurveyInput(JSON.stringify([short]), DEF, ids());
    expect(res.ok && res.questions[0].id).toBe(ID3);
  });

  it("reports unparseable JSON on the form key", () => {
    const res = normalizeSurveyInput("[not json", DEF, ids());
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors[SURVEY_FORM_KEY]).toBeDefined();
  });

  it("reports a non-array payload on the form key", () => {
    const res = normalizeSurveyInput({ questions: [] }, DEF, ids());
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors[SURVEY_FORM_KEY]).toBeDefined();
  });

  it("reports the 40-question cap on the form key", () => {
    const many = Array.from({ length: SURVEY_MAX_QUESTIONS + 1 }, () => ({
      type: "SHORT_TEXT",
      prompt: "Q",
      required: false,
    }));
    const res = normalizeSurveyInput(many, [], ids());
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors[SURVEY_FORM_KEY]?.[0]).toMatch(/up to 40/);
  });

  it("keys field errors by question index and field", () => {
    const res = normalizeSurveyInput(
      [
        short,
        { type: "SINGLE_CHOICE", prompt: "", required: true, options: ["A", "a"] },
        { type: "MULTI_CHOICE", prompt: "Pick", required: true, options: ["Only"] },
      ],
      DEF,
      ids(),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.errors["1.prompt"]).toEqual(["Enter the question text."]);
      expect(res.errors["1.options.1"]).toEqual(["Each option must be different."]);
      expect(res.errors["2.options"]?.[0]).toMatch(/at least 2/);
      expect(res.errors["0.prompt"]).toBeUndefined();
    }
  });

  it("reports a missing or unknown type on that question", () => {
    const res = normalizeSurveyInput([{ prompt: "No type", required: true }], [], ids());
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors["0.type"]).toEqual(["Choose a question type."]);
    const unknown = normalizeSurveyInput([{ type: "RATING", prompt: "P", required: true }], [], ids());
    expect(!unknown.ok && unknown.errors["0.type"]).toEqual(["Choose a question type."]);
  });
});

describe("parseStoredSurvey", () => {
  it("returns the stored questions", () => {
    expect(parseStoredSurvey(DEF)).toEqual(DEF);
  });
  it("returns [] for null and malformed data", () => {
    expect(parseStoredSurvey(null)).toEqual([]);
    expect(parseStoredSurvey(undefined)).toEqual([]);
    expect(parseStoredSurvey({})).toEqual([]);
    expect(parseStoredSurvey([{ type: "SHORT_TEXT" }])).toEqual([]);
  });
});

describe("parseStoredSurveyResponses", () => {
  it("returns stored snapshots and [] for bad data", () => {
    const rows = [{ questionId: ID1, type: "SINGLE_CHOICE", prompt: "P", value: "Great" }];
    expect(parseStoredSurveyResponses(rows)).toEqual(rows);
    expect(parseStoredSurveyResponses(null)).toEqual([]);
    expect(parseStoredSurveyResponses([{ questionId: ID1 }])).toEqual([]);
  });
});

describe("validateSurveyResponses", () => {
  const complete = {
    [ID1]: "Fine",
    [ID2]: ["Recorded", "In person"],
    [ID3]: "  Hygienist ",
    [ID4]: "Loved it",
  };

  it("builds snapshots in survey order", () => {
    expect(validateSurveyResponses(DEF, complete)).toEqual({
      ok: true,
      responses: [
        { questionId: ID1, type: "SINGLE_CHOICE", prompt: "Overall satisfaction", value: "Fine" },
        // Multi-choice values are stored in option order, not click order.
        { questionId: ID2, type: "MULTI_CHOICE", prompt: "Participation", value: ["In person", "Recorded"] },
        { questionId: ID3, type: "SHORT_TEXT", prompt: "Your role", value: "Hygienist" },
        { questionId: ID4, type: "LONG_TEXT", prompt: "Comments", value: "Loved it" },
      ],
    });
  });

  it("leaves unanswered optional questions out", () => {
    const res = validateSurveyResponses(DEF, { [ID1]: "Great", [ID2]: [], [ID3]: "DA", [ID4]: "   " });
    expect(res.ok && res.responses.map((r) => r.questionId)).toEqual([ID1, ID3]);
  });

  it("flags every missing required answer by question id", () => {
    const res = validateSurveyResponses(DEF, { [ID1]: "", [ID3]: " " });
    expect(res).toEqual({
      ok: false,
      errors: { [ID1]: ["This question is required."], [ID3]: ["This question is required."] },
    });
  });

  it("treats an omitted required multi-choice answer as missing", () => {
    const res = validateSurveyResponses([{ ...multi, required: true }], {});
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors[ID2]).toEqual(["This question is required."]);
  });

  it("rejects a single-choice value that is not a current option", () => {
    const res = validateSurveyResponses([single], { [ID1]: "great" });
    expect(res.ok).toBe(false);
  });

  it("rejects a multi-choice value outside the options", () => {
    const res = validateSurveyResponses([multi], { [ID2]: ["Virtual", "Phone"] });
    expect(res.ok).toBe(false);
  });

  it("rejects a repeated multi-choice value", () => {
    const res = validateSurveyResponses([multi], { [ID2]: ["Virtual", "Virtual"] });
    expect(res.ok).toBe(false);
  });

  it("rejects the wrong value shape for a question type", () => {
    expect(validateSurveyResponses([multi], { [ID2]: "Virtual" }).ok).toBe(false);
    expect(validateSurveyResponses([single], { [ID1]: ["Great"] }).ok).toBe(false);
    expect(validateSurveyResponses([short], { [ID3]: ["DA"] }).ok).toBe(false);
  });

  it("enforces the 500 / 5000 character text limits", () => {
    expect(validateSurveyResponses([short], { [ID3]: "x".repeat(500) }).ok).toBe(true);
    expect(validateSurveyResponses([short], { [ID3]: "x".repeat(501) }).ok).toBe(false);
    expect(validateSurveyResponses([long], { [ID4]: "x".repeat(5000) }).ok).toBe(true);
    // Over 5000 fails the transport schema itself.
    const over = validateSurveyResponses([long], { [ID4]: "x".repeat(5001) });
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.errors[SURVEY_FORM_KEY]).toBeDefined();
  });

  it("ignores answers to questions no longer in the survey", () => {
    const res = validateSurveyResponses([short], { [ID3]: "DA", [ID1]: "Great" });
    expect(res.ok && res.responses).toHaveLength(1);
  });

  it("rejects a malformed payload on the form key", () => {
    for (const bad of ["text", 5, [1, 2], { [ID1]: 5 }]) {
      const res = validateSurveyResponses(DEF, bad);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.errors[SURVEY_FORM_KEY]).toBeDefined();
    }
  });

  it("treats a missing payload as no answers", () => {
    expect(validateSurveyResponses([long], undefined)).toEqual({ ok: true, responses: [] });
    expect(validateSurveyResponses([], undefined)).toEqual({ ok: true, responses: [] });
  });

  it("does not read inherited object keys as answers", () => {
    const res = validateSurveyResponses(
      [{ ...short, id: "toString" as unknown as string }],
      {},
    );
    expect(res.ok).toBe(false);
  });
});

describe("surveyVersion", () => {
  const text: SurveyQuestion = { id: ID3, type: "LONG_TEXT", prompt: "Comments", required: false };

  it("is a stable 8-character hex fingerprint", () => {
    const v = surveyVersion([single, multi, text]);
    expect(v).toMatch(/^[0-9a-f]{8}$/);
    expect(surveyVersion([single, multi, text])).toBe(v);
    // Key order of the stored JSON does not matter, only the values.
    const reordered = { options: single.options, required: true, prompt: single.prompt, type: single.type, id: ID1 } as SurveyQuestion;
    expect(surveyVersion([reordered, multi, text])).toBe(v);
  });

  it("changes with anything the attendee sees", () => {
    const base = surveyVersion([single, text]);
    expect(surveyVersion([{ ...single, options: ["Great", "Fine"] }, text])).not.toBe(base);
    expect(surveyVersion([{ ...single, prompt: "Satisfaction" }, text])).not.toBe(base);
    expect(surveyVersion([{ ...single, required: false }, text])).not.toBe(base);
    expect(surveyVersion([text, single])).not.toBe(base);
    expect(surveyVersion([single])).not.toBe(base);
    expect(surveyVersion([])).not.toBe(base);
  });
});

describe("surveyErrorKey", () => {
  it("keys a question error under the survey form key", () => {
    expect(surveyErrorKey(ID1)).toBe(`${SURVEY_FORM_KEY}.${ID1}`);
  });
});
