import "server-only";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import type { Role } from "@prisma/client";
import { createClient } from "@/lib/supabase/server";

/*
  Resolve the current user's session + role.

  Reads role from the JWT (app_metadata.role) first - that's the fast path,
  populated by the Custom Access Token Hook in sql-migrations/0005. If the hook
  isn't enabled yet (or the user was just created and their JWT hasn't been
  refreshed), falls back to a SELECT on public.users.

  Returns null if the user isn't signed in.
*/

export type SessionUser = {
  id: string;
  email: string;
  role: Role;
  companyId: string | null;
};

export async function getCurrentUser(): Promise<SessionUser | null> {
  // Always log incoming sb-* cookies so we can see what /company is actually receiving.
  const cookieStore = await cookies();
  const incomingSb = cookieStore
    .getAll()
    .filter((c) => c.name.startsWith("sb-"))
    .map((c) => `${c.name}(len=${c.value.length})`);
  console.info(`[getCurrentUser] sb-cookies-on-request=[${incomingSb.join(", ") || "(none)"}]`);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  const user = data?.user ?? null;

  if (!user) {
    console.warn(
      `[getCurrentUser] getUser returned null despite ${incomingSb.length} sb-* cookies; error=${error ? `${error.name}: ${error.message}` : "(none)"}`,
    );
    return null;
  }

  const jwtRole = user.app_metadata?.role as Role | undefined;
  const jwtCompanyId = user.app_metadata?.company_id as string | null | undefined;

  if (jwtRole) {
    return {
      id: user.id,
      email: user.email ?? "",
      role: jwtRole,
      companyId: jwtCompanyId ?? null,
    };
  }

  // Fallback: hook not enabled yet, look it up.
  const { data: row } = await supabase
    .from("users")
    .select("role, company_id")
    .eq("id", user.id)
    .single();

  if (!row?.role) return null;

  return {
    id: user.id,
    email: user.email ?? "",
    role: row.role as Role,
    companyId: row.company_id ?? null,
  };
}

/*
  Guard helper for portal layouts. Redirects to /login if no session, /403 if
  the role doesn't match. Returns the session user when allowed.
*/
export async function requireRole(role: Role): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    console.warn(`[requireRole:${role}] no session — redirecting to /login`);
    redirect("/login");
  }
  if (user.role !== role) {
    console.warn(
      `[requireRole:${role}] mismatched role=${user.role} — redirecting to /403`,
    );
    redirect("/403");
  }
  return user;
}

/*
  Where each role's landing page lives. Used by the login flow and any
  redirect-after-auth helpers.
*/
export function homePathFor(role: Role): string {
  switch (role) {
    case "CUSTOMER":
      return "/company";
    case "REVIEWER":
      return "/reviewer";
    case "ADMIN":
      return "/admin";
    default:
      return "/login";
  }
}
