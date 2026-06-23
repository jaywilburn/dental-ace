import { LandingNav } from "@/components/landing/landing-nav";
import { LandingHero } from "@/components/landing/landing-hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { VideoSection } from "@/components/landing/video-section";
import { SuiteTitleBar } from "@/components/landing/suite-title-bar";
import { ProductDetail } from "@/components/landing/product-detail";
import { MockupAce } from "@/components/landing/mockup-ace";
import { MockupProTrack } from "@/components/landing/mockup-protrack";
import { MockupVerify } from "@/components/landing/mockup-verify";
import { TrustSection } from "@/components/landing/trust-section";
import { CtaBanner } from "@/components/landing/cta-banner";
import { LandingFooter } from "@/components/landing/landing-footer";

/*
  Public landing page. Faithful Next.js 16 port of logic/aadb-landing-page-v3.html.
  All sections are server components. Hover transitions are CSS only, wrapped
  in motion-safe. No client-side state.
*/
export default function LandingPage() {
  return (
    <>
      <LandingNav />
      <main>
        <LandingHero />
        <VideoSection />
        <HowItWorks />
        <SuiteTitleBar />

        <ProductDetail
          id="ace"
          color="ace"
          label="Accreditation"
          name={
            <>
              Dental<span className="text-ace">ACE</span>
            </>
          }
          audience="For CE course providers and dental educators"
          description="The official AADB Accredited Continuing Education program, fully online. Apply for accreditation, receive your approval, and issue QR-coded certificates to attendees automatically."
          features={[
            {
              lead: "Get AADB-Accredited Fast.",
              body: "A guided 5-step application. Approved courses get an official Course ID, attendee link, QR code, and approval letter, generated automatically.",
            },
            {
              lead: "Issue Certificates Automatically.",
              body: "Attendees finish, pass the quiz, and receive a branded, board-recognized certificate by email, at any scale.",
            },
            {
              lead: "Credits Flow Straight Into ProTrack.",
              body: "Every certificate lands in your attendees' license records automatically, in all 50 states.",
            },
          ]}
          ctaLabel="Start your accreditation"
          ctaHref="/company"
          mockup={<MockupAce />}
        />

        <ProductDetail
          id="protrack"
          color="pro"
          bg="alt"
          reverse
          label="CE Tracking"
          name="ProTrack"
          audience="For dentists, hygienists & dental assistants"
          description="Your personal CE dashboard. Track every hour against your state's exact requirements and stay audit-ready before your board ever asks."
          features={[
            {
              lead: "Always Know Where You Stand.",
              body: "Hours break down by category against your state's rules, updating in real time so you see what's left.",
            },
            {
              lead: "Certificates Log Themselves.",
              body: "AADB courses sync automatically by license number; upload anything earned elsewhere once and it maps to the right category.",
            },
            {
              lead: "One-Click Audit Report.",
              body: "Generate a formatted compliance PDF instantly, exactly what your board needs to see.",
            },
          ]}
          ctaLabel="Create free account"
          ctaHref="/signup"
          mockup={<MockupProTrack />}
        />

        <ProductDetail
          id="verify"
          color="ver"
          label="Board Auditing"
          name="Verify"
          audience="For state dental boards, provisioned by AADB"
          description="Replace your paper CE audit process entirely. Run an audit in one click, send deficiency notices in bulk, and keep a full audit trail, automatically."
          features={[
            {
              lead: "Audit in Seconds, Not Weeks.",
              body: "One click samples your licensees, pulls live CE records from ProTrack, and returns compliance results the same day.",
            },
            {
              lead: "Notices Go Out in Bulk.",
              body: "Notify every deficient licensee at once, each personalized with their missing hours and deadline. Reminders follow automatically.",
            },
            {
              lead: "Deficiencies Close Themselves.",
              body: "When a licensee uploads missing certificates, a daily sync resolves it, and every action is logged for a defensible trail.",
            },
          ]}
          ctaLabel="Request board access"
          ctaHref="/verify/contact"
          mockup={<MockupVerify />}
        />

        <TrustSection />
        <CtaBanner />
      </main>
      <LandingFooter />
    </>
  );
}
