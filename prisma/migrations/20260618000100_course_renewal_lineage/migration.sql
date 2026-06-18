-- Course renewal (June 2026 batch, Row 8). A renewal is a new course
-- application linked back to the accredited course it renews; approving it
-- supersedes the old course and issues a fresh 3-year accreditation.

ALTER TABLE "accredited_courses" ADD COLUMN "superseded_at" TIMESTAMP(3);

ALTER TABLE "course_applications" ADD COLUMN "renewal_of_course_id" UUID;

CREATE INDEX "course_applications_renewal_of_course_id_idx"
  ON "course_applications"("renewal_of_course_id");

ALTER TABLE "course_applications"
  ADD CONSTRAINT "course_applications_renewal_of_course_id_fkey"
  FOREIGN KEY ("renewal_of_course_id") REFERENCES "accredited_courses"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
