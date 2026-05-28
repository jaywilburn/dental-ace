"use client";

import { createBrowserClient } from "@supabase/ssr";

/*
  Supabase client for use inside client components.
  Anon key only — RLS gates access.
*/
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
