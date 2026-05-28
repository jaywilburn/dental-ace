"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, homePathFor } from "@/lib/auth/session";

/*
  Server actions for sign-in / sign-out.
  Sign-up is intentionally absent: Phase 1 is invite-only (admin provisions users).
*/

export async function signIn(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    redirect("/login?error=missing");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(`/login?error=${encodeURIComponent("invalid")}`);
  }

  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?error=norole");
  }

  redirect(homePathFor(user.role));
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
