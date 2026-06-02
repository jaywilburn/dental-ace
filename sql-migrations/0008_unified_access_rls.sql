-- Unified access model: the `role` column is gone (replaced by staff_role +
-- entitlement columns). Two things read the old column and must be updated:
--   1. the custom access-token hook (mirrors access into the JWT)
--   2. current_user_role() (used by the existing RLS policies)
--
-- Strategy: redefine current_user_role() to DERIVE a role-string from staff_role
-- so every existing Phase-1 + ProTrack policy keeps working unchanged:
--   - staff_role ADMIN/REVIEWER  -> 'ADMIN'/'REVIEWER'
--   - everyone else              -> 'CUSTOMER'
-- DentalACE customer policies are additionally scoped by
-- company_id = current_user_company_id(), so a ProTrack-only account
-- (company_id null) gets 'CUSTOMER' but matches no company rows = no DentalACE
-- data. The licensees table was dropped, which dropped its policies; the
-- ProTrack child-table policies still key on licensee_id = auth.uid().

-- ============================================================================
-- Access-token hook: emit the new entitlements into app_metadata.
-- ============================================================================

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  claims       jsonb;
  v_staff_role text;
  v_company    uuid;
  v_protrack   text;
  v_verify     boolean;
begin
  select u.staff_role::text, u.company_id, u.protrack_tier::text, u.verify_access
    into v_staff_role, v_company, v_protrack, v_verify
  from public.users u
  where u.id = (event ->> 'user_id')::uuid;

  claims := event -> 'claims';
  if claims -> 'app_metadata' is null then
    claims := jsonb_set(claims, '{app_metadata}', '{}'::jsonb);
  end if;

  if v_staff_role is not null then
    claims := jsonb_set(claims, '{app_metadata,staff_role}', to_jsonb(v_staff_role));
  end if;
  if v_company is not null then
    claims := jsonb_set(claims, '{app_metadata,company_id}', to_jsonb(v_company));
  end if;
  if v_protrack is not null then
    claims := jsonb_set(claims, '{app_metadata,protrack_tier}', to_jsonb(v_protrack));
  end if;
  if v_verify is not null then
    claims := jsonb_set(claims, '{app_metadata,verify_access}', to_jsonb(v_verify));
  end if;

  return jsonb_set(event, '{claims}', claims);
end;
$$;

-- ============================================================================
-- current_user_role(): derive from staff_role so existing policies still work.
-- Reads from the JWT (fast) with a users fallback. Empty search_path: every
-- identifier is schema-qualified.
-- ============================================================================

create or replace function public.current_user_role()
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when coalesce(
      (auth.jwt() -> 'app_metadata' ->> 'staff_role'),
      (select staff_role::text from public.users where id = auth.uid())
    ) = 'ADMIN' then 'ADMIN'
    when coalesce(
      (auth.jwt() -> 'app_metadata' ->> 'staff_role'),
      (select staff_role::text from public.users where id = auth.uid())
    ) = 'REVIEWER' then 'REVIEWER'
    else 'CUSTOMER'
  end;
$$;

-- A convenience helper for future entitlement-explicit policies.
create or replace function public.current_verify_access()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'verify_access')::boolean,
    (select verify_access from public.users where id = auth.uid()),
    false
  );
$$;
