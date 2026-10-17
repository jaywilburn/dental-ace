import { describe, it, expect } from "vitest";
import { csvField, csvLine } from "@/lib/csv";

describe("csvField", () => {
  it("quotes plain values", () => {
    expect(csvField("Jane Doe")).toBe('"Jane Doe"');
    expect(csvField("")).toBe('""');
  });

  it("doubles embedded quotes and keeps commas and newlines inside the quotes", () => {
    expect(csvField('Say "hi", then\nleave')).toBe('"Say ""hi"", then\nleave"');
  });

  it.each(["=SUM(A1)", "+1", "-1", "@cmd", "\t=1", "\r=1"])(
    "neutralises a leading formula character in %j",
    (v) => {
      expect(csvField(v)).toBe(`"'${v}"`);
    },
  );

  it("leaves formula characters alone when they are not leading", () => {
    expect(csvField("a=b")).toBe('"a=b"');
    expect(csvField(" =1")).toBe('" =1"');
  });
});

describe("csvLine", () => {
  it("joins escaped fields with commas", () => {
    expect(csvLine(["a", "=b", 'c"d'])).toBe('"a","\'=b","c""d"');
  });
});
