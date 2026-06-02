-- Phase 2 (ProTrack) RLS policies.
-- Applied to the live Supabase project via the MCP apply_migration tool — this
-- file is the canonical source of truth on disk.
--
-- Model:
--   - LICENSEE : sees/writes only their own rows. A licensee's primary key
--                (licensees.user_id) and every child row's licensee_id equal
--                auth.uid(), so the scope check is a direct `= auth.uid()`.
--   - ADMIN    : full access (reuses public.current_user_role() from 0002).
--   - state_requirements is reference data: readable by any authenticated user
--     (the 50-state browser); only ADMIN writes.
--   - service_role bypasses RLS (used by the ACE-sync backfill's cross-company
--     read of issued_certificates, the Stripe webhook writing pro_subscriptions,
--     and the reminder cron writing protrack_reminder_log).
--
-- The access-token hook (0005) already mirrors any users.role — including
-- LICENSEE — into the JWT, so public.current_user_role() needs no change.

-- ============================================================================
-- Enable RLS on the Phase 2 tables
-- ============================================================================

alter table public.licensees             enable row level security;
alter table public.user_licenses         enable row level security;
alter table public.ce_certificates       enable row level security;
alter table public.state_requirements    enable row level security;
alter table public.pro_subscriptions     enable row level security;
alter table public.board_invites         enable row level security;
alter table public.protrack_reminder_log enable row level security;

-- ============================================================================
-- licensees (1:1 with users; PK is the auth user id)
-- ============================================================================

create policy "licensees_self"
on public.licensees for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "licensees_admin_all"
on public.licensees for all
to authenticated
using (public.current_user_role() = 'ADMIN')
with check (public.current_user_role() = 'ADMIN');

-- ============================================================================
-- user_licenses
-- ============================================================================

create policy "user_licenses_self"
on public.user_licenses for all
to authenticated
using (licensee_id = auth.uid())
with check (licensee_id = auth.uid());

create policy "user_licenses_admin_all"
on public.user_licenses for all
to authenticated
using (public.current_user_role() = 'ADMIN')
with check (public.current_user_role() = 'ADMIN');

-- ============================================================================
-- ce_certificates
-- ============================================================================

create policy "ce_certificates_self"
on public.ce_certificates for all
to authenticated
using (licensee_id = auth.uid())
with check (licensee_id = auth.uid());

create policy "ce_certificates_admin_all"
on public.ce_certificates for all
to authenticated
using (public.current_user_role() = 'ADMIN')
with check (public.current_user_role() = 'ADMIN');

-- ============================================================================
-- state_requirements (reference data: read-all authenticated, ADMIN writes)
-- ============================================================================

create policy "state_requirements_read"
on public.state_requirements for select
to authenticated
using (true);

create policy "state_requirements_admin_write"
on public.state_requirements for all
to authenticated
using (public.current_user_role() = 'ADMIN')
with check (public.current_user_role() = 'ADMIN');

-- ============================================================================
-- pro_subscriptions (self read-only; writes are service-role via the webhook)
-- ============================================================================

create policy "pro_subscriptions_self_read"
on public.pro_subscriptions for select
to authenticated
using (licensee_id = auth.uid());

create policy "pro_subscriptions_admin_all"
on public.pro_subscriptions for all
to authenticated
using (public.current_user_role() = 'ADMIN')
with check (public.current_user_role() = 'ADMIN');

-- ============================================================================
-- board_invites (ADMIN-managed; the registration code lookup runs service-role)
-- ============================================================================

create policy "board_invites_admin_all"
on public.board_invites for all
to authenticated
using (public.current_user_role() = 'ADMIN')
with check (public.current_user_role() = 'ADMIN');

-- ============================================================================
-- protrack_reminder_log (written by the cron via service-role; ADMIN reads)
-- ============================================================================

create policy "protrack_reminder_log_admin_all"
on public.protrack_reminder_log for all
to authenticated
using (public.current_user_role() = 'ADMIN')
with check (public.current_user_role() = 'ADMIN');
