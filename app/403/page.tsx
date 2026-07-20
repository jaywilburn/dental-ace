import { BrandMark } from "@/components/brand-mark";

export default function ForbiddenPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-navy p-8">
      <div className="w-full max-w-[420px] rounded-xl border border-white/10 bg-white/[0.05] p-7">
        <div className="flex flex-col items-center gap-1">
          <BrandMark size="lg" />
          <p className="text-center text-xs text-white/35">
            AADB Accredited Continuing Education Program
          </p>
        </div>

        <h1 className="mt-6 text-center font-serif text-2xl font-bold text-white">
          Access denied
        </h1>
        <p className="mt-2 text-center text-xs text-white/70">
          Your account does not have access to that portal. If you think this is
          a mistake, contact AADB at{" "}
          <a className="text-ace-light" href="mailto:info@dentalace.org">
            info@dentalace.org
          </a>
          .
        </p>

        <form action="/api/auth/signout" method="POST" className="mt-6">
          <button
            type="submit"
            className="w-full rounded-md bg-ace py-2.5 text-sm font-bold text-navy transition hover:bg-ace-light"
          >
            Sign out
          </button>
        </form>
      </div>
    </main>
  );
}
