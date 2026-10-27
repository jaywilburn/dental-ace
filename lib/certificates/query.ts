import { Prisma } from "@prisma/client";

/*
  Shared where-clause for the company Certificate Log. Used by both the page
  and the CSV export route so the exported rows can never drift from what the
  table shows. Failed quiz attempts (passed=false) are excluded everywhere.

  Certificates of a RETIRED course (accredited_courses.retired_at set, see
  lib/admin/course-retire.ts) are hidden here too: retiring means the course is
  not this company's offering. Event certificates carry no courseId (exactly one
  of courseId/eventId is set), so the course condition is an explicit OR that
  keeps them; a bare `course: { retiredAt: null }` would drop every event cert.
  The certificates themselves stay valid in ProTrack and public Verify, which
  do not read this clause.
*/
export const NOT_RETIRED_COURSE_CERT: Prisma.IssuedCertificateWhereInput = {
  OR: [{ courseId: null }, { course: { retiredAt: null } }],
};

export function buildCertWhere(
  companyId: string | null | undefined,
  query: string,
  courseId?: string,
): Prisma.IssuedCertificateWhereInput {
  return {
    companyId: companyId ?? "",
    passed: true,
    ...(courseId ? { courseId } : {}),
    AND: [
      NOT_RETIRED_COURSE_CERT,
      ...(query
        ? [
            {
              OR: [
                { attendeeName: { contains: query, mode: "insensitive" as const } },
                { attendeeEmail: { contains: query, mode: "insensitive" as const } },
              ],
            },
          ]
        : []),
    ],
  };
}
