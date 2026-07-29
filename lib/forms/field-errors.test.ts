import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  fieldErrorsFromZod,
  deriveStepErrors,
  FORM_LEVEL_KEY,
} from "@/lib/forms/field-errors";

function errorsFor(schema: z.ZodType, value: unknown) {
  const result = schema.safeParse(value);
  if (result.success) throw new Error("expected a validation failure");
  return fieldErrorsFromZod(result.error);
}

describe("fieldErrorsFromZod", () => {
  it("keys root fields by their own name", () => {
    const schema = z.object({ courseTitle: z.string().max(5, "Too long") });
    expect(errorsFor(schema, { courseTitle: "way too long" })).toEqual({
      courseTitle: ["Too long"],
    });
  });

  it("reports every failing field, not just the first", () => {
    const schema = z.object({
      courseTitle: z.string().min(3, "Title too short"),
      courseObjectives: z.string().max(5, "Objectives too long"),
    });
    expect(errorsFor(schema, { courseTitle: "x", courseObjectives: "aaaaaaaa" })).toEqual({
      courseTitle: ["Title too short"],
      courseObjectives: ["Objectives too long"],
    });
  });

  it("maps a presenter field to its exact input name", () => {
    const schema = z.object({
      presenters: z.array(z.object({ bio: z.string().max(4, "Bio too long") })),
    });
    expect(errorsFor(schema, { presenters: [{ bio: "far too long" }] })).toEqual({
      presenter_0_bio: ["Bio too long"],
    });
  });

  it("keeps array-level presenter errors on the array key", () => {
    const schema = z.object({
      presenters: z.array(z.object({})).min(1, "Add at least one presenter."),
    });
    expect(errorsFor(schema, { presenters: [] })).toEqual({
      presenters: ["Add at least one presenter."],
    });
  });

  it("maps quiz paths to the 1-based question inputs", () => {
    const schema = z.object({
      quiz: z.array(
        z.object({
          question: z.string().min(5, "Question too short"),
          options: z.array(z.string().min(1, "Answer needs text")).optional(),
          correctAnswer: z.string().min(1, "Pick an answer").optional(),
        }),
      ),
    });
    const errors = errorsFor(schema, {
      quiz: [
        { question: "hi", correctAnswer: "" },
        { question: "long enough" },
        { question: "long enough", options: ["ok", ""] },
      ],
    });
    expect(errors.q1_question).toEqual(["Question too short"]);
    expect(errors.q1_correct).toEqual(["Pick an answer"]);
    expect(errors.q3_option_1).toEqual(["Answer needs text"]);
  });

  it("maps a root MC question's options to option_N", () => {
    const schema = z.object({
      question: z.string().min(5, "Too short"),
      options: z.array(z.string().min(1, "Answer needs text")),
    });
    expect(errorsFor(schema, { question: "ok question", options: ["a", "", "c", "d"] })).toEqual({
      option_1: ["Answer needs text"],
    });
  });

  it("buckets schema-level refinements under the form key", () => {
    const schema = z
      .object({ a: z.string(), b: z.string() })
      .refine((v) => v.a !== v.b, "Answers must differ");
    expect(errorsFor(schema, { a: "x", b: "x" })).toEqual({
      [FORM_LEVEL_KEY]: ["Answers must differ"],
    });
  });

  it("de-dupes identical messages on the same field", () => {
    const schema = z.object({
      courseTitle: z
        .string()
        .refine(() => false, "Nope")
        .refine(() => false, "Nope"),
    });
    expect(errorsFor(schema, { courseTitle: "x" })).toEqual({ courseTitle: ["Nope"] });
  });
});

/*
  Why this module exists instead of z.flattenError. flattenError buckets by
  path[0], so a presenter field error collapses onto the "presenters" key and
  there is no way to place it on the right input, or to tell the provider which
  of the six presenter fields is wrong.
*/
describe("regression: z.flattenError cannot place nested errors", () => {
  const schema = z.object({
    presenters: z.array(z.object({ bio: z.string().max(4, "Bio too long") })),
  });
  const result = schema.safeParse({ presenters: [{ bio: "far too long" }] });

  it("loses the index and the field name", () => {
    if (result.success) throw new Error("expected a failure");
    const flat = z.flattenError(result.error).fieldErrors as Record<string, string[]>;
    expect(Object.keys(flat)).not.toContain("presenter_0_bio");
  });

  it("while our walker keeps both", () => {
    if (result.success) throw new Error("expected a failure");
    expect(fieldErrorsFromZod(result.error)).toEqual({
      presenter_0_bio: ["Bio too long"],
    });
  });
});

describe("deriveStepErrors", () => {
  const schema = z.object({ courseTitle: z.string().min(3, "Title too short") });

  it("returns errors for an invalid draft", () => {
    expect(deriveStepErrors(schema, { courseTitle: "x" })).toEqual({
      courseTitle: ["Title too short"],
    });
  });

  // This is what makes a stale ?error=validation in browser history harmless:
  // the page re-parses the CURRENT draft, so a since-fixed step shows nothing.
  it("returns an empty map once the draft is valid again", () => {
    expect(deriveStepErrors(schema, { courseTitle: "Implant Basics" })).toEqual({});
  });
});
