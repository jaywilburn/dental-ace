import { z } from "zod";
import type { DetailRow } from "@/lib/forms/application/detail-rows";

/*
  Legacy-migration helpers for the application detail views.

  Courses imported by scripts/migrate-legacy.ts carry a stub application_data
  ({ legacy: true, legacyCourseId, source: "legacy-migration-v3" }) instead of
  a full submission, so applicationDataReadSchema can never parse it. The
  company and reviewer detail pages use isLegacyApplicationData() to branch to
  an intentional "no application on file" panel instead of a parse-error box,
  and legacyCourseRows() to render the real column data that did survive the
  migration (title, hours, type, delivery, status, approval date).
*/

/*
  Strict: a stub is ONLY the marker keys. A real submission that carries a
  leftover legacy marker (the renewal-prefill bug: renewing a migrated course
  copied the stub keys into the new application) must NOT classify as a stub,
  or the detail pages hide the actual submitted content behind the
  "no application on file" panel.
*/
const legacyStubSchema = z
  .object({
    legacy: z.literal(true),
    legacyCourseId: z.string().nullish(),
    source: z.string().optional(),
  })
  .strict();

export function isLegacyApplicationData(applicationData: unknown): boolean {
  return legacyStubSchema.safeParse(applicationData).success;
}

const LEGACY_STUB_KEYS = ["legacy", "legacyCourseId", "source"] as const;

/**
 * Remove the migration-stub marker keys from application data that carries a
 * `legacy: true` flag, so a renewal pre-filled from a migrated course starts
 * from clean data. Anything without the flag passes through untouched.
 */
export function stripLegacyStubKeys(applicationData: unknown): unknown {
  if (
    typeof applicationData !== "object" ||
    applicationData === null ||
    Array.isArray(applicationData) ||
    (applicationData as Record<string, unknown>).legacy !== true
  ) {
    return applicationData;
  }
  const rest = { ...(applicationData as Record<string, unknown>) };
  for (const key of LEGACY_STUB_KEYS) delete rest[key];
  return rest;
}

export type LegacyCourseColumns = {
  courseTitle: string | null;
  ceHours: number | null;
  courseType: string | null;
  deliveryMethod: string | null;
  status: string;
  approvedAt: Date | null;
  courseIdNumber: string | null;
};

export function legacyCourseRows(course: LegacyCourseColumns): DetailRow[] {
  return [
    ...(course.courseTitle
      ? [{ label: "Course Title", value: course.courseTitle, full: true }]
      : []),
    ...(course.courseIdNumber
      ? [{ label: "Course ID", value: course.courseIdNumber }]
      : []),
    ...(course.ceHours != null
      ? [{ label: "CE Credit Hours", value: `${course.ceHours.toFixed(1)} hours` }]
      : []),
    ...(course.courseType ? [{ label: "Course Type", value: course.courseType }] : []),
    ...(course.deliveryMethod
      ? [{ label: "Delivery Method", value: course.deliveryMethod }]
      : []),
    { label: "Status", value: statusLabel(course.status) },
    ...(course.approvedAt
      ? [
          {
            label: "Approved",
            value: course.approvedAt.toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
              year: "numeric",
            }),
          },
        ]
      : []),
  ];
}

function statusLabel(status: string): string {
  return status.charAt(0) + status.slice(1).toLowerCase();
}
