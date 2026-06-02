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

  Trust model (per the approved plan + the post-commit security review):

  - FIRST claim for a state requires a `.gov` email. State dental boards
    universally use .gov domains (tsbde.texas.gov, dental.ohio.gov, etc.), so
    this is a low-bar but meaningful proof that the registrant controls a
    government-issued address before we hand them administrative privileges
    over an entire state's licensee population.
  - SUBSEQUENT registrations for a state that's already claimed are REJECTED.
    Additional board admins join via invite from an existing admin (settings
    flow ships in a follow-up; today the only path is direct DB grant or the
    seed script).
  - Domain check happens BEFORE the auth user is created so we don't leak
    "this email exists in Supabase" to a non-.gov caller.

  Steps:
   1. Validate the form (Zod).
   2. Reject if state already has a boards row (with friendly explanation).
   3. Reject if email domain isn't .gov (first-claim gate).
   4. Create the Supabase Auth user (service-role, email NOT confirmed).
   5. In a tx with a state-scoped advisory lock: re-check the boards row
      doesn't exist (closes the race between step 2 and now), create it,
      insert the users row with verify_access=true + board_id.
   6. Email a signed verification link; no session is minted until verified.
*/

export const runtime = "nodejs";

function stateLockKey(state: string): bigint {
  // Postgres advisory lock keys are bigint. Hash the state code to a stable
  // signed 64-bit int so two registrations for the same state serialize.
  const buf = createHash("sha256").update(state).digest();
  // Top 8 bytes -> signed bigint
  return buf.readBigInt64BE(0);
}

function isGovernmentEmail(email: string): boolean {
  // Accept any subdomain of .gov. Covers state-board domains like
  // tsbde.texas.gov, dental.ohio.gov, bsd.maryland.gov. Conservative on
  // purpose — federal/state .gov DNS is a registry-controlled namespace
  // requiring proof of government affiliation to register.
  const at = email.lastIndexOf("@");
  if (at < 0) return false;
  const domain = email.slice(at + 1).toLowerCase();
  return domain === "gov" || domain.endsWith(".gov");
}

const STATE_CLAIMED_SENTINEL = "STATE_ALREADY_CLAIMED";

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

  // Pre-check: is this state already claimed? Fail fast before we burn an
  // auth user. We re-check inside the tx below to close the race window.
  const existingBoard = await prisma.board.findUnique({
    where: { state: data.state },
    select: { id: true },
  });
  if (existingBoard) {
    return back(
      `${US_STATES[data.state]} is already registered with Verify. If you're a board admin who needs access, contact info@dentalace.org to be added.`,
    );
  }

  // First-claim gate: require a .gov email so we have at least minimal proof
  // the registrant controls a government-issued address.
  if (!isGovernmentEmail(data.email)) {
    return back(
      "Registering a new state board requires a .gov email address (for example, yourname@your-state-board.gov). If your board uses a different domain, contact info@dentalace.org.",
    );
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

  let alreadyClaimed = false;
  try {
    await prisma.$transaction(async (tx) => {
      // Serialize per-state board-row creation so two simultaneous signups for
      // the same state don't race the find-or-create.
      await tx.$executeRaw`select pg_advisory_xact_lock(${stateLockKey(data.state)})`;

      // Re-check inside the lock — closes the window between the pre-check and
      // now. If two .gov registrants for the same state arrived in parallel,
      // exactly one wins; the other gets the same "already claimed" message.
      const existing = await tx.board.findUnique({
        where: { state: data.state },
        select: { id: true },
      });
      if (existing) {
        throw new Error(STATE_CLAIMED_SENTINEL);
      }

      const board = await tx.board.create({
        data: { state: data.state, name: data.boardName },
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
  } catch (err) {
    // Always roll back the orphaned auth user so the email can be retried.
    await admin.auth.admin.deleteUser(userId).catch(() => {});
    if (err instanceof Error && err.message === STATE_CLAIMED_SENTINEL) {
      alreadyClaimed = true;
    } else {
      return back("Something went wrong creating your account. Please try again.");
    }
  }
  if (alreadyClaimed) {
    return back(
      `${US_STATES[data.state]} was just registered by someone else. If you're a board admin who needs access, contact info@dentalace.org to be added.`,
    );
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
