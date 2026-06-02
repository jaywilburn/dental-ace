import Link from "next/link";
import { redirect } from "next/navigation";
import { BrandMark } from "@/components/brand-mark";
import { getCurrentUser, homePathFor } from "@/lib/auth/session";

/*
  Public sign-in. One account for the whole platform; access is by entitlement
  after sign-in. Public sign-up lives at /signup. Unverified accounts are blocked
  here and offered a resend.

  Visuals mirror the v3 mockup: centered card on navy, gold accent.
*/
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; resent?: string; verified?: string }>;
}) {
  // If already signed in, skip the form and route to the platform hub.
  const current = await getCurrentUser();
  if (current) redirect(homePathFor());

  const { error, resent, verified } = await searchParams;
  const errorMessage = errorMessageFor(error);
  const unverified = error === "unverified";
  const info = verified
    ? "Your email is confirmed. Please sign in."
    : resent
      ? "Verification email sent. Check your inbox."
      : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-navy p-8">
      <div className="w-full max-w-[380px]">
        <form
          action="/api/auth/signin"
          method="POST"
          className="rounded-xl border border-white/10 bg-white/[0.05] p-7"
        >
          <div className="flex flex-col items-center gap-1">
            <BrandMark size="lg" />
            <p className="text-center text-xs text-white/35">
              AADB Accredited Continuing Education Program
            </p>
          </div>

          <div className="mt-6">
            <label
              htmlFor="email"
              className="mb-1.5 block text-[10px] font-semibold text-white/50"
            >
              Email address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="w-full rounded-md border border-white/[0.12] bg-white/[0.07] px-3 py-2.5 text-xs text-white outline-none transition focus:border-ace/60 focus:bg-white/[0.09]"
            />
          </div>

          <div className="mt-3">
            <label
              htmlFor="password"
              className="mb-1.5 block text-[10px] font-semibold text-white/50"
            >
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="w-full rounded-md border border-white/[0.12] bg-white/[0.07] px-3 py-2.5 text-xs text-white outline-none transition focus:border-ace/60 focus:bg-white/[0.09]"
            />
          </div>

          {info ? (
            <p className="mt-3 rounded-md bg-green-500/15 px-3 py-2 text-[11px] text-green-300">
              {info}
            </p>
          ) : null}
          {errorMessage ? (
            <p className="mt-3 rounded-md bg-red/20 px-3 py-2 text-[11px] text-red-bg">
              {errorMessage}
            </p>
          ) : null}

          <button
            type="submit"
            className="mt-5 w-full rounded-md bg-ace py-2.5 text-sm font-bold text-navy transition hover:bg-ace-light"
          >
            Sign in
          </button>

          <p className="mt-4 text-center text-[10px] text-white/30">
            New to DentalACE One?{" "}
            <Link className="text-ace-light" href="/signup">
              Create an account
            </Link>
          </p>
        </form>

        {unverified ? (
          <form
            action="/api/auth/resend-verification"
            method="POST"
            className="mt-3 rounded-xl border border-white/10 bg-white/[0.05] p-4"
          >
            <p className="mb-2 text-[11px] text-white/55">
              Confirm your email to sign in. Enter it to resend the link.
            </p>
            <div className="flex gap-2">
              <input
                name="email"
                type="email"
                required
                placeholder="you@example.com"
                className="w-full rounded-md border border-white/[0.12] bg-white/[0.07] px-3 py-2 text-xs text-white outline-none focus:border-ace/60"
              />
              <button
                type="submit"
                className="shrink-0 rounded-md border border-white/15 px-3 py-2 text-[11px] font-semibold text-white/70 transition hover:text-white"
              >
                Resend
              </button>
            </div>
          </form>
        ) : null}
      </div>
    </main>
  );
}

function errorMessageFor(error: string | undefined): string | null {
  switch (error) {
    case "missing":
      return "Email and password are required.";
    case "invalid":
      return "Invalid email or password.";
    case "unverified":
      return "Please confirm your email address before signing in.";
    case "verification":
      return "That verification link is invalid or expired. Resend it below.";
    case "noaccount":
      return "No account found. Try creating one.";
    case "forbidden":
      return "You don't have access to that area.";
    default:
      return null;
  }
}
