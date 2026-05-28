import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/*
  Supabase client for server components, server actions, and route handlers.

  Uses the anon key — RLS policies do all access control. Reads the user's
  session from cookies on every call. Per CLAUDE.md, we don't run middleware,
  so session refresh happens inside route-group layouts that call supabase.auth.getUser().
*/
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // setAll fails when called from a server component (read-only cookies).
            // Layouts that need to refresh sessions can call supabase.auth.getUser()
            // safely from a server action or route handler instead.
          }
        },
      },
    },
  );
}
