-- 0012_access_requests_rls.sql
-- RLS for access_requests. Written server-side by admin routes through the
-- Prisma owner connection (bypasses RLS). No client INSERT/DELETE: writes go
-- through server routes/actions over the Prisma (service) connection.
-- Apply via the Supabase MCP apply_migration tool.

-- One open request per kind per user (Prisma can't express partial uniques).
create unique index if not exists access_requests_one_pending_per_kind
  on public.access_requests (user_id, kind)
  where status = 'PENDING';

alter table public.access_requests enable row level security;

-- A user can read their own requests.
drop policy if exists "access_requests_select_own" on public.access_requests;
create policy "access_requests_select_own"
on public.access_requests for select
to authenticated
using (user_id = auth.uid());

-- AADB admins can read every request.
drop policy if exists "access_requests_select_admin" on public.access_requests;
create policy "access_requests_select_admin"
on public.access_requests for select
to authenticated
using (public.current_user_role() = 'ADMIN');

-- AADB admins can update (approve/deny). No client INSERT/DELETE: writes go
-- through server routes/actions over the Prisma (service) connection.
drop policy if exists "access_requests_update_admin" on public.access_requests;
create policy "access_requests_update_admin"
on public.access_requests for update
to authenticated
using (public.current_user_role() = 'ADMIN');
