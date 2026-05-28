import { redirect } from "next/navigation";
import { BrandMark } from "@/components/brand-mark";
import { signIn } from "@/lib/auth/actions";
import { getCurrentUser, homePathFor } from "@/lib/auth/session";

/*
  Public sign-in page. Unified for all three private roles (CUSTOMER, REVIEWER,
  ADMIN). Phase 1 is invite-only, so there is no sign-up link. Role is read
  from the session after sign-in and determines the post-login redirect.

  Visuals mirror the v3 mockup: centered card on navy, gold accent.
*/
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  // If already signed in, skip the form and route to the home portal.
  const current = await getCurrentUser();
  if (current) redirect(homePathFor(current.role));

  const { error } = await searchParams;
  const errorMessage = errorMessageFor(error);

  return (
    <main className="flex min-h-screen items-center justify-center bg-navy p-8">
      <div className="w-full max-w-[380px]">
        <form
          action={signIn}
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
            Accounts are provisioned by AADB. Contact{" "}
            <a className="text-ace-light" href="mailto:info@dentalace.org">
              info@dentalace.org
            </a>{" "}
            for access.
          </p>
        </form>
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
    case "norole":
      return "Your account has no role assigned. Contact AADB to resolve.";
    case "forbidden":
      return "You don't have access to that portal.";
    default:
      return null;
  }
}
