import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { prisma } from "@/lib/prisma";
import { homePathFor } from "@/lib/auth/session";

/*
  POST /api/auth/signin
  Route-handler sign-in. Uses the next/headers cookies() store so writes
  flow through Next's official cookie API. Diagnostic logs print every
  cookie the SDK tries to set + the final Set-Cookie header on the
  response.
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

  const cookieStore = await cookies();
  let setAllCalls = 0;
  const setNames: string[] = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll(cookiesToSet) {
          setAllCalls += 1;
          for (const { name, value, options } of cookiesToSet) {
            setNames.push(name);
            cookieStore.set(name, value, options);
          }
        },
      },
    },
  );

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data?.user) {
    console.error("[signin] signInWithPassword failed", error?.message);
    return redirectTo("/login?error=invalid");
  }

  const row = await prisma.user.findUnique({
    where: { id: data.user.id },
    select: { role: true },
  });
  if (!row?.role) {
    console.warn(`[signin] no role for ${data.user.id}`);
    return redirectTo("/login?error=norole");
  }

  const target = homePathFor(row.role);
  const sbCookies = cookieStore
    .getAll()
    .filter((c) => c.name.startsWith("sb-"))
    .map((c) => c.name);
  console.info(
    `[signin] role=${row.role} setAll_calls=${setAllCalls} set_names=[${setNames.join(",")}] store_now=[${sbCookies.join(",")}] -> ${target}`,
  );

  return redirectTo(target);
}
