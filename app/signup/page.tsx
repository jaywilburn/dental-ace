import Link from "next/link";
import { redirect } from "next/navigation";
import { BrandMark } from "@/components/brand-mark";
import { getCurrentUser } from "@/lib/auth/session";
import { LICENSE_TYPE_OPTIONS } from "@/lib/protrack/reference";
import { JurisdictionOptions } from "@/components/jurisdiction-options";

/*
  Public platform sign-up. One account for DentalACE One; every new account gets
  ProTrack Free. The ProTrack license fields are optional (a CE provider can sign
  up without one). Plain HTML form posting to /api/auth/register, which sets the
  session cookie and redirects (server actions can't reliably set cookies under
  Next 16 + Turbopack). Validation errors come back via ?error=.

  Step 0: When ?as= is absent or invalid, a role-picker chooser is shown so the
  user can declare what they're here to do. The `as` param is display-only and is
  NOT posted to /api/auth/register.
*/

const fieldClass =
  "w-full rounded-md border border-border bg-white px-3 py-2 text-[13px] text-navy outline-none focus:border-ace";
const labelClass = "mb-1 block text-[11px] font-semibold text-text-mid";


type ValidRole = "individual" | "company";

function isValidRole(as: string | undefined): as is ValidRole {
  return as === "individual" || as === "company";
}

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    sent?: string;
    as?: string;
    email?: string;
  }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect("/home");

  const { error, sent, as, email } = await searchParams;
  if (sent) return <CheckYourEmail email={sent} />;

  if (!isValidRole(as)) {
    return <RoleChooser />;
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-navy px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="mb-5 flex flex-col items-center text-center text-white">
          <BrandMark tag="AADB" size="lg" />
          <h1 className="mt-3 font-serif text-2xl font-bold text-balance">
            Create your DentalACE One account
          </h1>
          <p className="mt-1 max-w-sm text-[12px] text-white/55 text-pretty">
            {as === "individual"
              ? "Track your CE with ProTrack Free. You can add DentalACE or Verify later."
              : "Create your account first. After you confirm your email and sign in, you'll request CE Company access from your home screen."}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-white p-6 shadow-sm">
          <div className="mb-4">
            <Link
              href="/signup"
              className="text-[11px] font-semibold text-text-muted hover:text-navy"
            >
              ← Change
            </Link>
          </div>

          {error ? (
            <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700 text-pretty">
              {error}
            </p>
          ) : null}

          <form method="POST" action="/api/auth/register" className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="firstName" className={labelClass}>
                  First name
                </label>
                <input
                  id="firstName"
                  name="firstName"
                  className={fieldClass}
                  required
                  autoComplete="given-name"
                />
              </div>
              <div>
                <label htmlFor="lastName" className={labelClass}>
                  Last name
                </label>
                <input
                  id="lastName"
                  name="lastName"
                  className={fieldClass}
                  required
                  autoComplete="family-name"
                />
              </div>
            </div>

            <div>
              <label htmlFor="email" className={labelClass}>
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                className={fieldClass}
                required
                autoComplete="email"
                defaultValue={email ?? ""}
              />
            </div>

            <div>
              <label htmlFor="password" className={labelClass}>
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                minLength={8}
                className={fieldClass}
                required
                autoComplete="new-password"
              />
              <p className="mt-1 text-[10px] text-text-muted">
                At least 8 characters.
              </p>
            </div>

            {as === "individual" ? (
              <fieldset className="rounded-lg border border-border bg-surface/40 p-3">
                <legend className="px-1 text-[11px] font-semibold text-text-mid">
                  Track your CE{" "}
                  <span className="font-normal text-text-muted">
                    (optional, add it now or later)
                  </span>
                </legend>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="licenseType" className={labelClass}>
                      License type
                    </label>
                    <select
                      id="licenseType"
                      name="licenseType"
                      className={fieldClass}
                      defaultValue=""
                    >
                      <option value="">Not now</option>
                      {LICENSE_TYPE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="primaryState" className={labelClass}>
                      Primary state/province
                    </label>
                    <select
                      id="primaryState"
                      name="primaryState"
                      className={fieldClass}
                      defaultValue=""
                    >
                      <option value="">Not now</option>
                      <JurisdictionOptions />
                    </select>
                  </div>
                </div>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="licenseNumber" className={labelClass}>
                      License number
                    </label>
                    <input
                      id="licenseNumber"
                      name="licenseNumber"
                      className={fieldClass}
                    />
                  </div>
                  <div>
                    <label htmlFor="inviteCode" className={labelClass}>
                      Board invite code{" "}
                      <span className="font-normal text-text-muted">(optional)</span>
                    </label>
                    <input
                      id="inviteCode"
                      name="inviteCode"
                      className={fieldClass}
                    />
                  </div>
                </div>
              </fieldset>
            ) : null}

            <button
              type="submit"
              className="w-full rounded-md bg-navy px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-navy/90"
            >
              Create Free Account
            </button>
          </form>
        </div>

        <p className="mt-4 text-center text-[12px] text-white/55">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-ace-light hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}

function RoleChooser() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-navy px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="mb-5 flex flex-col items-center text-center text-white">
          <BrandMark tag="AADB" size="lg" />
          <h1 className="mt-3 font-serif text-2xl font-bold text-balance">
            Create your DentalACE One account
          </h1>
          <p className="mt-1 max-w-sm text-[12px] text-white/55 text-pretty">
            First, what brings you here?
          </p>
        </div>

        <div className="rounded-xl border border-border bg-white p-6 shadow-sm">
          <div className="grid gap-3 sm:grid-cols-2">
            <Link
              href="/signup?as=individual"
              className="rounded-xl border border-border bg-white p-5 transition hover:border-ace hover:shadow-sm"
            >
              <h2 className="font-serif text-base font-semibold text-navy">
                Track my CE
              </h2>
              <p className="mt-1 text-[12px] text-text-muted text-pretty">
                Log and track your continuing education with ProTrack.
              </p>
            </Link>

            <Link
              href="/signup?as=company"
              className="rounded-xl border border-border bg-white p-5 transition hover:border-ace hover:shadow-sm"
            >
              <h2 className="font-serif text-base font-semibold text-navy">
                Accredit courses
              </h2>
              <p className="mt-1 text-[12px] text-text-muted text-pretty">
                Submit courses for accreditation as a CE provider.
              </p>
            </Link>

            <Link
              href="/signup/board"
              className="rounded-xl border border-border bg-white p-5 transition hover:border-ace hover:shadow-sm sm:col-span-2"
            >
              <h2 className="font-serif text-base font-semibold text-navy">
                State board
              </h2>
              <p className="mt-1 text-[12px] text-text-muted text-pretty">
                Run random CE audits with Verify.
              </p>
            </Link>
          </div>

          <p className="mt-5 rounded-lg bg-surface px-4 py-3 text-[11px] text-text-muted text-pretty">
            AADB staff? Reviewers and admins are added by invitation. Create an
            account, then request access from your home screen.
          </p>
        </div>

        <p className="mt-4 text-center text-[12px] text-white/55">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-ace-light hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}

function CheckYourEmail({ email }: { email: string }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-navy px-4 py-10">
      <div className="w-full max-w-md text-center">
        <div className="mb-5 flex flex-col items-center text-white">
          <BrandMark tag="AADB" size="lg" />
        </div>
        <div className="rounded-xl border border-border bg-white p-7">
          <span aria-hidden className="text-3xl">
            ✉️
          </span>
          <h1 className="mt-2 font-serif text-xl font-bold text-navy text-balance">
            Confirm your email
          </h1>
          <p className="mx-auto mt-2 max-w-sm text-[12px] text-text-muted text-pretty">
            We sent a confirmation link to <strong>{email}</strong>. Click it to
            activate your account and sign in. The link expires in 24 hours.
          </p>
          <form
            method="POST"
            action="/api/auth/resend-verification"
            className="mt-5"
          >
            <input type="hidden" name="email" value={email} />
            <button
              type="submit"
              className="rounded-md border border-border bg-white px-4 py-2 text-[12px] font-semibold text-navy transition-colors hover:bg-surface"
            >
              Resend the email
            </button>
          </form>
        </div>
        <p className="mt-4 text-center text-[12px] text-white/55">
          <Link href="/login" className="font-semibold text-ace-light hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
