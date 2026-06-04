import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";

/*
  /verify/contact — sales/inquiry form for state boards considering Verify.
  Not a registration: boards self-register at /signup/board (gated by .gov).
  This is for boards that want a guided walkthrough or special accommodation.

  Posts to a mailto: for now. When the lead pipeline is wired (CRM or just
  a /api/leads route), swap the form action.
*/

const fieldClass =
  "w-full rounded-md border border-border bg-white px-3 py-2 text-[13px] text-navy outline-none focus:border-ver";
const labelClass = "mb-1 block text-[11px] font-semibold text-text-mid";

export default function VerifyContactPage() {
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
                  placeholder="Board Administrator"
                />
              </div>
            </div>

            <div>
              <label htmlFor="boardName" className={labelClass}>
                Board / organization
              </label>
              <input
                id="boardName"
                name="boardName"
                className={fieldClass}
                required
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
