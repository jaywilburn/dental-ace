import { describe, it, expect } from "vitest";
import { formatCeHours } from "@/lib/attend/format-ce-hours";

describe("formatCeHours", () => {
  it("uses the singular for exactly one hour", () => {
    expect(formatCeHours(1)).toBe("1 CE hour");
  });

  it("drops a trailing .0 and pluralizes whole numbers", () => {
    expect(formatCeHours(2)).toBe("2 CE hours");
    expect(formatCeHours(8)).toBe("8 CE hours");
  });

  it("keeps one decimal for half hours", () => {
    expect(formatCeHours(1.5)).toBe("1.5 CE hours");
    expect(formatCeHours(0.5)).toBe("0.5 CE hours");
  });

  it("pluralizes zero", () => {
    expect(formatCeHours(0)).toBe("0 CE hours");
  });

  it("renders a placeholder for missing or invalid values", () => {
    expect(formatCeHours(null)).toBe("? CE hours");
    expect(formatCeHours(undefined)).toBe("? CE hours");
    expect(formatCeHours(Number.NaN)).toBe("? CE hours");
    expect(formatCeHours(-1)).toBe("? CE hours");
  });
});
