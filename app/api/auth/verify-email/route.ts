import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { verifyEmailVerificationToken } from "@/lib/auth/verification-token";
import { syncIssuedCertsForLicensee } from "@/lib/protrack/ace-sync";
import { sendEmail } from "@/lib/email/send";
import { appBaseUrl } from "@/lib/app-url";
import ProtrackWelcomeEmail from "@/emails/protrack-welcome";

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
    select: {
      id: true,
      email: true,
      firstName: true,
      emailVerifiedAt: true,
      licenses: {
        where: { isPrimary: true },
        select: { state: true, licenseType: true },
        take: 1,
      },
    },
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
    // The account is now active: send the ProTrack welcome. Fires once (inside
    // the first-verification block), so re-clicks / scanner pre-fetches don't
    // resend it. Best-effort — a send failure must not break verification.
    const primary = user.licenses[0];
    await sendEmail({
      to: user.email,
      subject: ProtrackWelcomeEmail.subject(),
      react: ProtrackWelcomeEmail({
        firstName: user.firstName ?? "there",
        state: primary?.state ?? null,
        licenseType: primary?.licenseType ?? null,
        dashboardUrl: `${appBaseUrl(origin)}/protrack`,
      }),
    }).catch(() => {});
  }

  // No session minted (see SECURITY note above). Send them to sign in.
  return NextResponse.redirect(`${origin}/login?verified=1`, 303);
}
