-- Platform settings singleton (approval-letter signatory). Admin-only floor.
-- current_user_role() (sql-migrations/0008) derives ADMIN/REVIEWER/CUSTOMER
-- from staff_role + company presence. App reads during letter rendering go
-- through Prisma (table owner, bypasses RLS), so rendering is unaffected; this
-- policy is the access-control floor for the anon/authenticated (supabase-js)
-- roles, which must never read or write platform settings.

alter table public.platform_settings enable row level security;

drop policy if exists platform_settings_admin_all on public.platform_settings;
create policy platform_settings_admin_all
  on public.platform_settings
  for all
  to authenticated
  using (public.current_user_role() = 'ADMIN')
  with check (public.current_user_role() = 'ADMIN');
