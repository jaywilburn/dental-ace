import { ProductCard } from "@/components/landing/product-card";
import { EcoStrip } from "@/components/landing/eco-strip";

/*
  Hero section: navy background with two radial gradient blobs (top-center gold,
  bottom-right blue), eyebrow, balanced serif headline, sub, role prompt, and
  the 3-card grid. The eco strip sits at the bottom edge inside the same
  section so the navy continues uninterrupted.

  Radial blobs use inline style for the gradient values since arbitrary
  Tailwind syntax for radial-gradient gets unwieldy.
*/

const aceBlob = {
  background:
    "radial-gradient(circle, rgba(200,151,26,0.10) 0%, transparent 70%)",
};
const verBlob = {
  background:
    "radial-gradient(circle, rgba(43,108,176,0.07) 0%, transparent 70%)",
};

export function LandingHero() {
  return (
    <section className="relative overflow-hidden bg-navy px-5 pt-20 text-center md:px-10 md:pt-24">
      <div
        aria-hidden
        style={aceBlob}
        className="pointer-events-none absolute -top-[120px] left-1/2 size-[700px] -translate-x-1/2 rounded-full"
      />
      <div
        aria-hidden
        style={verBlob}
        className="pointer-events-none absolute -right-[60px] bottom-0 size-[400px] rounded-full"
      />

      <p className="relative z-10 mb-5 font-mono text-[11px] uppercase tracking-[3px] text-ace-light">
        AADB · Dental CE Platform · dentalace.org
      </p>
      <h1 className="relative z-10 mb-4 text-balance font-serif text-[clamp(1.875rem,6vw,3.625rem)] font-bold leading-[1.08] text-white">
        Dental Continuing Education,
        <br />
        <span className="text-ace-light">Accredited by the AADB</span>
      </h1>
      <p className="relative z-10 mx-auto mb-12 max-w-[520px] text-pretty text-base font-light leading-relaxed text-white/65 md:text-lg">
        Accredit your courses, issue certificates automatically, and feed every
        credit into your attendees&apos; license records. One connected platform
        for CE providers, clinicians, and state boards.
      </p>

      <p className="relative z-10 mb-1.5 text-base font-semibold text-white md:text-[17px]">
        Where do you fit?
      </p>
      <p className="relative z-10 mb-9 text-[13px] text-white/55">
        Choose your starting point below
      </p>

      <div className="relative z-10 mx-auto grid max-w-[1100px] gap-5 px-0 md:grid-cols-3">
        <ProductCard
          color="ace"
          tag="Accreditation"
          name={
            <>
              Dental<span className="text-ace">ACE</span>
            </>
          }
          audience="For CE providers & educators"
          description="Accredit your CE courses through the official AADB program, then issue QR-coded, board-recognized certificates to attendees automatically. From application to completion in one place."
          features={[
            "Guided application, reviewed by the AADB",
            "Certificates issued automatically, at scale",
            "Every credit syncs straight into ProTrack",
          ]}
          buttonLabel="Get my course accredited"
          href="/company"
        />
        <ProductCard
          color="pro"
          tag="CE Tracking"
          name="ProTrack"
          audience="For dentists, hygienists & dental assistants"
          description="Track your hours against your state's exact requirements, upload certificates from any provider, and stay audit-ready before your board ever asks."
          features={[
            "Every category, every state, always current",
            "AADB certificates log themselves, no upload",
            "One-click, audit-ready compliance report",
          ]}
          buttonLabel="Track my CE hours"
          href="/protrack"
        />
        <ProductCard
          color="ver"
          tag="Board Auditing"
          name="Verify"
          audience="For state dental boards"
          description="Run CE compliance audits on your licensees in one click. Live compliance data, bulk deficiency notices, and a full audit trail, replacing paper entirely."
          features={[
            "Audits in seconds, not weeks",
            "Live CE status for every licensee",
            "Deficiency notices and reminders, automatic",
          ]}
          buttonLabel="Access board portal"
          href="/verify"
        />
      </div>

      <EcoStrip />
    </section>
  );
}
