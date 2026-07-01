-- AlterTable
ALTER TABLE "accredited_courses" ADD COLUMN     "event_id" UUID;

-- AlterTable
ALTER TABLE "course_applications" ADD COLUMN     "event_id" UUID,
ADD COLUMN     "session_position" INTEGER;

-- CreateIndex
CREATE INDEX "accredited_courses_event_id_idx" ON "accredited_courses"("event_id");

-- CreateIndex
CREATE INDEX "course_applications_event_id_idx" ON "course_applications"("event_id");

-- AddForeignKey
ALTER TABLE "course_applications" ADD CONSTRAINT "course_applications_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accredited_courses" ADD CONSTRAINT "accredited_courses_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
