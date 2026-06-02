import "server-only";
import { redirect } from "next/navigation";
import { PlanTier } from "@prisma/client";
import { requireUser, type SessionUser } from "@/lib/auth/session";

/*
  ProTrack Pro gating. The tier + expiry live on the user row (SessionUser), so
  no extra query is needed. Every Pro page AND every Pro server action/route must
  call requireProtrackPro() — hiding the nav item is not a gate. A FREE account
  that navigates to a Pro URL is redirected to the upgrade page.
*/

export function isProActive(user: {
  protrackTier: PlanTier;
  proExpiresAt: Date | null;
}): boolean {
  return (
    user.protrackTier === PlanTier.PRO &&
    (user.proExpiresAt === null || user.proExpiresAt > new Date())
  );
}

/** Require an active Pro account or redirect to the upgrade page. */
export async function requireProtrackPro(): Promise<SessionUser> {
  const user = await requireUser();
  if (!isProActive(user)) {
    redirect("/protrack/upgrade?gate=pro");
  }
  return user;
}
