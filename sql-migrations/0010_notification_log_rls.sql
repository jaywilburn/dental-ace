-- 0010_notification_log_rls.sql
-- RLS for notification_log. Written by the dental-ace-lifecycle cron via the
-- service-role client (bypasses RLS). No customer/anon access; ADMIN may read.
-- Apply via the Supabase MCP apply_migration tool.

alter table public.notification_log enable row level security;

create policy "notification_log_admin_all"
on public.notification_log for all
to authenticated
using (public.current_user_role() = 'ADMIN')
with check (public.current_user_role() = 'ADMIN');
