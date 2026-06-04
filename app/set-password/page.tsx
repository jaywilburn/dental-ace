export default async function SetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;

  if (!token) {
    return (
      <main className="mx-auto max-w-sm px-4 py-16 text-center">
        <h1 className="text-lg font-semibold text-slate-900">Invalid link</h1>
        <p className="mt-2 text-sm text-slate-600">This set-password link is missing its token.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-sm px-4 py-16">
      <h1 className="text-lg font-semibold text-slate-900">Set your password</h1>
      <p className="mt-2 text-sm text-slate-600">Choose a password for your DentalACE staff account.</p>
      {error ? (
        <p className="mt-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}
      <form method="post" action="/api/auth/set-password" className="mt-5 space-y-3">
        <input type="hidden" name="token" value={token} />
        <input type="password" name="password" required minLength={10} placeholder="New password (min 10 chars)"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        <button type="submit" className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white">
          Set password
        </button>
      </form>
    </main>
  );
}
