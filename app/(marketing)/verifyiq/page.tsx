import type { Metadata } from "next";
import Link from "next/link";
import { VerifyIQDashboardMockup } from "@/components/landing/verifyiq-dashboard-mockup";

/*
  Dedicated VerifyIQ feature landing page. Lives in the (marketing) route group,
  so it inherits LandingNav + LandingFooter and resolves to /verifyiq.

  Positioning (per client, 2026): VerifyIQ is the compliance-intelligence layer
  of DentalACE One, serving BOTH audiences: DSOs / dental groups (team-wide CE
  visibility) and state dental boards (population analytics on top of Verify).
  It is pre-launch, so the whole page is "coming soon" and drives to the
  /verifyiq/contact early-access waitlist. Accent is blue (--ver). No dollar
  figures. No em dashes in copy (brand rule).
*/

export const metadata: Metadata = {
  title: "VerifyIQ",
  description:
    "VerifyIQ is the compliance-intelligence layer of DentalACE One. For DSOs and dental groups, a live view of your whole team's CE. For state boards, population-wide analytics on top of Verify. Coming soon.",
};

const ctaHref = "/verifyiq/contact";

const primaryBtn =
  "inline-flex items-center justify-center rounded-lg bg-ver px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-ver-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ver-light focus-visible:ring-offset-2";

// DSO / dental group value: the four client-approved bullets from the home teaser.
const groupFeatures: { title: string; body: string }[] = [
  {
    title: "See what your team is learning.",
    body: "An overview of every CE course your employees take (titles, providers, hours, and completion dates), all in one place instead of scattered across certificates.",
  },
  {
    title: "Understand it by category.",
    body: "A clear summary of the type of content your team is learning (clinical, opioid, infection control, ethics, and more), so you can see strengths and spot where coverage is thin.",
  },
  {
    title: "Know where the holes are.",
    body: "Automatic flags for at-risk and overdue providers against each state's specific requirements, so nothing slips through before renewal.",
  },
  {
    title: "Privacy-first by design.",
    body: "Providers link their license with a private org code. You see hours, states, and CE categories, never their personal details.",
  },
];

// State board value: analytics layered on the Verify audit engine.
const boardFeatures: { title: string; body: string }[] = [
  {
    title: "Population-wide analytics.",
    body: "See CE compliance across your entire licensee base, not just the sampled audit cohort, pulled live from ProTrack and refreshed daily.",
  },
  {
    title: "Early-warning risk scoring.",
    body: "VerifyIQ surfaces the licensees trending toward a deficiency before renewal, so notices go out earlier and resolve sooner.",
  },
  {
    title: "Category and trend breakdowns.",
    body: "Slice CE completion by category, license type, and renewal cycle to spot systemic gaps across your state, cycle over cycle.",
  },
  {
    title: "Built on Verify.",
    body: "VerifyIQ layers on the audit data Verify already collects. No new workflow, no new data entry, no new logins for your staff.",
  },
];

// Source products whose CE data VerifyIQ reads. Tiny colored dots only; the
// page's single accent stays blue.
const sources: { name: string; dot: string }[] = [
  { name: "DentalACE", dot: "bg-ace" },
  { name: "ProTrack", dot: "bg-pro" },
  { name: "Verify", dot: "bg-ver" },
];

function CheckBullet({ title, body }: { title: string; body: string }) {
  return (
    <li className="flex gap-3.5">
      <span
        aria-hidden
        className="mt-0.5 flex size-6 flex-shrink-0 items-center justify-center rounded-full bg-ver/10 text-[13px] font-bold text-ver"
      >
        ✓
      </span>
      <span className="text-sm leading-relaxed text-text-mid">
        <strong className="font-semibold text-navy">{title}</strong> {body}
      </span>
    </li>
  );
}

