-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "expedited_credits" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "events" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "event_date" TEXT NOT NULL,
    "attendee_link_token" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_sessions" (
    "event_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "event_sessions_pkey" PRIMARY KEY ("event_id","course_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "events_attendee_link_token_key" ON "events"("attendee_link_token");

-- CreateIndex
CREATE INDEX "events_company_id_idx" ON "events"("company_id");

-- CreateIndex
CREATE INDEX "event_sessions_course_id_idx" ON "event_sessions"("course_id");

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_sessions" ADD CONSTRAINT "event_sessions_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_sessions" ADD CONSTRAINT "event_sessions_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "accredited_courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
