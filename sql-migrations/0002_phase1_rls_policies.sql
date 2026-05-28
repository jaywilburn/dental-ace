-- Phase 1 RLS policies for Dental ACE.
-- Apply AFTER prisma migrate dev creates the tables.
-- Run via Supabase MCP apply_migration so it lands in the project's migration history.
--
-- Model:
--   - CUSTOMER  : sees only their own company's data
--   - REVIEWER  : sees all PENDING applications + own historical reviews
--   - ADMIN     : full access
--   - service_role bypasses RLS (used by webhooks, cron, cert generation)
--
-- Role is read from the JWT custom claim "role" (mirrored from public.users by an
-- auth hook). auth.uid() returns the Supabase auth user id, which equals public.users.id.

-- ============================================================================
-- Helper functions
-- ============================================================================

-- Resolve the current user's role from JWT claims, falling back to the users table.
create or replace function public.current_role()
returns text
language sql
stable
as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role'),
    (select role::text from public.users where id = auth.uid())
  );
$$;

-- Resolve the current user's companyId.
create or replace function public.current_company_id()
returns uuid
language sql
stable
as $$
  select company_id from public.users where id = auth.uid();
$$;

-- ============================================================================
-- Enable RLS on all Phase 1 tables (Supabase default is on, but be explicit).
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

-- Any authenticated user can read their own row.
create policy "users_select_own"
on public.users for select
to authenticated
using (id = auth.uid());

-- Admin can read all users.
create policy "users_admin_all"
on public.users for all
to authenticated
using (public.current_role() = 'ADMIN')
with check (public.current_role() = 'ADMIN');

-- ============================================================================
-- companies
-- ============================================================================

-- Customer can read their own company; admin reads all.
create policy "companies_select"
on public.companies for select
to authenticated
using (
  id = public.current_company_id()
  or public.current_role() = 'ADMIN'
);

-- Admin can write companies.
create policy "companies_admin_write"
on public.companies for all
to authenticated
using (public.current_role() = 'ADMIN')
with check (public.current_role() = 'ADMIN');

-- ============================================================================
-- course_applications
-- ============================================================================

-- Customer reads only their company's applications.
create policy "course_applications_customer_read"
on public.course_applications for select
to authenticated
using (
  company_id = public.current_company_id()
  and public.current_role() = 'CUSTOMER'
);

-- Customer can create/update their company's drafts.
create policy "course_applications_customer_write"
on public.course_applications for all
to authenticated
using (
  company_id = public.current_company_id()
  and public.current_role() = 'CUSTOMER'
)
with check (
  company_id = public.current_company_id()
  and public.current_role() = 'CUSTOMER'
);

-- Reviewer reads all PENDING + their own historical reviews.
create policy "course_applications_reviewer_read"
on public.course_applications for select
to authenticated
using (
  public.current_role() = 'REVIEWER'
  and (status = 'PENDING' or reviewed_by_id = auth.uid())
);

-- Reviewer can update applications they review.
create policy "course_applications_reviewer_update"
on public.course_applications for update
to authenticated
using (
  public.current_role() = 'REVIEWER'
  and (status = 'PENDING' or reviewed_by_id = auth.uid())
)
with check (public.current_role() = 'REVIEWER');

-- Admin full access.
create policy "course_applications_admin_all"
on public.course_applications for all
to authenticated
using (public.current_role() = 'ADMIN')
with check (public.current_role() = 'ADMIN');

-- ============================================================================
-- accredited_courses
-- ============================================================================

create policy "accredited_courses_customer_read"
on public.accredited_courses for select
to authenticated
using (company_id = public.current_company_id());

create policy "accredited_courses_reviewer_read"
on public.accredited_courses for select
to authenticated
using (public.current_role() = 'REVIEWER');

create policy "accredited_courses_admin_all"
on public.accredited_courses for all
to authenticated
using (public.current_role() = 'ADMIN')
with check (public.current_role() = 'ADMIN');

-- Public attendee access happens via the service-role client when validating
-- attendeeLinkToken in the /attend/[token] route; no RLS policy needed for that.

-- ============================================================================
-- issued_certificates
-- ============================================================================

create policy "issued_certificates_customer_read"
on public.issued_certificates for select
to authenticated
using (company_id = public.current_company_id());

create policy "issued_certificates_admin_all"
on public.issued_certificates for all
to authenticated
using (public.current_role() = 'ADMIN')
with check (public.current_role() = 'ADMIN');

-- ============================================================================
-- billing_transactions
-- ============================================================================

create policy "billing_transactions_customer_read"
on public.billing_transactions for select
to authenticated
using (company_id = public.current_company_id());

create policy "billing_transactions_admin_all"
on public.billing_transactions for all
to authenticated
using (public.current_role() = 'ADMIN')
with check (public.current_role() = 'ADMIN');