export default function VerifyIQPage() {
  return (
    <>
      {/* ---- Hero ---------------------------------------------------------- */}
      <section className="relative overflow-hidden bg-navy px-5 py-16 text-center md:px-10 md:py-24">
        <div
          aria-hidden
          style={{
            background:
              "radial-gradient(circle, rgba(43,108,176,0.14) 0%, transparent 70%)",
          }}
          className="pointer-events-none absolute left-1/2 top-0 size-[600px] -translate-x-1/2 -translate-y-1/3 rounded-full"
        />

        <div className="relative z-10 mx-auto max-w-[820px]">
          <div className="mb-5 flex items-center justify-center gap-3">
            <span className="font-mono text-[11px] uppercase tracking-[2.5px] text-ver-light">
              Compliance intelligence
            </span>
            <span className="rounded-full bg-ver px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[1.5px] text-white">
              Coming soon
            </span>
          </div>

          <h1 className="text-balance font-serif text-4xl font-bold text-white md:text-[52px] md:leading-[1.08]">
            See every CE hour, and every gap, across your whole population
          </h1>

          <p className="mx-auto mt-5 max-w-[620px] text-pretty text-base leading-relaxed text-white/50 md:text-lg">
            VerifyIQ is the intelligence layer of DentalACE One. For DSOs and
            dental groups, it turns scattered certificates into a live view of
            your team. For state boards, it adds population-wide analytics on top
            of the Verify audit engine.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href={ctaHref} className={primaryBtn}>
              Join the early-access list
            </Link>
            <span className="text-[13px] text-white/45">
              Be the first to onboard when it launches.
            </span>
          </div>
        </div>
      </section>

      {/* ---- Who it's for -------------------------------------------------- */}
      <section className="bg-white px-5 py-16 md:px-10 md:py-20">
        <div className="mx-auto max-w-[900px]">
          <p className="mb-2 text-center font-mono text-[11px] uppercase tracking-[2.5px] text-ver">
            One product, two audiences
          </p>
          <h2 className="mb-10 text-balance text-center font-serif text-3xl font-bold text-navy md:text-[38px]">
            Built for the people responsible for CE
          </h2>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-r-xl border border-l-4 border-border border-l-ver bg-surface p-6">
              <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[2px] text-ver">
                For DSOs &amp; dental groups
              </p>
              <h3 className="mb-2 font-serif text-xl font-bold text-navy">
                Your whole team&apos;s CE, in one view
              </h3>
              <p className="text-pretty text-sm leading-relaxed text-text-mid">
                Full visibility into the continuing education your dentists,
                hygienists, and assistants complete across every state you
                operate in, and exactly where they are short.
              </p>
            </div>

            <div className="rounded-r-xl border border-l-4 border-border border-l-ver bg-surface p-6">
              <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[2px] text-ver">
                For state dental boards
              </p>
              <h3 className="mb-2 font-serif text-xl font-bold text-navy">
                Intelligence on top of your audits
              </h3>
              <p className="text-pretty text-sm leading-relaxed text-text-mid">
                Population-wide compliance analytics and early-warning risk
                scoring, layered on the Verify audit engine your board already
                uses. No new workflow to learn.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ---- DSO deep-dive (copy + mockup) -------------------------------- */}
      <section className="bg-surface px-5 py-16 md:px-10 md:py-20">
        <div className="mx-auto grid max-w-[1180px] items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <div>
            <p className="mb-3 font-mono text-[10px] uppercase tracking-[2px] text-ver">
              For DSOs &amp; dental groups
            </p>
            <h2 className="mb-4 text-balance font-serif text-3xl font-bold text-navy md:text-[34px]">
              One dashboard for your whole team&apos;s CE
            </h2>
            <p className="mb-8 max-w-[520px] text-pretty text-sm leading-relaxed text-text-mid md:text-base">
              Stop chasing certificates over email. VerifyIQ gathers every hour
              your providers earn and shows you what they are learning, how it
              breaks down, and where the gaps are, before renewal deadlines
              arrive.
            </p>
            <ul className="flex flex-col gap-5">
              {groupFeatures.map((f) => (
                <CheckBullet key={f.title} title={f.title} body={f.body} />
              ))}
            </ul>
          </div>

          <div className="lg:pl-4">
            <VerifyIQDashboardMockup />
          </div>
        </div>
      </section>

      {/* ---- Board deep-dive (2x2 feature grid) --------------------------- */}
      <section className="bg-white px-5 py-16 md:px-10 md:py-20">
        <div className="mx-auto max-w-[1000px]">
          <div className="mb-10 text-center">
            <p className="mb-2 font-mono text-[10px] uppercase tracking-[2px] text-ver">
              For state dental boards
            </p>
            <h2 className="mb-3 text-balance font-serif text-3xl font-bold text-navy md:text-[34px]">
              Intelligence on top of your audits
            </h2>
            <p className="mx-auto max-w-[600px] text-pretty text-sm leading-relaxed text-text-mid md:text-base">
              Verify runs the audit. VerifyIQ reads the same data to give your
              board a live, statewide picture of CE compliance between audit
              cycles.
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            {boardFeatures.map((f) => (
              <div
                key={f.title}
                className="rounded-xl border border-border bg-surface p-6"
              >
                <span
                  aria-hidden
                  className="mb-4 flex size-9 items-center justify-center rounded-lg bg-ver/10 text-base font-bold text-ver"
                >
                  ✓
                </span>
                <h3 className="mb-1.5 font-serif text-lg font-bold text-navy">
                  {f.title}
                </h3>
                <p className="text-pretty text-sm leading-relaxed text-text-mid">
                  {f.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---- Where the data comes from (trust) ---------------------------- */}
      <section className="bg-navy px-5 py-16 md:px-10 md:py-20">
        <div className="mx-auto max-w-[820px] text-center">
          <p className="mb-2 font-mono text-[11px] uppercase tracking-[2.5px] text-ver-light">
            Nothing new to enter
          </p>
          <h2 className="mb-4 text-balance font-serif text-3xl font-bold text-white md:text-[34px]">
            VerifyIQ reads the CE data you already generate
          </h2>
          <p className="mx-auto mb-10 max-w-[600px] text-pretty text-sm leading-relaxed text-white/50 md:text-base">
            Every certificate accredited in DentalACE and tracked in ProTrack,
            and every audit run in Verify, becomes intelligence in VerifyIQ. No
            spreadsheets, no imports, no duplicate work.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3">
            {sources.map((s, i) => (
              <div key={s.name} className="flex items-center gap-3">
                <span className="inline-flex items-center gap-2 rounded-full border border-white/[0.12] bg-white/[0.04] px-4 py-2 text-[13px] font-medium text-white/80">
                  <span
                    aria-hidden
                    className={`size-2 rounded-full ${s.dot}`}
                  />
                  {s.name}
                </span>
                {i < sources.length - 1 ? (
                  <span aria-hidden className="text-white/30">
                    →
                  </span>
                ) : null}
              </div>
            ))}
            <span aria-hidden className="text-white/30">
              →
            </span>
            <span className="inline-flex items-center gap-2 rounded-full bg-ver px-4 py-2 text-[13px] font-semibold text-white">
              VerifyIQ
            </span>
          </div>
        </div>
      </section>

      {/* ---- Waitlist CTA ------------------------------------------------- */}
      <section className="bg-white px-5 py-16 md:px-10 md:py-24">
        <div className="mx-auto max-w-[720px] rounded-2xl border border-border bg-surface px-6 py-12 text-center md:px-12">
          <span className="mb-4 inline-block rounded-full bg-ver px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-[1.5px] text-white">
            Coming soon
          </span>
          <h2 className="mb-3 text-balance font-serif text-3xl font-bold text-navy md:text-[36px]">
            VerifyIQ is coming soon
          </h2>
          <p className="mx-auto mb-8 max-w-[520px] text-pretty text-sm leading-relaxed text-text-mid md:text-base">
            Tell us a little about your group or board and we will reach out the
            moment early access opens.
          </p>
          <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href={ctaHref} className={primaryBtn}>
              Join the early-access list
            </Link>
            <Link
              href="/pricing"
              className="text-[13px] font-semibold text-ver transition-colors hover:text-ver-dark"
            >
              See how it fits the platform
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
