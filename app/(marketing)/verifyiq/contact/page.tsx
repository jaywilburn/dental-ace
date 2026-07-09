import type { Metadata } from "next";
import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { submitMarketingLead } from "@/lib/leads/actions";

/*
  /verifyiq/contact — early-access waitlist / inquiry form for VerifyIQ. VerifyIQ
  is pre-launch and built for DSOs and dental groups only (not state boards), so
  this captures interest from group / practice leads.

  Submits to the submitMarketingLead server action (source VERIFYIQ), which
  validates + stores the lead, emails an ops notification, and redirects back
  here with ?sent=1 or ?error=1. No em dashes (brand rule).
*/

export const metadata: Metadata = {
  title: "Join the VerifyIQ early-access list",
  description:
    "VerifyIQ is coming soon. Tell us about your dental group and we will reach out the moment early access opens.",
};

const fieldClass =
  "w-full rounded-md border border-border bg-white px-3 py-2 text-[13px] text-navy outline-none focus:border-ver";
const labelClass = "mb-1 block text-[11px] font-semibold text-text-mid";

export default async function VerifyIQContactPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const { sent, error } = await searchParams;

  return (
    <section className="bg-navy px-4 py-16 md:py-20">
      <div className="mx-auto w-full max-w-lg">
        <div className="mb-5 flex flex-col items-center text-center text-white">
          <BrandMark tag="AADB" product="ver" size="lg" />
          <span className="mt-3 rounded-full bg-ver px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[1.5px] text-white">
            Coming soon
          </span>
          <h1 className="mt-3 text-balance font-serif text-2xl font-bold">
            Join the VerifyIQ early-access list
          </h1>
          <p className="mt-1 max-w-sm text-pretty text-[12px] text-white/55">
            Tell us a little about your group and we will reach out the moment
            early access opens.
          </p>
        </div>

        {sent ? (
          <div className="mb-4 rounded-md border border-ver/40 bg-ver/10 px-4 py-3 text-center text-[12px] text-white">
            <p className="font-semibold">Thanks, you are on the list.</p>
            <p className="mt-0.5 text-white/70">
              We will be in touch the moment early access opens.
            </p>
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
            <input type="hidden" name="source" value="VERIFYIQ" />
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
                  placeholder="Compliance Director"
                />
              </div>
            </div>

            <div>
              <label htmlFor="organization" className={labelClass}>
                Dental group or practice
              </label>
              <input
                id="organization"
                name="organization"
                className={fieldClass}
                required
                maxLength={200}
                placeholder="Bright Smiles Dental Group"
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
                Anything you would like us to know?
              </label>
              <textarea
                id="message"
                name="message"
                rows={4}
                className={fieldClass}
                maxLength={2000}
                placeholder="How many providers, which states, and what you are hoping VerifyIQ can help with."
              />
            </div>

            <button
              type="submit"
              className="w-full rounded-md bg-ver px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-ver-dark"
            >
              Join the list
            </button>
          </form>
        </div>

        <p className="mt-4 text-center text-[12px] text-white/55">
          Looking for the live product?{" "}
          <Link
            href="/verifyiq"
            className="font-semibold text-ace-light hover:underline"
          >
            Learn more about VerifyIQ
          </Link>
        </p>
      </div>
    </section>
  );
}
