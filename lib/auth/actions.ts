"use server";

import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { homePathFor } from "@/lib/auth/session";

/*
  Server actions for sign-in / sign-out.
  Sign-up is intentionally absent: Phase 1 is invite-only (admin provisions users).

  About the cookie write:
  We rely on the @supabase/ssr server client's setAll callback to write the
  session cookies during signInWithPassword. As a belt-and-suspenders, after
  signInWithPassword we read back the auth cookies from the store and log
  any that look empty — that's enough to debug if a session ever fails to
  land. The post-redirect /company request reads cookies cleanly.
*/

export async function signIn(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    redirect("/login?error=missing");
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error || !data?.user) {
      redirect("/login?error=invalid");
    }

    // Sanity check: at least one Supabase auth cookie should be present after
    // signInWithPassword. If not, the SDK never managed to write to the cookie
    // store. We log + force-write the session ourselves so the next request
    // actually carries it.
    const cookieStore = await cookies();
    const sbCookies = cookieStore.getAll().filter((c) => c.name.startsWith("sb-"));
    if (sbCookies.length === 0 && data.session) {
      console.warn(
        "[signIn] supabase ssr did not stage auth cookies; falling back to setSession",
      );
      // setSession triggers the SDK's internal cookie write through the same
      // setAll callback — but does so unconditionally now that the SDK is
      // fully initialised.
      await supabase.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      });
    }

    const row = await prisma.user.findUnique({
      where: { id: data.user.id },
      select: { role: true },
    });

    if (!row?.role) {
      redirect("/login?error=norole");
    }

    redirect(homePathFor(row.role));
  } catch (err) {
    // next/navigation `redirect` throws to short-circuit; let those propagate.
    if (isRedirectError(err)) throw err;
    console.error("[signIn] unexpected", err);
    redirect("/login?error=invalid");
  }
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
