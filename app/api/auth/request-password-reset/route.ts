import { NextResponse, type NextRequest } from "next/server";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { signResetPasswordToken } from "@/lib/auth/reset-password-token";
import { sendEmail } from "@/lib/email/send";
import { appBaseUrl } from "@/lib/app-url";
import ResetPasswordEmail from "@/emails/reset-password";

/*
  POST /api/auth/request-password-reset — start a password reset.

  Always redirects to a neutral confirmation (no email enumeration). Only sends a
  reset link when an account with that email exists AND is not suspended. Rate
  limited per (ip, email); over-limit requests are silently dropped (still
  neutral) so throttling can't be used as an oracle either.

  Modeled on /api/auth/resend-verification, with rate limiting added. The link is
  built with appBaseUrl() (pinned to NEXT_PUBLIC_APP_URL), never the request
  Host, to prevent host-header injection from pointing the link at an attacker.
*/

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const form = await request.formData();
  const email = String(form.get("email") ?? "")
    .trim()
    .toLowerCase();

  const done = NextResponse.redirect(`${origin}/login?reset_sent=1`, 303);
  if (!email) return done;

  const ip = ((await headers()).get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
  const limited = rateLimit(`reset:${ip}:${email}`, { limit: 5, windowMs: 15 * 60 * 1000 });
  if (!limited.ok) return done;

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, firstName: true, disabledAt: true },
  });

  // Send only to a real, non-suspended account. Anything else falls through to
  // the same neutral redirect.
  if (user && !user.disabledAt) {
    const token = signResetPasswordToken(user.id);
    const resetUrl = `${appBaseUrl(origin)}/reset-password?token=${encodeURIComponent(token)}`;
    await sendEmail({
      to: email,
      subject: ResetPasswordEmail.subject(),
      react: ResetPasswordEmail({ firstName: user.firstName ?? "there", resetUrl }),
    }).catch(() => {});
    if (process.env.NODE_ENV !== "production") {
      console.info(`[reset-password:DEV_LINK] ${email} -> ${resetUrl}`);
    }
  }

  return done;
}
