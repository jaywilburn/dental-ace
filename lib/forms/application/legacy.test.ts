import { describe, expect, it } from "vitest";
import {
  isLegacyApplicationData,
  legacyCourseRows,
} from "@/lib/forms/application/legacy";

/*
  Legacy-migration helpers behind the "no application on file" panels on the
  company and reviewer application detail pages. Detection must match ONLY the
  migration stub (legacy: true), never a real submission, and the course-record
  rows must render whatever real column data exists without blank rows.
*/

describe("isLegacyApplicationData", () => {
  it("matches the migration stub written by scripts/migrate-legacy.ts", () => {
    expect(
      isLegacyApplicationData({
        legacy: true,
        legacyCourseId: "TX-0042",
        source: "legacy-migration-v3",
      }),
    ).toBe(true);
  });

  it("matches a bare legacy marker", () => {
    expect(isLegacyApplicationData({ legacy: true })).toBe(true);
  });

  it("rejects a real application payload", () => {
    expect(
      isLegacyApplicationData({
        courseTitle: "Modern Periodontal Therapy",
        ceCreditHours: 2.5,
        quiz: [],
      }),
    ).toBe(false);
  });

  it("rejects non-true legacy markers and non-objects", () => {
    expect(isLegacyApplicationData({ legacy: false })).toBe(false);
    expect(isLegacyApplicationData({ legacy: "true" })).toBe(false);
    expect(isLegacyApplicationData(null)).toBe(false);
    expect(isLegacyApplicationData(undefined)).toBe(false);
    expect(isLegacyApplicationData("legacy")).toBe(false);
    expect(isLegacyApplicationData([])).toBe(false);
  });
});

describe("legacyCourseRows", () => {
  const full = {
    courseTitle: "Infection Control Update",
    ceHours: 2,
    courseType: "Clinical",
    deliveryMethod: "On Demand Video",
    status: "APPROVED",
    approvedAt: new Date("2024-06-15T12:00:00Z"),
    courseIdNumber: "ACE-LEG-00042",
  };

  it("renders every populated column as a row", () => {
    const rows = legacyCourseRows(full);
    expect(rows).toEqual([
      { label: "Course Title", value: "Infection Control Update", full: true },
      { label: "Course ID", value: "ACE-LEG-00042" },
      { label: "CE Credit Hours", value: "2.0 hours" },
      { label: "Course Type", value: "Clinical" },
      { label: "Delivery Method", value: "On Demand Video" },
      { label: "Status", value: "Approved" },
      { label: "Approved", value: "June 15, 2024" },
    ]);
  });

  it("skips rows for missing column data instead of rendering blanks", () => {
    const rows = legacyCourseRows({
      courseTitle: null,
      ceHours: null,
      courseType: null,
      deliveryMethod: null,
      status: "PENDING",
      approvedAt: null,
      courseIdNumber: null,
    });
    expect(rows).toEqual([{ label: "Status", value: "Pending" }]);
  });
});
