import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { signEmailVerificationToken } from "@/lib/auth/verification-token";
import { sendEmail } from "@/lib/email/send";
import { appBaseUrl } from "@/lib/app-url";
import VerifyEmail from "@/emails/verify-email";

/*
  POST /api/auth/resend-verification — re-send the verification email.

  Always redirects to a neutral confirmation (no email enumeration). Only sends
  when an unverified account with that email exists.
*/

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const form = await request.formData();
  const email = String(form.get("email") ?? "")
    .trim()
    .toLowerCase();

  const done = NextResponse.redirect(`${origin}/login?resent=1`, 303);
  if (!email) return done;

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, firstName: true, emailVerifiedAt: true },
  });

  if (user && !user.emailVerifiedAt) {
    const token = signEmailVerificationToken(user.id);
    const verifyUrl = `${appBaseUrl(origin)}/api/auth/verify-email?token=${encodeURIComponent(token)}`;
    await sendEmail({
      to: email,
      subject: "Confirm your email",
      react: VerifyEmail({ firstName: user.firstName ?? "there", verifyUrl }),
    }).catch(() => {});
    if (process.env.NODE_ENV !== "production") {
      console.info(`[verify-email:DEV_LINK] ${email} -> ${verifyUrl}`);
    }
  }

  return done;
}
