import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/*
  Supabase client for server components, server actions, and route handlers.

  Uses the anon key — RLS policies do all access control. Reads the user's
  session from cookies on every call.

  About the setAll callback:
  - In server components, `cookieStore.set` throws because the response is
    read-only. We swallow that case and log to stderr so we can spot it.
  - In server actions and route handlers, `set` succeeds and the cookies
    flow into the response. Any unexpected throw is logged so we don't
    silently lose a session write.
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
          for (const { name, value, options } of cookiesToSet) {
            try {
              cookieStore.set(name, value, options);
            } catch (err) {
              // Server components have a read-only cookie store; that's expected
              // and harmless because the next server-action/route-handler call
              // will re-write the session. Anything else is a real bug.
              if (
                err instanceof Error &&
                /cookies.*server component|read-only/i.test(err.message)
              ) {
                continue;
              }
              console.error(`[supabase] cookieStore.set('${name}') failed`, err);
            }
          }
        },
      },
    },
  );
}
