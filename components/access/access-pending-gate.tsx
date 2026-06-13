import Link from "next/link";

/*
  Shown by a gated layout when the user has a PENDING request for that area but
  no entitlement yet. A blurred, inert skeleton sits behind a centered popup.
  No entitlement-protected data is queried.
*/
export function AccessPendingGate({ area }: { area: string }) {
  return (
    <div className="relative min-h-dvh bg-surface">
      <div aria-hidden className="pointer-events-none select-none blur-sm opacity-60 p-6">
        <div className="h-8 w-56 rounded bg-border" />
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 rounded-lg border border-border bg-white" />
          ))}
        </div>
        <div className="mt-5 h-48 rounded-lg border border-border bg-white" />
      </div>
      <div className="absolute inset-0 grid place-items-center px-4">
        <div className="w-full max-w-md rounded-xl border border-border bg-white p-7 text-center shadow-lg">
          <span aria-hidden className="text-3xl">⏳</span>
          <h1 className="mt-2 font-serif text-xl font-bold text-navy text-balance">
            Your {area} access is under review
          </h1>
          <p className="mx-auto mt-2 max-w-sm text-[12px] text-text-muted text-pretty">
            An AADB administrator is reviewing your request. You&apos;ll get in as soon as it&apos;s
            approved, and we&apos;ll email you. In the meantime you can keep using ProTrack.
          </p>
          <Link
            href="/home"
            className="mt-5 inline-block rounded-md bg-navy px-4 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-navy/90"
          >
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
