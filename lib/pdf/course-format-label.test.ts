import { describe, it, expect } from "vitest";
import { courseFormatLabel } from "@/lib/pdf/course-format-label";

describe("courseFormatLabel", () => {
  it("passes the four canonical COURSE_FORMATS values through unchanged", () => {
    expect(courseFormatLabel("LIVE In Person")).toBe("LIVE In Person");
    expect(courseFormatLabel("LIVE Online")).toBe("LIVE Online");
    expect(courseFormatLabel("On Demand Recording")).toBe("On Demand Recording");
    expect(courseFormatLabel("Self Study/Printed")).toBe("Self Study/Printed");
  });

  it("folds the legacy DELIVERY_FORMATS values onto the canonical labels", () => {
    expect(courseFormatLabel("Live/In Person")).toBe("LIVE In Person");
    expect(courseFormatLabel("Live/Online")).toBe("LIVE Online");
    expect(courseFormatLabel("On Demand Video")).toBe("On Demand Recording");
    expect(courseFormatLabel("On Demand Audio")).toBe("On Demand Recording");
    expect(courseFormatLabel("Printed Course")).toBe("Self Study/Printed");
  });

  it("maps the retired/event delivery values", () => {
    expect(courseFormatLabel("Live Event")).toBe("LIVE In Person");
    expect(courseFormatLabel("Live/Virtual")).toBe("LIVE Online");
  });

  it("returns null for empty/missing values so the caller skips the line", () => {
    expect(courseFormatLabel(null)).toBeNull();
    expect(courseFormatLabel(undefined)).toBeNull();
    expect(courseFormatLabel("")).toBeNull();
    expect(courseFormatLabel("   ")).toBeNull();
  });

  it("returns the trimmed raw string for unknown values (never drops data)", () => {
    expect(courseFormatLabel("Hybrid Workshop")).toBe("Hybrid Workshop");
    expect(courseFormatLabel("  Live/In Person  ")).toBe("LIVE In Person");
    expect(courseFormatLabel("  Something Else  ")).toBe("Something Else");
  });
});
