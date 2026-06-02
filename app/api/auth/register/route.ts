import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { registerSchema } from "@/lib/protrack/register-schema";
import { STATE_CODES } from "@/lib/protrack/reference";
import { signEmailVerificationToken } from "@/lib/auth/verification-token";
import { sendEmail } from "@/lib/email/send";
import { appBaseUrl } from "@/lib/app-url";
import VerifyEmail from "@/emails/verify-email";

/*
  POST /api/auth/register — public self-serve platform sign-up.

  1. Validate the form with Zod (name/email/password required; license optional).
  2. Create the Supabase Auth user (service-role, email NOT confirmed).
  3. In one transaction: the users row (protrack_tier FREE, email_verified_at
     null) + an optional primary user_license, consuming a valid board invite.
  4. Email a signed verification link. NO session is minted and NO certificate
     backfill runs until the email is confirmed (/api/auth/verify-email), which
     proves the registrant controls the address.

  On validation/auth failure, redirect back to /signup with an error message;
  on success redirect to /signup?sent= (the "check your email" state).
*/

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const form = await request.formData();

  const back = (message: string) =>
    NextResponse.redirect(
      `${origin}/signup?error=${encodeURIComponent(message)}`,
      303,
    );

  const parsed = registerSchema.safeParse({
    firstName: form.get("firstName"),
    lastName: form.get("lastName"),
    email: form.get("email"),
    password: form.get("password"),
    licenseType: form.get("licenseType") || undefined,
    primaryState: form.get("primaryState") || undefined,
    licenseNumber: form.get("licenseNumber") || undefined,
    inviteCode: form.get("inviteCode") || undefined,
  });
  if (!parsed.success) {
    return back(parsed.error.issues[0]?.message ?? "Please check the form.");
  }
  const data = parsed.data;

  // Validate an optional board invite up front (an invalid code is ignored, not
  // fatal — the code is a convenience association).
  const invite = data.inviteCode
    ? await prisma.boardInvite.findUnique({ where: { code: data.inviteCode } })
    : null;
  const inviteUsable =
    invite &&
    !invite.usedByUserId &&
    (!invite.expiresAt || invite.expiresAt > new Date());

  // Create the auth user (service-role admin API). Email is NOT confirmed: the
  // account stays unverified until the user clicks the verification link.
  const admin = createServiceRoleClient();
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: data.email,
    password: data.password,
    email_confirm: false,
  });
  if (createErr || !created?.user) {
    return back("That email is already registered. Try signing in instead.");
  }
  const userId = created.user.id;

  // ProTrack license is optional at sign-up (a non-licensee can create an
  // account too). When provided, compute a renewal date from the state requirement.
  const hasLicense = !!(
    data.licenseType &&
    data.primaryState &&
    STATE_CODES.includes(data.primaryState) &&
    data.licenseNumber &&
    data.licenseNumber.length >= 2
  );

  let renewalDate: Date | null = null;
  if (hasLicense) {
    const requirement = await prisma.stateRequirement.findUnique({
      where: {
        state_licenseType: {
          state: data.primaryState!,
          licenseType: data.licenseType!,
        },
      },
      select: { cycleMonths: true, renewalMonth: true },
    });
    const cycleMonths = requirement?.cycleMonths ?? 24;
    const renewalMonth = requirement?.renewalMonth ?? 12;
    const renewalYear =
      new Date().getUTCFullYear() + Math.max(1, Math.round(cycleMonths / 12));
    renewalDate = new Date(Date.UTC(renewalYear, renewalMonth, 0));
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.user.create({
        data: {
          id: userId,
          email: data.email,
          firstName: data.firstName,
          lastName: data.lastName,
          protrackTier: "FREE",
        },
      });
      if (hasLicense && renewalDate) {
        await tx.userLicense.create({
          data: {
            licenseeId: userId,
            state: data.primaryState!,
            licenseType: data.licenseType!,
            licenseNumber: data.licenseNumber!,
            renewalDate,
            isPrimary: true,
          },
        });
      }
      if (inviteUsable && invite) {
        await tx.boardInvite.update({
          where: { id: invite.id },
          data: { usedByUserId: userId, usedAt: new Date() },
        });
      }
    });
  } catch {
    // Roll back the orphaned auth user so the email can be retried.
    await admin.auth.admin.deleteUser(userId).catch(() => {});
    return back("Something went wrong creating your account. Please try again.");
  }

  // Email the signed verification link. The ACE certificate backfill happens in
  // /api/auth/verify-email, only after the email is confirmed (so an unverified
  // account can never harvest CE history by email).
  const token = signEmailVerificationToken(userId);
  const verifyUrl = `${appBaseUrl(origin)}/api/auth/verify-email?token=${encodeURIComponent(token)}`;
  await sendEmail({
    to: data.email,
    subject: "Confirm your email",
    react: VerifyEmail({ firstName: data.firstName, verifyUrl }),
  }).catch(() => {});

  // Dev convenience: surface the link so it's clickable without a real inbox.
  if (process.env.NODE_ENV !== "production") {
    console.info(`[verify-email:DEV_LINK] ${data.email} -> ${verifyUrl}`);
  }

  return NextResponse.redirect(
    `${origin}/signup?sent=${encodeURIComponent(data.email)}`,
    303,
  );
}
