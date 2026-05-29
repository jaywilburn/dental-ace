import "server-only";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE_NAME, verifySession } from "@/lib/auth/session-cookie";

/*
  Read the current user from our HMAC-signed session cookie + a Prisma lookup
  for the bits we don't put in the cookie (email, companyId). Returns null if:
   - cookie missing, malformed, or expired
   - role on disk has drifted from the role baked into the cookie
   - the user record was deleted

  Layouts use requireRole(...) to bounce unauthenticated/role-mismatched users.
*/

export type SessionUser = {
  id: string;
  email: string;
  role: Role;
  companyId: string | null;
};

export async function getCurrentUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME);
  if (!raw) return null;

  const payload = verifySession(raw.value);
  if (!payload) return null;

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { email: true, role: true, companyId: true },
  });
  if (!user) return null;
  if (user.role !== payload.role) return null;

  return {
    id: payload.userId,
    email: user.email,
    role: user.role,
    companyId: user.companyId,
  };
}

export async function requireRole(role: Role): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== role) redirect("/403");
  return user;
}

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
