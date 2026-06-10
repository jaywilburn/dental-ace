import type { Metadata } from "next";
import { PageHero } from "@/components/marketing/page-hero";
import { CtaBanner } from "@/components/landing/cta-banner";

export const metadata: Metadata = {
  title: "About",
  description:
    "DentalACE One is built by the American Association of Dental Boards, the only organization that sits at the intersection of CE providers, dental professionals, and state boards.",
};

const pillars: { title: string; body: string }[] = [
  {
    title: "Accreditation authority",
    body: "The AADB has set the standard for dental continuing education and licensure for decades. DentalACE One puts that authority online, so an accreditation issued here carries the same institutional weight providers and boards already trust.",
  },
  {
    title: "Connected by design",
    body: "Accreditation, CE tracking, and board auditing have always lived in separate silos. We built all three on one platform so a certificate issued in DentalACE flows into a licensee's ProTrack record and is visible to their board in Verify, with no re-keying.",
  },
  {
    title: "Regulatory alignment",
    body: "Because the AADB works directly with state dental boards, the platform reflects real licensure requirements across all 50 states. Categories, hour totals, and audit rules match what boards actually enforce.",
  },
];

const products: { name: React.ReactNode; tag: string; body: string; color: string }[] = [
  {
    name: (
      <>
        Dental<span className="text-ace">ACE</span>
      </>
    ),
    tag: "Accreditation",
    color: "text-ace",
    body: "The AADB Accredited Continuing Education program, fully digitized. Providers submit course applications, get reviewer approval, and issue QR-coded certificates that are verifiable the moment they are created.",
  },
  {
    name: "ProTrack",
    tag: "CE Tracking",
    color: "text-pro",
    body: "A free CE dashboard for dentists, hygienists, and dental assistants. Tracks hours against each state's exact requirements, syncs DentalACE certificates automatically, and accepts uploads from any provider.",
  },
  {
    name: "Verify",
    tag: "Board Auditing",
    color: "text-ver",
    body: "A board-provisioned audit tool for state dental boards. Runs randomized CE audits, surfaces deficiencies instantly, sends bulk notices, and produces a defensible audit record for every batch.",
  },
];

export default function AboutPage() {
  return (
    <>
      <PageHero
        eyebrow="An AADB Program"
        title={
          <>
            Built on institutional <span className="text-ace-light">authority</span>
          </>
        }
        sub="DentalACE One is operated by the American Association of Dental Boards, the only organization that sits at the intersection of CE providers, dental professionals, and state boards."
      />

      {/* Pillars */}
      <section className="bg-white px-5 py-16 md:px-10 md:py-20">
        <div className="mx-auto grid max-w-[1000px] gap-6 md:grid-cols-3">
          {pillars.map((p) => (
            <div
              key={p.title}
              className="rounded-2xl border border-border bg-surface p-7"
            >
              <h2 className="mb-2 font-serif text-xl font-bold text-navy">
                {p.title}
              </h2>
              <p className="text-pretty text-sm leading-relaxed text-text-mid">
                {p.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* The suite */}
      <section className="bg-surface px-5 py-16 md:px-10 md:py-20">
        <p className="mb-2.5 text-center font-mono text-[10px] uppercase tracking-[2.5px] text-text-muted">
          One platform, three tools
        </p>
        <h2 className="mb-12 text-balance text-center font-serif text-3xl font-bold text-navy md:text-[38px]">
          The DentalACE One suite
        </h2>
        <div className="mx-auto grid max-w-[1000px] gap-6 md:grid-cols-3">
          {products.map((product, i) => (
            <div
              key={i}
              className="rounded-2xl border border-border bg-white p-7"
            >
              <p className="mb-3 font-mono text-[10px] uppercase tracking-[2px] text-text-muted">
                {product.tag}
              </p>
              <h3 className={`mb-3 font-serif text-2xl font-bold ${product.color}`}>
                {product.name}
              </h3>
              <p className="text-pretty text-sm leading-relaxed text-text-mid">
                {product.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Operated by the AADB */}
      <section className="bg-white px-5 py-16 text-center md:px-10 md:py-20">
        <div className="mx-auto max-w-[680px]">
          <h2 className="mb-4 text-balance font-serif text-3xl font-bold text-navy md:text-[34px]">
            Operated by the American Association of Dental Boards
          </h2>
          <p className="text-pretty text-base leading-relaxed text-text-mid">
            DentalACE One is operated by the American Association of Dental
            Boards (AADB). The AADB maintains the accreditation standards, the
            technology, and the state board relationships that keep dental
            continuing education credible from the classroom to the renewal.
          </p>
        </div>
      </section>

      <CtaBanner />
    </>
  );
}
