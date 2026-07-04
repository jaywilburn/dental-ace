import { describe, it, expect } from "vitest";
import { splitName } from "./name-split";

describe("splitName", () => {
  it("splits first token / rest", () => {
    expect(splitName("Krystal Youmans")).toEqual({ firstName: "Krystal", lastName: "Youmans" });
    expect(splitName("Mary Jo Van Buren")).toEqual({ firstName: "Mary", lastName: "Jo Van Buren" });
  });
  it("single token -> first only", () => {
    expect(splitName("Cher")).toEqual({ firstName: "Cher", lastName: null });
  });
  it("collapses extra whitespace", () => {
    expect(splitName("  Jon   Pyle  ")).toEqual({ firstName: "Jon", lastName: "Pyle" });
  });
  it("empty / null -> nulls", () => {
    expect(splitName("")).toEqual({ firstName: null, lastName: null });
    expect(splitName(null)).toEqual({ firstName: null, lastName: null });
    expect(splitName("   ")).toEqual({ firstName: null, lastName: null });
  });
});
