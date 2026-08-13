import { NextResponse, type NextRequest } from "next/server";
import { verifyEmailVerificationToken } from "@/lib/auth/verification-token";
import { confirmEmailAndActivate } from "@/lib/auth/activate-account";

/*
  GET /api/auth/verify-email?token=... — the link in the verification email.

  Verifies the signed token, then hands off to confirmEmailAndActivate, which
  marks the account verified, mirrors confirmation to Supabase Auth (so /login
  accepts it), runs the now-safe ACE certificate backfill, sends the welcome, and
  notifies ops — exactly once via an atomic claim. Then sends the user to /login
  to sign in.

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

  const userId = verifyEmailVerificationToken(token);
  if (!userId) return NextResponse.redirect(`${origin}/login?error=verification`, 303);

  // Idempotent activation (mirror to Auth, cert backfill, welcome, ops notice).
  // A re-click or a user already activated another way is a harmless no-op.
  await confirmEmailAndActivate(userId, origin);

  // No session minted (see SECURITY note above). Send them to sign in.
  return NextResponse.redirect(`${origin}/login?verified=1`, 303);
}
