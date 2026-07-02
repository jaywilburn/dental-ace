import type { Metadata } from "next";
import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";

/*
  /verifyiq/contact — early-access waitlist / inquiry form for VerifyIQ. VerifyIQ
  is pre-launch and built for DSOs and dental groups only (not state boards), so
  this captures interest from group / practice leads.

  Posts to a mailto: for now, matching /verify/contact. When the lead pipeline is
  wired (CRM or a /api/leads route), swap the form action. No em dashes (brand rule).
*/

export const metadata: Metadata = {
  title: "Join the VerifyIQ early-access list",
  description:
    "VerifyIQ is coming soon. Tell us about your dental group and we will reach out the moment early access opens.",
};

const fieldClass =
  "w-full rounded-md border border-border bg-white px-3 py-2 text-[13px] text-navy outline-none focus:border-ver";
const labelClass = "mb-1 block text-[11px] font-semibold text-text-mid";

export default function VerifyIQContactPage() {
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

        <div className="rounded-xl border border-border bg-white p-6 shadow-sm">
          <form
            action="mailto:info@dentalace.org"
            method="POST"
            encType="text/plain"
            className="space-y-4"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="contactName" className={labelClass}>
                  Your name
                </label>
                <input
                  id="contactName"
                  name="contactName"
                  className={fieldClass}
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
