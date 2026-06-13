-- 0011_admin_audit_log_rls.sql
-- RLS for admin_audit_log. Written server-side by lib/admin/audit.ts through
-- Prisma's owner connection (bypasses RLS). No customer/anon access; ADMIN may
-- read the ledger from the /admin/audit page.
-- Apply via the Supabase MCP apply_migration tool.

alter table public.admin_audit_log enable row level security;

create policy "admin_audit_log_admin_read"
on public.admin_audit_log for select
to authenticated
using (public.current_user_role() = 'ADMIN');
