import { Prisma } from "@prisma/client";

/*
  Shared where-clause for the company Certificate Log. Used by both the page
  and the CSV export route so the exported rows can never drift from what the
  table shows. Failed quiz attempts (passed=false) are excluded everywhere.
*/
export function buildCertWhere(
  companyId: string | null | undefined,
  query: string,
  courseId?: string,
): Prisma.IssuedCertificateWhereInput {
  return {
    companyId: companyId ?? "",
    passed: true,
    ...(courseId ? { courseId } : {}),
    ...(query
      ? {
          OR: [
            { attendeeName: { contains: query, mode: "insensitive" } },
            { attendeeEmail: { contains: query, mode: "insensitive" } },
          ],
        }
      : {}),
  };
}
