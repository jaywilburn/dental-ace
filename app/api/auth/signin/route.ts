import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { homePathFor } from "@/lib/auth/session";
import { rateLimit } from "@/lib/rate-limit";
import {
  signSession,
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_OPTIONS,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/auth/session-cookie";

/*
  POST /api/auth/signin

  1. Validate credentials via supabase.auth.signInWithPassword.
  2. Look up the user's role via Prisma.
  3. Mint our own HMAC-signed session cookie.
  4. Redirect to the role's home portal with the cookie attached.

  Direct @supabase/supabase-js, not @supabase/ssr. The Supabase session is
  thrown away after credential validation; our cookie is the source of
  session truth from here on.
*/

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const form = await request.formData();
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");

  const redirectTo = (path: string) =>
    NextResponse.redirect(`${origin}${path}`, 303);

  if (!email || !password) return redirectTo("/login?error=missing");

  const ip = ((await headers()).get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
  const limited = rateLimit(`signin:${ip}:${email.toLowerCase()}`, { limit: 8, windowMs: 15 * 60 * 1000 });
  if (!limited.ok) return redirectTo("/login?error=rate_limited");

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data?.user) {
    // Supabase rejects unconfirmed emails when "Confirm email" is on; surface the
    // precise message (with a resend) instead of a generic invalid-credentials.
    const unconfirmed =
      error?.code === "email_not_confirmed" ||
      /not confirmed/i.test(error?.message ?? "");
    return redirectTo(unconfirmed ? "/login?error=unverified" : "/login?error=invalid");
  }

  const row = await prisma.user.findUnique({
    where: { id: data.user.id },
    select: { id: true, emailVerifiedAt: true },
  });
  if (!row) return redirectTo("/login?error=noaccount");
  // Block accounts whose email has not been verified (no harvest, no access).
  if (!row.emailVerifiedAt) return redirectTo("/login?error=unverified");

  const response = redirectTo(homePathFor());
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: signSession({ userId: data.user.id }),
    maxAge: SESSION_MAX_AGE_SECONDS,
    ...SESSION_COOKIE_OPTIONS,
  });
  return response;
}
