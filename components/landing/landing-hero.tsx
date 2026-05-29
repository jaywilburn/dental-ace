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
      <h1 className="relative z-10 mb-4 text-balance font-serif text-[38px] font-bold leading-[1.08] text-white md:text-[58px]">
        The dental CE platform
        <br />
        built for <span className="text-ace-light">everyone in dentistry</span>
      </h1>
      <p className="relative z-10 mx-auto mb-12 max-w-[520px] text-pretty text-base font-light leading-relaxed text-white/45 md:text-lg">
        From course accreditation to CE tracking to board compliance: three
        connected tools, one platform, built with the AADB.
      </p>

      <p className="relative z-10 mb-1.5 text-base font-semibold text-white md:text-[17px]">
        Who are you here for?
      </p>
      <p className="relative z-10 mb-9 text-[13px] text-white/35">
        Select your role below to get started
      </p>

      <div className="relative z-10 mx-auto grid max-w-[1100px] gap-4 px-0 md:grid-cols-3">
        <ProductCard
          color="ace"
          tag="Accreditation"
          name={
            <>
              Dental <span className="text-ace">ACE</span>
            </>
          }
          audience="For CE providers & educators"
          description="Accredit your continuing education courses with the AADB. Submit applications, manage approvals, and issue QR-coded certificates to attendees online, end to end."
          features={[
            "Get Your CE Courses AADB-Accredited Fast",
            "Deliver Certificates Automatically at Scale",
            "A Single Dashboard to Manage Everything",
            "Your Courses Feed Directly Into ProTrack",
            "Built for the Way Dental Education Actually Works",
          ]}
          buttonLabel="Get my course accredited"
          href="/company"
        />
        <ProductCard
          color="pro"
          tag="CE Tracking"
          name="ProTrack"
          audience="For dentists, hygienists & dental assistants"
          description="Your personal CE dashboard. Track hours against your state's exact requirements, upload certificates from any provider, and stay audit-ready before your board asks. Free forever."
          features={[
            "Your CE Hours. One Dashboard. Always Current.",
            "Dental ACE Certificates Sync Automatically. No Upload Needed.",
            "Built for All 50 States, All Three License Types.",
            "Automated Reminders So a Deadline Never Catches You Off Guard.",
            "Export an Audit-Ready Report in One Click.",
          ]}
          buttonLabel="Track my CE hours"
          href="/protrack"
        />
        <ProductCard
          color="ver"
          tag="Board Auditing"
          name="Verify"
          audience="For state dental boards"
          description="Run random CE compliance audits on your licensees with one click. Real-time compliance data, bulk deficiency notices, and full audit documentation, replacing your paper process entirely."
          features={[
            "Run a Randomized CE Audit in Seconds, Not Weeks.",
            "See Every Licensee's CE Status in One Place.",
            "Send Personalized Deficiency Notices in Bulk, Automatically.",
            "Deficiencies Resolve Themselves. The Board Just Watches.",
            "Export a Complete Audit Record for Any Batch or Licensee.",
          ]}
          buttonLabel="Access board portal"
          href="/verify"
        />
      </div>

      <EcoStrip />
    </section>
  );
}
