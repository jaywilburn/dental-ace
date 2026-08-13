import Link from "next/link";

/*
  Public "forgot password" request page. Collects an email and posts to
  /api/auth/request-password-reset, which always responds neutrally (no account
  enumeration). Styling mirrors its sibling /set-password page.
*/
export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="mx-auto max-w-sm px-4 py-16">
      <h1 className="text-lg font-semibold text-slate-900">Reset your password</h1>
      <p className="mt-2 text-sm text-slate-600">
        Enter the email address for your DentalACE One account and we will send you a link to reset
        your password.
      </p>
      {error ? (
        <p className="mt-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <form method="post" action="/api/auth/request-password-reset" className="mt-5 space-y-3">
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white"
        >
          Send reset link
        </button>
      </form>
      <p className="mt-4 text-center text-xs text-slate-500">
        <Link className="underline" href="/login">
          Back to sign in
        </Link>
      </p>
    </main>
  );
}
