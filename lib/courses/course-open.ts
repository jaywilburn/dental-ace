/*
  Whether a course's attendee link is closed to new certificate claims. A
  RETIRED course (accredited_courses.retired_at, set by
  lib/admin/course-retire.ts) is treated exactly like an expired one: same
  closed notice, no submission, no cert-balance decrement. Pure, so the page,
  the submit action and the event paths all agree.
*/
export function isCourseClosed(
  course: { expiresAt: Date; retiredAt?: Date | null },
  now: Date = new Date(),
): boolean {
  return course.retiredAt != null || course.expiresAt < now;
}
