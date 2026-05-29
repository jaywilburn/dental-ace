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
          description="The AADB Accredited Continuing Education program, fully digitized. Submit applications, manage course assets, issue QR-coded certificates, and track attendee completions all in one place. Replaces WordPress, Typeform, Zapier, and manual spreadsheets."
          features={[
            {
              lead: "Get Your CE Courses AADB-Accredited Fast.",
              body: "Submit your course application through a guided 5-step online process. Upload your materials, build your quiz, and get in front of an AADB reviewer without the paperwork bottleneck. Approved courses receive an official Course ID, an approval letter, and a scannable QR code so your accreditation is verifiable the moment it is issued.",
            },
            {
              lead: "Deliver Certificates Automatically at Scale.",
              body: "Once your course is approved, attendees complete it, pass the quiz, and receive a branded, board-recognized CE certificate as a PDF, delivered by email the moment they finish. No manual processing. No chasing paperwork. You issue certificates in volume without adding a single administrative step.",
            },
            {
              lead: "A Single Dashboard to Manage Everything.",
              body: "Track your active courses, certificate balance, application credits, and every certificate issued, all from one portal. Real-time activity logs show you exactly where your program stands. When your cert balance gets low, the system alerts you automatically so you never interrupt service to attendees.",
            },
            {
              lead: "Your Courses Feed Directly Into ProTrack.",
              body: "Every certificate issued through Dental ACE syncs automatically to ProTrack, the CE compliance tool used by dentists, hygienists, and dental assistants across all 50 states. That means your course credit lands in your attendees' license trackers without any action on their part. More value delivered. More reasons to choose your courses.",
            },
            {
              lead: "Built for the Way Dental Education Actually Works.",
              body: "Dental ACE handles in-person, online, and hybrid delivery formats. Courses support multiple presenters, co-creators, and full commercial disclosure documentation, matching the standards dental companies and associations already operate under. Whether you are a regional association running live events or a company offering on-demand online content, the platform is built to fit your workflow.",
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
          description="Your personal CE dashboard, free forever. Track hours against your state's exact requirements across all categories. Upload certificates from any provider. Stay audit-ready from the moment you log in."
          features={[
            {
              lead: "Your CE Hours. One Dashboard. Always Current.",
              body: "ProTrack gives dentists, hygienists, and dental assistants a single place to see exactly where they stand on CE requirements for their state. Hours are broken down by required category, progress bars update in real time, and the system tells you not just how many hours you have, but which specific categories still need work and how much time you have left.",
            },
            {
              lead: "Dental ACE Certificates Sync Automatically. No Upload Needed.",
              body: "Every time you complete a course through an AADB-accredited provider, that certificate lands in your ProTrack record automatically, matched by license number. No manual entry, no uploading PDFs, no chasing paper. You take the course, the hours appear. For any certificate outside of Dental ACE, upload it once and ProTrack maps it to the right category.",
            },
            {
              lead: "Built for All 50 States, All Three License Types.",
              body: "ProTrack knows the CE requirements for every state and every license type, whether you are a DDS, RDH, or DA. It tracks your primary state by default and supports multiple state licenses at the same time, each with its own progress tracker, renewal date, and compliance status.",
            },
            {
              lead: "Automated Reminders So a Deadline Never Catches You Off Guard.",
              body: "ProTrack sends renewal reminders at 90, 60, 30, and 7 days out. It also fires category gap alerts when a required category has zero hours with six months left, and in-person-only alerts for requirements like sedation and medical emergencies that cannot be completed online. You set it and the system watches the clock for you.",
            },
            {
              lead: "Export an Audit-Ready Report in One Click.",
              body: "If your state board ever calls, ProTrack generates a formatted CE compliance PDF in one click. It includes your licensee information, your full certificate log, category breakdown, hours completed versus required, and any gaps, exactly what a dental board auditor needs to see. Your records are always organized and always ready.",
            },
          ]}
          ctaLabel="Create free account"
          ctaHref="/protrack/register"
          mockup={<MockupProTrack />}
        />

        <ProductDetail
          id="verify"
          color="ver"
          label="Product 03 · Board Auditing"
          name="Verify"
          audience="For state dental boards, provisioned by AADB"
          description="Replace your paper-based CE audit process entirely. Run a random audit on any percentage of your licensees with one click. Deficiencies surface instantly, notices go out in bulk, and every audit is fully documented for your records."
          features={[
            {
              lead: "Run a Randomized CE Audit in Seconds, Not Weeks.",
              body: "Verify gives state dental boards a one-click audit trigger that randomly selects a percentage of active licensees, pulls their live CE records directly from ProTrack, and returns full compliance results instantly. No spreadsheets, no manual record requests, no paper. A board with 8,400 active licensees can audit a 10% random sample and have deficiency results in hand before the end of the day.",
            },
            {
              lead: "See Every Licensee's CE Status in One Place.",
              body: "The Verify dashboard shows every active licensee in the board's state, broken down by compliance status, license type, and deficiency category. Boards can see at a glance how many licensees are fully compliant, in progress, or deficient, and drill into any individual record to see exactly which hours and categories are missing, backed by verified certificates pulled directly from ProTrack.",
            },
            {
              lead: "Send Personalized Deficiency Notices in Bulk, Automatically.",
              body: "When an audit surfaces deficiencies, boards send notices to every deficient licensee in one action. Each notice is personalized with the licensee's specific missing hours, missing categories, and response deadline. Follow-up reminders fire automatically at 30 days and a final warning goes out at 7 days, all without any additional action from the board.",
            },
            {
              lead: "Deficiencies Resolve Themselves. The Board Just Watches.",
              body: "When a deficient licensee uploads their missing certificates to ProTrack, Verify detects the resolution automatically through a daily sync and closes the deficiency without the board lifting a finger. Each morning, the board receives a summary showing how many deficiencies resolved overnight, how many are still pending, and how many days remain until the deadline.",
            },
            {
              lead: "Export a Complete Audit Record for Any Batch or Licensee.",
              body: "Verify generates formatted PDF reports for any audit batch or individual licensee record, including compliance status, certificate log, missing hours, notice history, and resolution timeline. Every notice sent is logged with a timestamp, batch ID, and notice type, giving boards a full, defensible audit trail if a licensing decision is ever challenged.",
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
