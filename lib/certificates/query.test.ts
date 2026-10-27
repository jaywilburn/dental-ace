import { describe, it, expect } from "vitest";
import { buildCertWhere, NOT_RETIRED_COURSE_CERT } from "@/lib/certificates/query";

const COMPANY = "abf1ca01-28de-46a2-b3e1-23b97ef4255b";

describe("buildCertWhere", () => {
  it("excludes certificates of retired courses but keeps event certificates (courseId null)", () => {
    const where = buildCertWhere(COMPANY, "");
    expect(where.AND).toEqual([NOT_RETIRED_COURSE_CERT]);
    expect(NOT_RETIRED_COURSE_CERT).toEqual({
      OR: [{ courseId: null }, { course: { retiredAt: null } }],
    });
    // A bare relation filter would drop every event certificate.
    expect(where).not.toHaveProperty("course");
  });

  it("scopes to the company and passed attempts", () => {
    expect(buildCertWhere(COMPANY, "")).toMatchObject({ companyId: COMPANY, passed: true });
    expect(buildCertWhere(null, "").companyId).toBe("");
  });

  it("ANDs the search with the retired-course clause instead of overwriting one OR with the other", () => {
    const where = buildCertWhere(COMPANY, "smith");
    expect(where.OR).toBeUndefined();
    expect(where.AND).toEqual([
      NOT_RETIRED_COURSE_CERT,
      {
        OR: [
          { attendeeName: { contains: "smith", mode: "insensitive" } },
          { attendeeEmail: { contains: "smith", mode: "insensitive" } },
        ],
      },
    ]);
  });

  it("applies the course filter when given", () => {
    expect(buildCertWhere(COMPANY, "", "course-1")).toMatchObject({ courseId: "course-1" });
    expect(buildCertWhere(COMPANY, "")).not.toHaveProperty("courseId");
  });
});
