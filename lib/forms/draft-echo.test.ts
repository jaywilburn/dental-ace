import { describe, it, expect } from "vitest";
import {
  sanitizeEcho,
  ECHO_MAX_STRING,
  ECHO_MAX_TOTAL,
} from "@/lib/forms/draft-echo";

describe("sanitizeEcho", () => {
  it("passes an ordinary step slice through untouched", () => {
    const raw = {
      courseTitle: "Implant Basics",
      ceCreditHours: 1.5,
      courseObjectives: "1. A\n2. B",
    };
    expect(sanitizeEcho(raw)).toEqual({ value: raw, truncated: false });
  });

  it("returns an empty slice for non-object input", () => {
    for (const bad of [null, undefined, "str", 5, [1, 2]]) {
      expect(sanitizeEcho(bad)).toEqual({ value: {}, truncated: false });
    }
  });

  describe("JSON safety", () => {
    it("drops non-finite numbers rather than writing SQL null under a number field", () => {
      // JSON.stringify({a: NaN}) is '{"a":null}', which would land as null in
      // JSONB and read back as null on a field the components type as number.
      const { value } = sanitizeEcho({
        ceCreditHours: Number.NaN,
        hours2: Number.POSITIVE_INFINITY,
        good: 2,
      });
      expect(value).toEqual({ good: 2 });
      expect("ceCreditHours" in value).toBe(false);
    });

    it("drops undefined so the JSONB merge reads it as cleared", () => {
      const { value } = sanitizeEcho({ educationPart2: undefined, a: "x" });
      expect(value).toEqual({ a: "x" });
    });

    it("drops values that are not plain JSON", () => {
      const { value } = sanitizeEcho({
        when: new Date(0),
        fn: () => "nope",
        sym: Symbol("s"),
        big: BigInt(10),
        keep: "yes",
      });
      expect(value).toEqual({ keep: "yes" });
    });

    it("keeps booleans and explicit nulls", () => {
      const { value } = sanitizeEcho({ affirmed: false, cleared: null });
      expect(value).toEqual({ affirmed: false, cleared: null });
    });

    it("produces output that round-trips through JSON unchanged", () => {
      const { value } = sanitizeEcho({
        a: Number.NaN,
        b: "text",
        presenters: [{ bio: "x", n: Number.NaN }],
      });
      expect(JSON.parse(JSON.stringify(value))).toEqual(value);
    });
  });

  describe("size clamps", () => {
    it("clamps an oversized string and reports truncation", () => {
      const { value, truncated } = sanitizeEcho({
        courseOutline: "x".repeat(400_000),
      });
      expect((value.courseOutline as string).length).toBe(ECHO_MAX_STRING);
      expect(truncated).toBe(true);
    });

    it("leaves a string at the largest legitimate cap alone", () => {
      // The biggest real write cap is 20,000, well under ECHO_MAX_STRING, so a
      // provider who merely went over always gets their text back to edit.
      const { value, truncated } = sanitizeEcho({ courseOutline: "x".repeat(20_000) });
      expect((value.courseOutline as string).length).toBe(20_000);
      expect(truncated).toBe(false);
    });

    it("sheds the longest fields until the whole slice fits", () => {
      const { value, truncated } = sanitizeEcho({
        big1: "a".repeat(ECHO_MAX_STRING),
        big2: "b".repeat(ECHO_MAX_STRING),
        big3: "c".repeat(ECHO_MAX_STRING),
        big4: "d".repeat(ECHO_MAX_STRING),
        big5: "e".repeat(ECHO_MAX_STRING),
        big6: "f".repeat(ECHO_MAX_STRING),
        big7: "g".repeat(ECHO_MAX_STRING),
        small: "kept",
      });
      expect(JSON.stringify(value).length).toBeLessThanOrEqual(ECHO_MAX_TOTAL);
      expect(value.small).toBe("kept");
      expect(truncated).toBe(true);
    });

    it("caps runaway arrays", () => {
      const { value, truncated } = sanitizeEcho({
        presenters: Array.from({ length: 50 }, (_, i) => ({ name: `P${i}` })),
      });
      expect((value.presenters as unknown[]).length).toBe(16);
      expect(truncated).toBe(true);
    });
  });

  describe("nested shapes", () => {
    it("preserves the presenters array so presenter_0_bio still maps", () => {
      const { value } = sanitizeEcho({
        presenters: [{ name: "Dr. Doe", bio: "Long bio" }],
      });
      expect(value.presenters).toEqual([{ name: "Dr. Doe", bio: "Long bio" }]);
    });

    it("keeps array positions stable when an element is dropped", () => {
      // presenters[0] must stay at index 0 so error paths line up.
      const { value } = sanitizeEcho({ options: ["a", () => {}, "c", "d"] });
      expect(value.options).toEqual(["a", null, "c", "d"]);
    });

    it("clamps strings inside nested objects too", () => {
      const { value, truncated } = sanitizeEcho({
        presenters: [{ bio: "x".repeat(300_000) }],
      });
      const bio = (value.presenters as Array<{ bio: string }>)[0].bio;
      expect(bio.length).toBe(ECHO_MAX_STRING);
      expect(truncated).toBe(true);
    });

    it("keeps the deepest shape the wizards actually post (quiz[i].options[j])", () => {
      const { value } = sanitizeEcho({
        quiz: [{ type: "MC", question: "Q?", options: ["a", "b", "c", "d"], correctIndex: 0 }],
      });
      expect(value).toEqual({
        quiz: [{ type: "MC", question: "Q?", options: ["a", "b", "c", "d"], correctIndex: 0 }],
      });
    });

    it("drops structures deeper than the wizards ever post", () => {
      const { value } = sanitizeEcho({ a: { b: { c: { d: { e: "too deep" } } } } });
      expect(value).toEqual({ a: { b: { c: {} } } });
    });

    it("drops prototype-mutating keys instead of treating them as data", () => {
      const raw = JSON.parse(
        '{"__proto__": {"polluted": true}, "constructor": "x", "ok": "v"}',
      );
      const { value } = sanitizeEcho(raw);
      expect(value.ok).toBe("v");
      expect(Object.keys(value)).toEqual(["ok"]);
      // Neither the result nor anything else picked up the payload.
      expect((value as Record<string, unknown>).polluted).toBeUndefined();
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
      expect(Object.getPrototypeOf(value)).toBe(Object.prototype);
    });
  });
});
