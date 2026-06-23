import type { Metadata } from "next";
import { PageHero } from "@/components/marketing/page-hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { EcoStrip } from "@/components/landing/eco-strip";
import { CtaBanner } from "@/components/landing/cta-banner";

export const metadata: Metadata = {
  title: "How it works",
  description:
    "How the three tools work together: a CE certificate accredited in DentalACE flows automatically into ProTrack and becomes visible to state boards in Verify.",
};

const breakdown: {
  step: string;
  color: "ace" | "pro" | "ver";
  title: string;
  body: string;
}[] = [
  {
    step: "For CE providers",
    color: "ace",
    title: "Accredit and issue in DentalACE",
    body: "Submit a course through the guided application, get reviewer approval, and receive a Course ID and QR code. Attendees scan, pass the quiz, and get a branded CE certificate by email automatically. No spreadsheets, no manual sending.",
  },
  {
    step: "For dental professionals",
    color: "pro",
    title: "Track every hour in ProTrack",
    body: "Certificates from DentalACE land in your ProTrack record automatically, matched by license number. Upload anything from other providers once and it maps to the right category. Progress bars and reminders keep you ahead of every renewal deadline.",
  },
  {
    step: "For state boards",
    color: "ver",
    title: "Audit with confidence in Verify",
    body: "Run a CE audit on any percentage of licensees in one click. Compliance data is pulled live from ProTrack, deficiencies surface instantly, notices go out in bulk, and every batch produces a complete, defensible audit record.",
  },
];

const accentText: Record<"ace" | "pro" | "ver", string> = {
  ace: "text-ace",
  pro: "text-pro",
  ver: "text-ver",
};
const accentBorder: Record<"ace" | "pro" | "ver", string> = {
  ace: "border-l-ace",
  pro: "border-l-pro",
  ver: "border-l-ver",
};

export default function HowItWorksPage() {
  return (
    <>
      <PageHero
        eyebrow="The connected platform"
        title={
          <>
            One CE record, from the classroom to the{" "}
            <span className="text-ace-light">renewal</span>
          </>
        }
        sub="Accreditation, tracking, and auditing have always lived in separate silos. DentalACE One connects them, so data flows automatically at every step of the dental CE lifecycle."
      />

      {/* Reuse the landing 5-step timeline */}
      <HowItWorks />

      {/* Ecosystem flow strip (lives on navy) */}
      <div className="bg-navy">
        <EcoStrip />
      </div>

      {/* Per-audience breakdown */}
      <section className="bg-white px-5 py-16 md:px-10 md:py-20">
        <h2 className="mb-12 text-balance text-center font-serif text-3xl font-bold text-navy md:text-[38px]">
          What it looks like for you
        </h2>
        <div className="mx-auto flex max-w-[760px] flex-col gap-6">
          {breakdown.map((b) => (
            <div
              key={b.title}
              className={`rounded-r-xl border border-l-4 border-border bg-surface p-6 ${accentBorder[b.color]}`}
            >
              <p
                className={`mb-1.5 font-mono text-[10px] uppercase tracking-[2px] ${accentText[b.color]}`}
              >
                {b.step}
              </p>
              <h3 className="mb-2 font-serif text-xl font-bold text-navy">
                {b.title}
              </h3>
              <p className="text-pretty text-sm leading-relaxed text-text-mid">
                {b.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      <CtaBanner />
    </>
  );
}
