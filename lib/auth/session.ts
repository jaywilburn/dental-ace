import "server-only";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import type { StaffRole, PlanTier } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE_NAME, verifySession } from "@/lib/auth/session-cookie";

/*
  Read the current user from our HMAC-signed session cookie (userId only) + a
  Prisma lookup for the account's access. Access is entitlement-based:
   - staffRole     -> internal staff areas (/reviewer, /admin)
   - companyId     -> DentalACE (/company)
   - protrackTier  -> ProTrack (/protrack); every account has at least FREE
   - verifyAccess  -> Verify (/verify)

  Feature-area layouts call the require* guards below to bounce accounts that
  lack the entitlement. A logged-in account lands on the /home hub.
*/

export type SessionUser = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  staffRole: StaffRole;
  companyId: string | null;
  protrackTier: PlanTier;
  proExpiresAt: Date | null;
  verifyAccess: boolean;
  boardId: string | null;
};

export async function getCurrentUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME);
  if (!raw) return null;

  const payload = verifySession(raw.value);
  if (!payload) return null;

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: {
      email: true,
      firstName: true,
      lastName: true,
      staffRole: true,
      companyId: true,
      protrackTier: true,
      proExpiresAt: true,
      verifyAccess: true,
      boardId: true,
    },
  });
  if (!user) return null;

  return { id: payload.userId, ...user };
}

/** Any signed-in account (the floor for ProTrack, which every account has). */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Internal staff areas. ADMIN satisfies a REVIEWER requirement. */
export async function requireStaff(min: "REVIEWER" | "ADMIN"): Promise<SessionUser> {
  const user = await requireUser();
  const ok =
    user.staffRole === "ADMIN" ||
    (min === "REVIEWER" && user.staffRole === "REVIEWER");
  if (!ok) redirect("/home");
  return user;
}

/** DentalACE: the account belongs to a provider company. */
export async function requireDentalAce(): Promise<SessionUser> {
  const user = await requireUser();
  if (!user.companyId) redirect("/home");
  return user;
}

/** Verify: admin-granted entitlement (ADMIN also passes). */
export async function requireVerify(): Promise<SessionUser> {
  const user = await requireUser();
  if (!user.verifyAccess && user.staffRole !== "ADMIN") redirect("/home");
  return user;
}

/** Post-login landing: the platform hub. */
export function homePathFor(): string {
  return "/home";
}
