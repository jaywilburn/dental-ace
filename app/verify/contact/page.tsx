import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { submitMarketingLead } from "@/lib/leads/actions";

/*
  /verify/contact — sales/inquiry form for state boards considering Verify.
  Not a registration: boards self-register at /signup/board (gated by .gov).
  This is for boards that want a guided walkthrough or special accommodation.

  Submits to the submitMarketingLead server action (source VERIFY), which
  validates + stores the lead, emails an ops notification, and redirects back
  here with ?sent=1 or ?error=1. No em dashes (brand rule).
*/

const fieldClass =
  "w-full rounded-md border border-border bg-white px-3 py-2 text-[13px] text-navy outline-none focus:border-ver";
const labelClass = "mb-1 block text-[11px] font-semibold text-text-mid";

export default async function VerifyContactPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const { sent, error } = await searchParams;

  return (
    <main className="flex min-h-dvh items-center justify-center bg-navy px-4 py-12">
      <div className="w-full max-w-lg">
        <div className="mb-5 flex flex-col items-center text-center text-white">
          <BrandMark tag="AADB" product="ver" size="lg" />
          <h1 className="mt-3 font-serif text-2xl font-bold text-balance">
            Talk to the Verify team
          </h1>
          <p className="mt-1 max-w-sm text-[12px] text-white/55 text-pretty">
            Already a state board? Self-register at{" "}
            <Link
              href="/signup/board"
              className="font-semibold text-ace-light hover:underline"
            >
              /signup/board
            </Link>
            . Otherwise, tell us a bit and we&apos;ll be in touch.
          </p>
        </div>

        {sent ? (
          <div className="mb-4 rounded-md border border-ver/40 bg-ver/10 px-4 py-3 text-center text-[12px] text-white">
            <p className="font-semibold">Thanks, we have your inquiry.</p>
            <p className="mt-0.5 text-white/70">The Verify team will be in touch shortly.</p>
          </div>
        ) : null}
        {error ? (
          <div className="mb-4 rounded-md border border-red-400/50 bg-red-500/10 px-4 py-3 text-center text-[12px] text-white">
            <p className="font-semibold">We could not send that just now.</p>
            <p className="mt-0.5 text-white/70">
              Please check your details and try again in a moment.
            </p>
          </div>
        ) : null}

        <div className="rounded-xl border border-border bg-white p-6 shadow-sm">
          <form action={submitMarketingLead} className="relative space-y-4">
            <input type="hidden" name="source" value="VERIFY" />
            {/* Honeypot: hidden from humans; a bot that fills it gets a silent no-op. */}
            <div
              aria-hidden="true"
              className="absolute left-[-9999px] top-[-9999px] h-0 w-0 overflow-hidden"
            >
              <label htmlFor="company_url">Leave this field empty</label>
              <input
                id="company_url"
                name="company_url"
                type="text"
                tabIndex={-1}
                autoComplete="off"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="contactName" className={labelClass}>
                  Your name
                </label>
                <input
                  id="contactName"
                  name="contactName"
                  className={fieldClass}
                  maxLength={200}
                  required
                />
              </div>
              <div>
                <label htmlFor="title" className={labelClass}>
                  Title
                </label>
                <input
                  id="title"
                  name="title"
                  className={fieldClass}
                  maxLength={200}
                  placeholder="Board Administrator"
                />
              </div>
            </div>

            <div>
              <label htmlFor="organization" className={labelClass}>
                Board / organization
              </label>
              <input
                id="organization"
                name="organization"
                className={fieldClass}
                required
                maxLength={200}
                placeholder="State Board of Dental Examiners"
              />
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
                maxLength={200}
              />
            </div>

            <div>
              <label htmlFor="message" className={labelClass}>
                What would you like to discuss?
              </label>
              <textarea
                id="message"
                name="message"
                rows={4}
                className={fieldClass}
                maxLength={2000}
                placeholder="A walkthrough, a custom audit cycle, or anything else."
              />
            </div>

            <button
              type="submit"
              className="w-full rounded-md bg-ver px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-ver/90"
            >
              Send inquiry
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
