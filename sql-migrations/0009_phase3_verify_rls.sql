-- Phase 3 (Verify) RLS policies.
-- Applied via the Supabase MCP apply_migration tool — this file is the canonical
-- source on disk.
--
-- Model:
--   - Board users (verify_access = true, board_id set) see/write only their
--     own board's audit batches, selections, deficiencies, and notices.
--   - ADMIN: full access via current_user_role() = 'ADMIN'.
--   - service_role bypasses RLS (used by cron jobs writing into notices_sent +
--     updating deficiency status; and by the public /verify lookup).
--
-- Note: the app uses Prisma over DATABASE_URL (postgres role), which bypasses
-- RLS entirely. These policies are defense-in-depth for any future direct
-- Supabase client reads/writes. Primary scoping lives in lib/board/scope.ts.

-- ============================================================================
-- Helper: current user's board_id (mirrors current_verify_access() in 0008)
-- ============================================================================

create or replace function public.current_user_board_id()
returns uuid
language sql
stable
set search_path = ''
as $$
  select coalesce(
    nullif(auth.jwt() -> 'app_metadata' ->> 'board_id', '')::uuid,
    (select board_id from public.users where id = auth.uid())
  );
$$;

-- ============================================================================
-- Enable RLS on the Phase 3 tables
-- ============================================================================

alter table public.boards            enable row level security;
alter table public.audit_batches     enable row level security;
alter table public.audit_selections  enable row level security;
alter table public.deficiencies      enable row level security;
alter table public.notices_sent      enable row level security;

-- ============================================================================
-- boards: a user sees their own board; ADMIN sees all
-- ============================================================================

create policy "boards_own"
on public.boards for select
to authenticated
using (id = public.current_user_board_id());

create policy "boards_admin_all"
on public.boards for all
to authenticated
using (public.current_user_role() = 'ADMIN')
with check (public.current_user_role() = 'ADMIN');

-- ============================================================================
-- audit_batches: scoped by board_id
-- ============================================================================

create policy "audit_batches_own_board"
on public.audit_batches for all
to authenticated
using (board_id = public.current_user_board_id())
with check (board_id = public.current_user_board_id());

create policy "audit_batches_admin_all"
on public.audit_batches for all
to authenticated
using (public.current_user_role() = 'ADMIN')
with check (public.current_user_role() = 'ADMIN');

-- ============================================================================
-- audit_selections: scoped via parent audit_batches.board_id
-- ============================================================================

create policy "audit_selections_own_board"
on public.audit_selections for all
to authenticated
using (
  exists (
    select 1
    from public.audit_batches b
    where b.id = audit_selections.batch_id
      and b.board_id = public.current_user_board_id()
  )
)
with check (
  exists (
    select 1
    from public.audit_batches b
    where b.id = audit_selections.batch_id
      and b.board_id = public.current_user_board_id()
  )
);

create policy "audit_selections_admin_all"
on public.audit_selections for all
to authenticated
using (public.current_user_role() = 'ADMIN')
with check (public.current_user_role() = 'ADMIN');

-- ============================================================================
-- deficiencies: scoped via parent audit_batches.board_id
-- ============================================================================

create policy "deficiencies_own_board"
on public.deficiencies for all
to authenticated
using (
  exists (
    select 1
    from public.audit_batches b
    where b.id = deficiencies.batch_id
      and b.board_id = public.current_user_board_id()
  )
)
with check (
  exists (
    select 1
    from public.audit_batches b
    where b.id = deficiencies.batch_id
      and b.board_id = public.current_user_board_id()
  )
);

create policy "deficiencies_admin_all"
on public.deficiencies for all
to authenticated
using (public.current_user_role() = 'ADMIN')
with check (public.current_user_role() = 'ADMIN');

-- ============================================================================
-- notices_sent: scoped via deficiency -> batch -> board
-- ============================================================================

create policy "notices_sent_own_board"
on public.notices_sent for all
to authenticated
using (
  exists (
    select 1
    from public.deficiencies d
    join public.audit_batches b on b.id = d.batch_id
    where d.id = notices_sent.deficiency_id
      and b.board_id = public.current_user_board_id()
  )
)
with check (
  exists (
    select 1
    from public.deficiencies d
    join public.audit_batches b on b.id = d.batch_id
    where d.id = notices_sent.deficiency_id
      and b.board_id = public.current_user_board_id()
  )
);

create policy "notices_sent_admin_all"
on public.notices_sent for all
to authenticated
using (public.current_user_role() = 'ADMIN')
with check (public.current_user_role() = 'ADMIN');
