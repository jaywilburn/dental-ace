-- Pin search_path on the RLS helper functions so a malicious schema in the
-- caller's search_path can't shadow the auth.* or public.* references we use.
-- Both function bodies already schema-qualify every identifier (auth.jwt(),
-- auth.uid(), public.users), so an empty search_path is safe.
--
-- Fixes the function_search_path_mutable lint from Supabase's security advisor.

alter function public.current_user_role()       set search_path = '';
alter function public.current_user_company_id() set search_path = '';
