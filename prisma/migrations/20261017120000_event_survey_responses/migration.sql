-- Survey answers from event attendees who do not need CE credit (the "No"
-- path of the survey-first attendee form). Written server-side through Prisma
-- (table owner, bypasses RLS). RLS is enabled with NO policies so the
-- anon/authenticated (supabase-js) roles can never read or write it.

-- CreateTable
CREATE TABLE "event_survey_responses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_id" UUID NOT NULL,
    "attendee_name" TEXT NOT NULL,
    "attendee_email" TEXT NOT NULL,
    "responses" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_survey_responses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_survey_responses_event_id_idx" ON "event_survey_responses"("event_id");

-- AddForeignKey
ALTER TABLE "event_survey_responses" ADD CONSTRAINT "event_survey_responses_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Access-control floor: server-only table.
ALTER TABLE "event_survey_responses" ENABLE ROW LEVEL SECURITY;
