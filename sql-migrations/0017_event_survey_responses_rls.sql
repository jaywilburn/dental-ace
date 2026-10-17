-- No-CE event survey responses (the "No" path of the survey-first attendee
-- form, lib/attend/event-survey-actions.ts). Server-only floor.
-- ALREADY APPLIED: this statement shipped inside the Prisma migration
-- prisma/migrations/20261017120000_event_survey_responses (do not edit that
-- folder; its checksum is recorded in the live database). It lives here too so
-- the RLS inventory under sql-migrations/ lists every table. Idempotent:
-- re-running it is a no-op.
-- Inserts and reads run server-side through Prisma (table owner, bypasses RLS),
-- so the attendee form and the CSV export are unaffected. There are
-- deliberately NO policies: the rows hold public, unverified names, emails and
-- answers, and no anon/authenticated (supabase-js) role may read or write them.

alter table public.event_survey_responses enable row level security;
