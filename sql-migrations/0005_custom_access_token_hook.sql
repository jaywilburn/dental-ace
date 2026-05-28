-- Custom Access Token Hook: injects role + company_id from public.users
-- into the JWT's app_metadata so portal layouts and RLS policies can read
-- them without a DB roundtrip on every request.
--
-- After this migration applies, enable the hook in the Supabase Dashboard:
--   Authentication -> Hooks -> Custom Access Token -> select public.custom_access_token_hook
--
-- Until enabled, code falls back to a SELECT on public.users (still works,
-- just one extra query per request).

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  claims        jsonb;
  user_role     text;
  user_company  uuid;
begin
  select u.role::text, u.company_id
    into user_role, user_company
  from public.users u
  where u.id = (event ->> 'user_id')::uuid;

  claims := event -> 'claims';

  if claims -> 'app_metadata' is null then
    claims := jsonb_set(claims, '{app_metadata}', '{}'::jsonb);
  end if;

  if user_role is not null then
    claims := jsonb_set(claims, '{app_metadata,role}', to_jsonb(user_role));
  end if;

  if user_company is not null then
    claims := jsonb_set(claims, '{app_metadata,company_id}', to_jsonb(user_company));
  end if;

  return jsonb_set(event, '{claims}', claims);
end;
$$;

-- Grants
grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook from authenticated, anon, public;

-- The hook needs to read public.users
grant select on public.users to supabase_auth_admin;

drop policy if exists "auth_admin_select_users" on public.users;
create policy "auth_admin_select_users"
on public.users for select
to supabase_auth_admin
using (true);
