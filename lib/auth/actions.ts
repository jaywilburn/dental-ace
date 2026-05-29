"use server";

import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { homePathFor } from "@/lib/auth/session";

/*
  Server actions for sign-in / sign-out.
  Sign-up is intentionally absent: Phase 1 is invite-only (admin provisions users).

  Why we don't call getCurrentUser() here:
  signInWithPassword writes the session cookies via the SSR client's setAll
  callback, which stages them on the Next.js cookie store for the response.
  Reading them back in the same action via a fresh Supabase client (which
  PostgREST relies on for RLS-gated SELECTs) races against that staging.
  Instead, we use the user id from the signInWithPassword response directly
  and look up the role via Prisma (which uses DATABASE_URL, so RLS doesn't
  gate it). The post-redirect /company request reads cookies cleanly.
*/

export async function signIn(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    redirect("/login?error=missing");
  }

  const supabase = await createClient();

  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error || !data?.user) {
      redirect("/login?error=invalid");
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
    // next/navigation `redirect` throws to short-circuit; let it propagate.
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
