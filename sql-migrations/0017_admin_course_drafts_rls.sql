-- Admin course drafts (unfinished "Add approved course" forms). Admin-only
-- floor, same shape as 0016_marketing_leads_rls.sql. Reads and writes run
-- server-side through Prisma (table owner, bypasses RLS), so the admin pages
-- are unaffected; this is the floor for the anon/authenticated (supabase-js)
-- roles. A draft must never reach the company it is for until an admin adds
-- the finished course, so there is no company policy and no client write.

alter table public.admin_course_drafts enable row level security;

drop policy if exists admin_course_drafts_admin_select on public.admin_course_drafts;
create policy admin_course_drafts_admin_select
  on public.admin_course_drafts
  for select
  to authenticated
  using (public.current_user_role() = 'ADMIN');
