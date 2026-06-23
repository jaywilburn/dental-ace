import Link from "next/link";
import { redirect } from "next/navigation";
import { BrandMark } from "@/components/brand-mark";
import { getCurrentUser } from "@/lib/auth/session";
import { JurisdictionOptions } from "@/components/jurisdiction-options";

/*
  Public self-serve state-board sign-up. Posts to /api/auth/register-board which
  creates the auth user, finds-or-creates the board for the picked state, and
  emails a verification link. No admin gate (per the approved Phase 3 plan).
*/

const fieldClass =
  "w-full rounded-md border border-border bg-white px-3 py-2 text-[13px] text-navy outline-none focus:border-ace";
const labelClass = "mb-1 block text-[11px] font-semibold text-text-mid";

export default async function BoardSignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string }>;
}) {
  const user = await getCurrentUser();
  if (user?.verifyAccess) redirect("/board");
  if (user) redirect("/home");

  const { error, sent } = await searchParams;
  if (sent) return <CheckYourEmail email={sent} />;

  return (
    <main className="flex min-h-dvh items-center justify-center bg-navy px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="mb-5 flex flex-col items-center text-center text-white">
          <BrandMark tag="AADB" size="lg" />
          <h1 className="mt-3 font-serif text-2xl font-bold text-balance">
            Register your state board
          </h1>
          <p className="mt-1 max-w-sm text-[12px] text-white/55 text-pretty">
            Verify lets state dental boards run CE audits, send
            deficiency notices, and track resolution. First registration for
            a state requires a <span className="font-mono">.gov</span> email.
          </p>
        </div>

        <div className="rounded-xl border border-border bg-white p-6 shadow-sm">
          {error ? (
            <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700 text-pretty">
              {error}
            </p>
          ) : null}

          <form
            method="POST"
            action="/api/auth/register-board"
            className="space-y-4"
          >
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

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="state" className={labelClass}>
                  State/Province
                </label>
                <select
                  id="state"
                  name="state"
                  className={fieldClass}
                  defaultValue=""
                  required
                >
                  <option value="" disabled>
                    Pick a state or province
                  </option>
                  <JurisdictionOptions />
                </select>
              </div>
              <div>
                <label htmlFor="boardName" className={labelClass}>
                  Board name
                </label>
                <input
                  id="boardName"
                  name="boardName"
                  className={fieldClass}
                  required
                  placeholder="State Board of Dental Examiners"
                  minLength={3}
                  maxLength={160}
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full rounded-md bg-navy px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-navy/90"
            >
              Create Board Account
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
            activate your board account and sign in. The link expires in 24
            hours.
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
