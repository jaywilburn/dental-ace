import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { verifySetPasswordToken } from "@/lib/auth/set-password-token";

/*
  POST /api/auth/set-password — consumes a signed setpw token and sets the
  user's Supabase Auth password (service-role). Used by admin-provisioned staff
  to choose their own password. On success -> /login?set=1.
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
      `${origin}/set-password?token=${encodeURIComponent(String(token ?? ""))}&error=${encodeURIComponent(msg)}`,
      303,
    );

  if (!parsed.success) {
    return backToForm("Password must be at least 10 characters.", form.get("token"));
  }

  const userId = verifySetPasswordToken(parsed.data.token);
  if (!userId) {
    return NextResponse.redirect(
      `${origin}/set-password?error=${encodeURIComponent("This link is invalid or has expired.")}`,
      303,
    );
  }

  const admin = createServiceRoleClient();
  const { error } = await admin.auth.admin.updateUserById(userId, {
    password: parsed.data.password,
  });
  if (error) {
    return backToForm("Could not set the password. Please try again.", parsed.data.token);
  }

  return NextResponse.redirect(`${origin}/login?set=1`, 303);
}
