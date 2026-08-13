import "server-only";
import { prisma } from "@/lib/prisma";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { syncIssuedCertsForLicensee } from "@/lib/protrack/ace-sync";
import { sendEmail } from "@/lib/email/send";
import { appBaseUrl } from "@/lib/app-url";
import { notifyAccountCreated } from "@/lib/auth/signup-notification";
import ProtrackWelcomeEmail from "@/emails/protrack-welcome";
import WelcomeDentalAceOneEmail from "@/emails/welcome-dental-ace-one";

/*
  Confirm a user's email and run the one-time account-activation side effects.

  Shared by the two entry points that can prove inbox ownership: the
  verify-email link (/api/auth/verify-email) and a completed password reset
  (/api/auth/reset-password) — clicking either proves the user owns the mailbox,
  so both should be able to activate an account that was never verified.

  The activation is an ATOMIC CLAIM: emailVerifiedAt is flipped null -> now in a
  single conditional UPDATE. Concurrent callers (an email-scanner prefetch racing
  the user's click, or a reset racing a late verify-link click) then can't both
  pass a read-then-check guard and double-fire the welcome + ops notification —
  only the caller that wins the claim (count === 1) runs the one-time side
  effects. Returns true iff THIS call performed the activation. Idempotent: an
  already-verified user is a no-op (returns false).
*/
export async function confirmEmailAndActivate(
  userId: string,
  origin?: string,
): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      firstName: true,
      signupIntent: true,
      licenses: {
        where: { isPrimary: true },
        select: { state: true, licenseType: true },
        take: 1,
      },
    },
  });
  if (!user) return false;

  const claimed = await prisma.user.updateMany({
    where: { id: userId, emailVerifiedAt: null },
    data: { emailVerifiedAt: new Date() },
  });
  if (claimed.count !== 1) return false;

  // Mirror to Supabase Auth so signInWithPassword accepts the account later.
  const admin = createServiceRoleClient();
  await admin.auth.admin.updateUserById(userId, { email_confirm: true }).catch(() => {});

  // Email is now proven — backfill any matching DentalACE-issued certificates.
  await syncIssuedCertsForLicensee(userId).catch(() => {});

  // The account is now active: send the welcome. Best-effort — a send failure
  // must not break activation.
  //
  // Company / staff signups may never use ProTrack, so they get the platform
  // welcome instead of leading with "Welcome to ProTrack" (client feedback).
  // Individuals (and legacy null rows) keep the ProTrack welcome.
  if (user.signupIntent === "COMPANY" || user.signupIntent === "STAFF") {
    await sendEmail({
      to: user.email,
      subject: WelcomeDentalAceOneEmail.subject(),
      react: WelcomeDentalAceOneEmail({
        firstName: user.firstName ?? "there",
        intent: user.signupIntent === "STAFF" ? "staff" : "company",
        homeUrl: `${appBaseUrl(origin)}/home`,
      }),
    }).catch(() => {});
  } else {
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

  // Notify AADB ops that a new account is now active (who + which type).
  // Best-effort (logs, never throws). Inside the claim so it fires exactly once.
  await notifyAccountCreated(userId, origin);

  return true;
}
