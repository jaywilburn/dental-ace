-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('FULL_EVENT_QUIZ', 'FULL_PER_COURSE', 'SELECTIVE_INLINE', 'SELECTIVE_PER_COURSE');

-- DropForeignKey
ALTER TABLE "event_sessions" DROP CONSTRAINT "event_sessions_course_id_fkey";

-- DropForeignKey
ALTER TABLE "issued_certificates" DROP CONSTRAINT "issued_certificates_course_id_fkey";

-- AlterTable
ALTER TABLE "event_sessions" DROP CONSTRAINT "event_sessions_pkey",
ADD COLUMN     "duration_hours" DECIMAL(4,2),
ADD COLUMN     "id" UUID NOT NULL,
ADD COLUMN     "name" TEXT,
ADD COLUMN     "question" JSONB,
ALTER COLUMN "course_id" DROP NOT NULL,
ADD CONSTRAINT "event_sessions_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "approval_letter_url" TEXT,
ADD COLUMN     "approved_at" TIMESTAMP(3),
ADD COLUMN     "certs_issued_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "event_data" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "event_id_number" TEXT,
ADD COLUMN     "event_type" "EventType",
ADD COLUMN     "expires_at" TIMESTAMP(3),
ADD COLUMN     "qr_code_url" TEXT,
ADD COLUMN     "reviewed_at" TIMESTAMP(3),
ADD COLUMN     "reviewed_by_id" UUID,
ADD COLUMN     "reviewer_notes" TEXT,
ADD COLUMN     "status" "ApplicationStatus" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "submitted_at" TIMESTAMP(3),
ADD COLUMN     "total_hours" DECIMAL(5,2);

-- AlterTable
ALTER TABLE "issued_certificates" ADD COLUMN     "attended_session_ids" JSONB,
ADD COLUMN     "ce_hours" DECIMAL(5,2),
ADD COLUMN     "event_id" UUID,
ALTER COLUMN "course_id" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "event_sessions_event_id_idx" ON "event_sessions"("event_id");

-- CreateIndex
CREATE UNIQUE INDEX "event_sessions_event_id_course_id_key" ON "event_sessions"("event_id", "course_id");

-- CreateIndex
CREATE UNIQUE INDEX "events_event_id_number_key" ON "events"("event_id_number");

-- CreateIndex
CREATE INDEX "events_status_submitted_at_idx" ON "events"("status", "submitted_at");

-- CreateIndex
CREATE INDEX "issued_certificates_event_id_idx" ON "issued_certificates"("event_id");

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_sessions" ADD CONSTRAINT "event_sessions_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "accredited_courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issued_certificates" ADD CONSTRAINT "issued_certificates_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "accredited_courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issued_certificates" ADD CONSTRAINT "issued_certificates_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
