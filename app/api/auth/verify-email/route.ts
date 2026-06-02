import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { verifyEmailVerificationToken } from "@/lib/auth/verification-token";
import { syncIssuedCertsForLicensee } from "@/lib/protrack/ace-sync";

/*
  GET /api/auth/verify-email?token=... — the link in the verification email.

  Verifies the signed token, marks the account verified, mirrors confirmation to
  Supabase Auth (so /login accepts it), runs the now-safe ACE certificate
  backfill, then sends the user to /login to sign in.

  SECURITY: this does NOT mint a session. Auto-signing-in from a GET link is a
  login-CSRF / session-fixation vector — a forced navigation to a valid link
  would log a victim into the token owner's account. The user signs in normally
  afterward, proving ownership with their password. Verification is idempotent
  (re-clicks / email-scanner pre-fetches just re-confirm).
*/

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const fail = () =>
    NextResponse.redirect(`${origin}/login?error=verification`, 303);

  const userId = verifyEmailVerificationToken(token);
  if (!userId) return fail();

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, emailVerifiedAt: true },
  });
  if (!user) return fail();

  if (!user.emailVerifiedAt) {
    await prisma.user.update({
      where: { id: userId },
      data: { emailVerifiedAt: new Date() },
    });
    // Mirror to Supabase Auth so signInWithPassword accepts the account later.
    const admin = createServiceRoleClient();
    await admin.auth.admin
      .updateUserById(userId, { email_confirm: true })
      .catch(() => {});
    // Email is now proven — backfill any matching DentalACE-issued certificates.
    await syncIssuedCertsForLicensee(userId).catch(() => {});
  }

  // No session minted (see SECURITY note above). Send them to sign in.
  return NextResponse.redirect(`${origin}/login?verified=1`, 303);
}
