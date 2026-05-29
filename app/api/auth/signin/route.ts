import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { prisma } from "@/lib/prisma";
import { homePathFor } from "@/lib/auth/session";

/*
  POST /api/auth/signin

  Route-handler sign-in. We use this instead of a server action because the
  server-action + redirect path in Next 16 with Turbopack doesn't reliably
  attach Set-Cookie headers from the @supabase/ssr setAll callback to the
  303 response. Route handlers let us control the NextResponse cookies
  directly, so the session always lands.

  Flow:
  1. Read email + password from form data.
  2. Create a Supabase server client that writes auth cookies straight onto
     this response.
  3. signInWithPassword. If it fails, redirect back to /login?error=invalid.
  4. Look up the public.users.role via Prisma (no RLS, fast).
  5. Redirect to the role's home; the response already carries the auth
     cookies, so the next request to /company / /reviewer / /admin reads
     the session cleanly.
*/

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const form = await request.formData();
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");

  const redirectTo = (path: string) => NextResponse.redirect(`${origin}${path}`, 303);

  if (!email || !password) return redirectTo("/login?error=missing");

  // Start with a redirect to a placeholder; we'll rewrite the location below
  // once we know where to send the user. NextResponse.redirect attaches the
  // status + Location header. The Supabase SSR client below writes auth
  // cookies straight onto `response.cookies`, which Set-Cookie's them.
  const response = NextResponse.redirect(`${origin}/login`, 303);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set({ name, value, ...options });
          }
        },
      },
    },
  );

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data?.user) {
    return redirectTo("/login?error=invalid");
  }

  const row = await prisma.user.findUnique({
    where: { id: data.user.id },
    select: { role: true },
  });
  if (!row?.role) {
    return redirectTo("/login?error=norole");
  }

  // Point the existing response (which carries the cookies) at the role's home.
  response.headers.set("Location", `${origin}${homePathFor(row.role)}`);
  return response;
}
