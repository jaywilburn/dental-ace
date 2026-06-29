-- Events accreditation: reviewer read policies + issued_certificates integrity
-- guards. Pairs with the Prisma migration <ts>_events_accreditation (columns).
--
-- Events/event_sessions previously had CUSTOMER + ADMIN policies only (0006).
-- Events now go through the reviewer queue, so REVIEWER needs read access. The
-- reviewer pages run through Prisma (postgres role, bypasses RLS); these are
-- defense-in-depth so a direct authenticated read still honors the role.

-- ============================================================================
-- REVIEWER read on events + event_sessions (reviewers see the whole queue,
-- like course applications). Idempotent.
-- ============================================================================

drop policy if exists "events_reviewer_read" on public.events;
create policy "events_reviewer_read"
on public.events for select
to authenticated
using (public.current_user_role() = 'REVIEWER');

drop policy if exists "event_sessions_reviewer_read" on public.event_sessions;
create policy "event_sessions_reviewer_read"
on public.event_sessions for select
to authenticated
using (public.current_user_role() = 'REVIEWER');

-- ============================================================================
-- issued_certificates integrity: a cert belongs to exactly one parent (a
-- course OR an event), and at most one PASSING event cert per (event, email).
-- ============================================================================

-- Exactly one of course_id / event_id is set (XOR). Existing course certs have
-- course_id set + event_id null, so they satisfy this.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'issued_certificates_parent_chk'
  ) then
    alter table public.issued_certificates
      add constraint issued_certificates_parent_chk
      check ((course_id is not null) <> (event_id is not null));
  end if;
end $$;

-- One passing certificate per (event, attendee email). Backstops the in-app
-- AlreadyCertifiedError guard in submitEventAttendance.
create unique index if not exists issued_certificates_event_attendee_uq
on public.issued_certificates (event_id, lower(attendee_email))
where passed and event_id is not null;
