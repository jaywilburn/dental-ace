-- Lock down Prisma's internal migration tracking table.
-- Prisma reads/writes this via DATABASE_URL (bypassing PostgREST/RLS entirely),
-- so enabling RLS without policies blocks the anon/authenticated roles from
-- ever seeing it while leaving Prisma's own access untouched.
--
-- Resolves the rls_disabled advisory from list_tables on public._prisma_migrations.

alter table public._prisma_migrations enable row level security;
