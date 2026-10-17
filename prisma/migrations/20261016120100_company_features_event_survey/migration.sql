-- Admin-gated per-company features (both off by default), the event survey
-- definition (kept out of event_data: it is not accreditation content), and the
-- attendee's survey answers snapshotted on each issued_certificates row.

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "survey_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "attendance_codes_enabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "survey" JSONB;

-- AlterTable
ALTER TABLE "issued_certificates" ADD COLUMN     "survey_responses" JSONB;
