import { NextResponse, type NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { boardSignupSchema } from "@/lib/board/signup-schema";
import { US_STATES } from "@/lib/protrack/reference";
import { signEmailVerificationToken } from "@/lib/auth/verification-token";
import { sendEmail } from "@/lib/email/send";
import { appBaseUrl } from "@/lib/app-url";
import VerifyEmail from "@/emails/verify-email";

/*
  POST /api/auth/register-board — public self-serve state-board sign-up.

  1. Validate the form with Zod (name/email/password/state/boardName all required).
  2. Reject states the form somehow sent that aren't in our US_STATES map.
  3. Create the Supabase Auth user (service-role, email NOT confirmed).
  4. In one transaction with a state-scoped advisory lock: find-or-create the
     `boards` row for this state and insert the `users` row with
     verify_access=true and board_id set. Multiple board admins in the same
     state share one board row.
  5. Email a signed verification link (same template as /api/auth/register).
     No session is minted until the email is confirmed.

  Trust model per the approved plan: no admin approval gate. Anyone claiming
  to be a state board can sign up. Mitigations (.gov allowlist, manual review)
  are v2.
*/

export const runtime = "nodejs";

function stateLockKey(state: string): bigint {
  // Postgres advisory lock keys are bigint. Hash the state code to a stable
  // signed 64-bit int so two registrations for the same state serialize.
  const buf = createHash("sha256").update(state).digest();
  // Top 8 bytes -> signed bigint
  return buf.readBigInt64BE(0);
}

export async function POST(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const form = await request.formData();

  const back = (message: string) =>
    NextResponse.redirect(
      `${origin}/signup/board?error=${encodeURIComponent(message)}`,
      303,
    );

  const parsed = boardSignupSchema.safeParse({
    firstName: form.get("firstName"),
    lastName: form.get("lastName"),
    email: form.get("email"),
    password: form.get("password"),
    state: form.get("state"),
    boardName: form.get("boardName"),
  });
  if (!parsed.success) {
    return back(parsed.error.issues[0]?.message ?? "Please check the form.");
  }
  const data = parsed.data;

  if (!US_STATES[data.state]) {
    return back("Pick a valid US state.");
  }

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

  try {
    await prisma.$transaction(async (tx) => {
      // Serialize per-state board-row creation so two simultaneous signups for
      // the same state don't race the find-or-create.
      await tx.$executeRaw`select pg_advisory_xact_lock(${stateLockKey(data.state)})`;

      const board = await tx.board.upsert({
        where: { state: data.state },
        create: { state: data.state, name: data.boardName },
        update: {}, // first registrant's board name wins; later ones don't overwrite
        select: { id: true },
      });

      await tx.user.create({
        data: {
          id: userId,
          email: data.email,
          firstName: data.firstName,
          lastName: data.lastName,
          verifyAccess: true,
          boardId: board.id,
        },
      });
    });
  } catch {
    // Roll back the orphaned auth user so the email can be retried.
    await admin.auth.admin.deleteUser(userId).catch(() => {});
    return back("Something went wrong creating your account. Please try again.");
  }

  const token = signEmailVerificationToken(userId);
  const verifyUrl = `${appBaseUrl(origin)}/api/auth/verify-email?token=${encodeURIComponent(token)}`;
  await sendEmail({
    to: data.email,
    subject: "Confirm your email",
    react: VerifyEmail({ firstName: data.firstName, verifyUrl }),
  }).catch(() => {});

  if (process.env.NODE_ENV !== "production") {
    console.info(`[verify-email:DEV_LINK] ${data.email} -> ${verifyUrl}`);
  }

  return NextResponse.redirect(
    `${origin}/signup/board?sent=${encodeURIComponent(data.email)}`,
    303,
  );
}
