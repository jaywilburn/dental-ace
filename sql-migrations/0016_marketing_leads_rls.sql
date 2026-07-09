-- Marketing lead capture (VerifyIQ / Verify contact forms). Admin-only floor.
-- current_user_role() (sql-migrations/0008) derives ADMIN/REVIEWER/CUSTOMER
-- from staff_role + company presence. Inserts run server-side through Prisma
-- (table owner, bypasses RLS), so lead capture is unaffected; this policy is the
-- access-control floor for the anon/authenticated (supabase-js) roles, which
-- must never read captured leads. There is deliberately no public INSERT/SELECT
-- policy: no client role may read leads, and no client writes them directly.

alter table public.marketing_leads enable row level security;

drop policy if exists marketing_leads_admin_select on public.marketing_leads;
create policy marketing_leads_admin_select
  on public.marketing_leads
  for select
  to authenticated
  using (public.current_user_role() = 'ADMIN');
