import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { boardSignupSchema } from "@/lib/board/signup-schema";
import { JURISDICTIONS } from "@/lib/protrack/reference";
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
   5. In a tx: create the users row + a PENDING BOARD AccessRequest.
      Board row + verify_access are granted at admin approval (applyBoardGrant).
   6. Email a signed verification link; no session is minted until verified.
*/

export const runtime = "nodejs";

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

  if (!JURISDICTIONS[data.state]) {
    return back("Pick a valid state or province.");
  }

  // Pre-check: is this state already claimed? Fail fast before we burn an
  // auth user. This only catches states with an already-APPROVED board row;
  // the real first-claim race is resolved at approval time in applyBoardGrant
  // (advisory lock + re-check).
  const existingBoard = await prisma.board.findUnique({
    where: { state: data.state },
    select: { id: true },
  });
  if (existingBoard) {
    return back(
      `${JURISDICTIONS[data.state]} is already registered with Verify. If you're a board admin who needs access, contact info@dentalace.org to be added.`,
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

  // Create the user row + a PENDING BOARD AccessRequest.
  // Board row + verify_access are granted at admin approval (applyBoardGrant);
  // the .gov gate + claim pre-check above are request-time filters.
  // The request is created unverified; the user can't sign in until they confirm their email.
  try {
    await prisma.$transaction(async (tx) => {
      await tx.user.create({
        data: { id: userId, email: data.email, firstName: data.firstName, lastName: data.lastName },
      });
      await tx.accessRequest.create({
        data: {
          userId,
          kind: "BOARD",
          payload: { state: data.state, boardName: data.boardName },
          label: `${JURISDICTIONS[data.state]}, ${data.boardName}`,
        },
      });
    });
  } catch {
    // Always roll back the orphaned auth user so the email can be retried.
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
