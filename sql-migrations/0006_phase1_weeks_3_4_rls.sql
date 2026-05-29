-- RLS for events + event_sessions added in weeks 3-4.
-- Customer-side only: CUSTOMER sees own company's events; REVIEWER has no access;
-- ADMIN full access. service_role bypasses RLS (used by webhooks / cert engine).

alter table public.events         enable row level security;
alter table public.event_sessions enable row level security;

-- ============================================================================
-- events
-- ============================================================================

create policy "events_customer_read"
on public.events for select
to authenticated
using (
  company_id = public.current_user_company_id()
  and public.current_user_role() = 'CUSTOMER'
);

create policy "events_customer_write"
on public.events for all
to authenticated
using (
  company_id = public.current_user_company_id()
  and public.current_user_role() = 'CUSTOMER'
)
with check (
  company_id = public.current_user_company_id()
  and public.current_user_role() = 'CUSTOMER'
);

create policy "events_admin_all"
on public.events for all
to authenticated
using (public.current_user_role() = 'ADMIN')
with check (public.current_user_role() = 'ADMIN');

-- ============================================================================
-- event_sessions (join table; access mirrors the parent event)
-- ============================================================================

create policy "event_sessions_customer_read"
on public.event_sessions for select
to authenticated
using (
  exists (
    select 1 from public.events e
    where e.id = event_sessions.event_id
      and e.company_id = public.current_user_company_id()
      and public.current_user_role() = 'CUSTOMER'
  )
);

create policy "event_sessions_customer_write"
on public.event_sessions for all
to authenticated
using (
  exists (
    select 1 from public.events e
    where e.id = event_sessions.event_id
      and e.company_id = public.current_user_company_id()
      and public.current_user_role() = 'CUSTOMER'
  )
)
with check (
  exists (
    select 1 from public.events e
    where e.id = event_sessions.event_id
      and e.company_id = public.current_user_company_id()
      and public.current_user_role() = 'CUSTOMER'
  )
);

create policy "event_sessions_admin_all"
on public.event_sessions for all
to authenticated
using (public.current_user_role() = 'ADMIN')
with check (public.current_user_role() = 'ADMIN');
