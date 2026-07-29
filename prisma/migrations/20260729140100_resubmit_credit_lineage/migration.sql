-- Revising after a review decision is free (client decision 2026-07-29).
-- credit_charged_at records that a submission line has already settled its
-- application credit; submit charges iff it is null.

-- AlterTable
ALTER TABLE "events" ADD COLUMN "credit_charged_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "course_applications" ADD COLUMN "credit_charged_at" TIMESTAMP(3);
ALTER TABLE "course_applications" ADD COLUMN "resubmit_of_id" UUID;

-- CreateIndex
CREATE INDEX "course_applications_resubmit_of_id_idx" ON "course_applications"("resubmit_of_id");

-- AddForeignKey
ALTER TABLE "course_applications"
  ADD CONSTRAINT "course_applications_resubmit_of_id_fkey"
  FOREIGN KEY ("resubmit_of_id") REFERENCES "course_applications"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill. Anything that ever left DRAFT has already settled its credit.
-- Without this every historic REJECTED row would revise for free AND every
-- historic APPROVED row would be re-charged if it were ever reopened.
--
-- Events are scoped to the two event-only types: per-course events never cost
-- a credit, so stamping them would let a provider submit a free per-course
-- event, get it rejected, switch the qualifier to an event-only type, and take
-- a paid type for nothing.
UPDATE "events"
   SET "credit_charged_at" = COALESCE("submitted_at", "created_at")
 WHERE "status" <> 'DRAFT'
   AND "event_type" IN ('FULL_EVENT_QUIZ', 'SELECTIVE_INLINE');

UPDATE "course_applications"
   SET "credit_charged_at" = COALESCE("submitted_at", "created_at")
 WHERE "status" <> 'DRAFT';
