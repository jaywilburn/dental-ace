import { describe, it, expect } from "vitest";
import { courseFormatLabel } from "@/lib/pdf/course-format-label";

describe("courseFormatLabel", () => {
  it("maps the current DELIVERY_FORMATS values to display buckets", () => {
    expect(courseFormatLabel("Live/In Person")).toBe("LIVE In Person");
    expect(courseFormatLabel("Live/Online")).toBe("LIVE Online (Webinar, Zoom, etc)");
    expect(courseFormatLabel("On Demand Video")).toBe("On-Demand");
    expect(courseFormatLabel("On Demand Audio")).toBe("On-Demand");
    expect(courseFormatLabel("Printed Course")).toBe("Self Study/Written");
  });

  it("maps the retired/event delivery values", () => {
    expect(courseFormatLabel("Live Event")).toBe("LIVE In Person");
    expect(courseFormatLabel("Live/Virtual")).toBe("LIVE Online (Webinar, Zoom, etc)");
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
