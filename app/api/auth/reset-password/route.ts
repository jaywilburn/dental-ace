import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { verifyResetPasswordToken } from "@/lib/auth/reset-password-token";
import { confirmEmailAndActivate } from "@/lib/auth/activate-account";

/*
  POST /api/auth/reset-password — consumes a signed reset token and sets the
  user's Supabase Auth password (service-role). On success -> /login?reset=1.

  Because clicking the emailed link proves inbox ownership, a successful reset
  also activates an unverified account (confirmEmailAndActivate) so the user is
  not dead-ended at sign-in. That call is a no-op for already-verified users.

  Does NOT mint a session — the user signs in afterward with the new password
  (consistent with /api/auth/set-password and the verify-email security note).
*/

export const runtime = "nodejs";

const schema = z.object({
  token: z.string().min(1),
  password: z.string().min(10).max(200),
});

export async function POST(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const form = await request.formData();
  const parsed = schema.safeParse({
    token: form.get("token"),
    password: form.get("password"),
  });

  const backToForm = (msg: string, token: unknown) =>
    NextResponse.redirect(
      `${origin}/reset-password?token=${encodeURIComponent(String(token ?? ""))}&error=${encodeURIComponent(msg)}`,
      303,
    );

  if (!parsed.success) {
    return backToForm("Password must be at least 10 characters.", form.get("token"));
  }

  const userId = verifyResetPasswordToken(parsed.data.token);
  if (!userId) {
    return NextResponse.redirect(
      `${origin}/reset-password?error=${encodeURIComponent("This link is invalid or has expired.")}`,
      303,
    );
  }

  const admin = createServiceRoleClient();
  const { error } = await admin.auth.admin.updateUserById(userId, {
    password: parsed.data.password,
  });
  if (error) {
    return backToForm("Could not reset the password. Please try again.", parsed.data.token);
  }

  // The link proved inbox ownership; activate the account if it was never
  // verified (no-op otherwise). Best-effort — never block the completed reset.
  await confirmEmailAndActivate(userId, origin).catch(() => {});

  return NextResponse.redirect(`${origin}/login?reset=1`, 303);
}
