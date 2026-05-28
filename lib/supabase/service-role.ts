import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/*
  Service-role Supabase client.

  Bypasses RLS — used ONLY for trusted server-side work:
  - Stripe webhook handlers (decrementing credits/cert balance atomically)
  - Vercel cron jobs (expiry reminders)
  - Server-side cert PDF generation + storage upload
  - Admin override operations

  `server-only` makes any client-side import a build error.
  Never import this from a client component, never expose the key in env vars
  with a NEXT_PUBLIC_ prefix.
*/
export function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing Supabase service-role credentials. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  return createSupabaseClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
