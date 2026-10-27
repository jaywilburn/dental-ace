-- Courses are retired, never deleted. retired_at hides a course from
-- company-facing lists, the Certificate Log/export and the attendee link, while
-- its issued certificates stay valid in ProTrack and public Verify. First use:
-- ACE-LEG-00023 (legacy DA245), imported under Limitless on Demand, which says
-- the course is not theirs.
--
-- CERTIFICATE_EMAIL_CORRECTED is added here too so both new audit actions ship
-- in one migration.

-- AlterEnum
ALTER TYPE "AdminAuditAction" ADD VALUE 'COURSE_RETIRED';
ALTER TYPE "AdminAuditAction" ADD VALUE 'CERTIFICATE_EMAIL_CORRECTED';

-- AlterTable
ALTER TABLE "accredited_courses" ADD COLUMN     "retired_at" TIMESTAMP(3);
