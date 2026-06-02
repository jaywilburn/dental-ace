import { LandingNav } from "@/components/landing/landing-nav";
import { LandingHero } from "@/components/landing/landing-hero";
import { HowItWorks } from "@/components/landing/how-it-works";
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
        <HowItWorks />
        <SuiteTitleBar />

        <ProductDetail
          id="ace"
          color="ace"
          label="Product 01 · Accreditation"
          name={
            <>
              Dental <span className="text-ace">ACE</span>
            </>
          }
          audience="For CE course providers and dental educators"
          description="The AADB Accredited Continuing Education program, fully digitized. Apply, get approved, issue QR-coded certificates, and track completions in one place. It replaces the WordPress, Typeform, Zapier, and spreadsheet stack you hold together by hand."
          features={[
            {
              lead: "Get Your CE Courses AADB-Accredited Fast.",
              body: "A guided 5-step application, no paperwork bottleneck. Approved courses get an official Course ID, an approval letter, and a scannable QR code the moment they are issued.",
            },
            {
              lead: "Deliver Certificates Automatically at Scale.",
              body: "Attendees finish, pass the quiz, and receive a branded, board-recognized certificate by email instantly. You issue thousands without adding a single administrative step.",
            },
            {
              lead: "A Single Dashboard to Manage Everything.",
              body: "Track active courses, certificate balance, application credits, and every certificate issued from one portal. When your balance runs low, the system warns you before service to attendees is ever interrupted.",
            },
            {
              lead: "Your Courses Feed Directly Into ProTrack.",
              body: "Every certificate you issue syncs automatically into ProTrack, the CE tracker used by dentists, hygienists, and assistants in all 50 states. Your credit lands in attendees' license records with zero effort on their part, one more reason to choose your courses.",
            },
            {
              lead: "Built for the Way Dental Education Actually Works.",
              body: "In-person, online, or hybrid, with multiple presenters, co-creators, and full commercial disclosure. Whether you run live regional events or on-demand content, the platform fits your workflow.",
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
          label="Product 02 · CE Tracking"
          name="ProTrack"
          audience="For dentists, hygienists & dental assistants"
          description="Your personal CE dashboard, free forever. Track hours against your state's exact requirements across every category, upload certificates from any provider, and stay audit-ready from the moment you log in."
          features={[
            {
              lead: "Your CE Hours. One Dashboard. Always Current.",
              body: "See exactly where you stand on your state's requirements. Hours break down by category, progress updates in real time, and ProTrack tells you which categories still need work and how long you have left.",
            },
            {
              lead: "Dental ACE Certificates Sync Automatically. No Upload Needed.",
              body: "Finish a course through any AADB-accredited provider and the certificate lands in your record automatically, matched by license number. For anything earned elsewhere, upload it once and ProTrack maps it to the right category.",
            },
            {
              lead: "Built for All 50 States, All Three License Types.",
              body: "DDS, RDH, or DA, ProTrack knows your state's requirements and tracks multiple license states at once, each with its own progress, renewal date, and compliance status.",
            },
            {
              lead: "Automated Reminders So a Deadline Never Catches You Off Guard.",
              body: "Renewal reminders at 90, 60, 30, and 7 days. Category gap alerts when a required category is still empty with six months left. In-person-only alerts for requirements like sedation that cannot be met online.",
            },
            {
              lead: "Export an Audit-Ready Report in One Click.",
              body: "If your board ever calls, generate a formatted compliance PDF instantly: your information, full certificate log, category breakdown, hours completed versus required, and any gaps, exactly what an auditor needs to see.",
            },
          ]}
          ctaLabel="Create free account"
          ctaHref="/signup"
          mockup={<MockupProTrack />}
        />

        <ProductDetail
          id="verify"
          color="ver"
          label="Product 03 · Board Auditing"
          name="Verify"
          audience="For state dental boards, provisioned by AADB"
          description="Replace your paper-based CE audit process entirely. Run a random audit on any percentage of your licensees in one click. Deficiencies surface instantly, notices go out in bulk, and every audit is fully documented."
          features={[
            {
              lead: "Run a Randomized CE Audit in Seconds, Not Weeks.",
              body: "One click randomly selects a percentage of active licensees, pulls their live CE records from ProTrack, and returns full compliance results instantly. No spreadsheets, no record requests, no paper. Audit a 10% sample and have deficiency results in hand the same day.",
            },
            {
              lead: "See Every Licensee's CE Status in One Place.",
              body: "The dashboard shows every active licensee by compliance status, license type, and deficiency category. Drill into any record to see exactly which hours and categories are missing, backed by verified certificates pulled straight from ProTrack.",
            },
            {
              lead: "Send Personalized Deficiency Notices in Bulk, Automatically.",
              body: "Notify every deficient licensee in one action, each notice personalized with their specific missing hours, categories, and response deadline. Follow-up reminders fire at 30 days and a final warning at 7, with no further action from the board.",
            },
            {
              lead: "Deficiencies Resolve Themselves. The Board Just Watches.",
              body: "When a licensee uploads their missing certificates to ProTrack, a daily sync detects it and closes the deficiency on its own. Each morning the board gets a summary: how many resolved overnight, how many are pending, and how many days remain.",
            },
            {
              lead: "Export a Complete Audit Record for Any Batch or Licensee.",
              body: "Generate formatted PDF reports for any batch or licensee, with compliance status, certificate log, missing hours, notice history, and resolution timeline. Every notice is logged with a timestamp and batch ID, a defensible trail if a decision is ever challenged.",
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
