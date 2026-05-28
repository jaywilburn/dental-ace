-- Phase 1 RLS policies for Dental ACE.
-- Applied to the live Supabase project via the MCP apply_migration tool — this
-- file is the canonical source of truth on disk; the Supabase project keeps the
-- authoritative migration log.
--
-- Model:
--   - CUSTOMER  : sees only their own company's data
--   - REVIEWER  : sees all PENDING applications + own historical reviews
--   - ADMIN     : full access
--   - service_role bypasses RLS (used by webhook handlers, cron jobs, cert generation)
--
-- Role is read from the JWT custom claim app_metadata.role (mirrored from
-- public.users by a Supabase Auth hook — wired up in Week 2). auth.uid()
-- returns the Supabase auth user id, which equals public.users.id.
--
-- NOTE: helper functions are named current_user_role / current_user_company_id
-- (not current_role) to avoid shadowing Postgres's built-in current_role keyword.

-- ============================================================================
-- Helper functions
-- ============================================================================

create or replace function public.current_user_role()
returns text
language sql
stable
as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role'),
    (select role::text from public.users where id = auth.uid())
  );
$$;

create or replace function public.current_user_company_id()
returns uuid
language sql
stable
as $$
  select company_id from public.users where id = auth.uid();
$$;

-- ============================================================================
-- Enable RLS on all Phase 1 tables (Supabase default is on; be explicit)
-- ============================================================================

alter table public.users                 enable row level security;
alter table public.companies             enable row level security;
alter table public.course_applications   enable row level security;
alter table public.accredited_courses    enable row level security;
alter table public.issued_certificates   enable row level security;
alter table public.billing_transactions  enable row level security;

-- ============================================================================
-- users
-- ============================================================================

create policy "users_select_own"
on public.users for select
to authenticated
using (id = auth.uid());

create policy "users_admin_all"
on public.users for all
to authenticated
using (public.current_user_role() = 'ADMIN')
with check (public.current_user_role() = 'ADMIN');

-- ============================================================================
-- companies
-- ============================================================================

create policy "companies_select"
on public.companies for select
to authenticated
using (
  id = public.current_user_company_id()
  or public.current_user_role() = 'ADMIN'
);

create policy "companies_admin_write"
on public.companies for all
to authenticated
using (public.current_user_role() = 'ADMIN')
with check (public.current_user_role() = 'ADMIN');

-- ============================================================================
-- course_applications
-- ============================================================================

create policy "course_applications_customer_read"
on public.course_applications for select
to authenticated
using (
  company_id = public.current_user_company_id()
  and public.current_user_role() = 'CUSTOMER'
);

create policy "course_applications_customer_write"
on public.course_applications for all
to authenticated
using (
  company_id = public.current_user_company_id()
  and public.current_user_role() = 'CUSTOMER'
)
with check (
  company_id = public.current_user_company_id()
  and public.current_user_role() = 'CUSTOMER'
);

create policy "course_applications_reviewer_read"
on public.course_applications for select
to authenticated
using (
  public.current_user_role() = 'REVIEWER'
  and (status = 'PENDING' or reviewed_by_id = auth.uid())
);

create policy "course_applications_reviewer_update"
on public.course_applications for update
to authenticated
using (
  public.current_user_role() = 'REVIEWER'
  and (status = 'PENDING' or reviewed_by_id = auth.uid())
)
with check (public.current_user_role() = 'REVIEWER');

create policy "course_applications_admin_all"
on public.course_applications for all
to authenticated
using (public.current_user_role() = 'ADMIN')
with check (public.current_user_role() = 'ADMIN');

-- ============================================================================
-- accredited_courses
-- ============================================================================

create policy "accredited_courses_customer_read"
on public.accredited_courses for select
to authenticated
using (company_id = public.current_user_company_id());

create policy "accredited_courses_reviewer_read"
on public.accredited_courses for select
to authenticated
using (public.current_user_role() = 'REVIEWER');

create policy "accredited_courses_admin_all"
on public.accredited_courses for all
to authenticated
using (public.current_user_role() = 'ADMIN')
with check (public.current_user_role() = 'ADMIN');

-- Public attendee access happens via the service-role client when validating
-- attendee_link_token in the /attend/[token] route; no RLS policy needed.

-- ============================================================================
-- issued_certificates
-- ============================================================================

create policy "issued_certificates_customer_read"
on public.issued_certificates for select
to authenticated
using (company_id = public.current_user_company_id());

create policy "issued_certificates_admin_all"
on public.issued_certificates for all
to authenticated
using (public.current_user_role() = 'ADMIN')
with check (public.current_user_role() = 'ADMIN');

-- ============================================================================
-- billing_transactions
-- ============================================================================

create policy "billing_transactions_customer_read"
on public.billing_transactions for select
to authenticated
using (company_id = public.current_user_company_id());

create policy "billing_transactions_admin_all"
on public.billing_transactions for all
to authenticated
using (public.current_user_role() = 'ADMIN')
with check (public.current_user_role() = 'ADMIN');
