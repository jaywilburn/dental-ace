import { cn } from "@/lib/utils";

/*
  5-step horizontal timeline on --surface background. Step circles show the
  step number, tinted per the product they represent (ace, pro, ver). A 1px
  connector line runs behind the circles at desktop widths (hidden on mobile
  where steps stack two-per-row).
*/

const steps: { color: "ace" | "pro" | "ver"; title: string; desc: string }[] = [
  {
    color: "ace",
    title: "Course accredited",
    desc: "CE provider submits through DentalACE and an AADB reviewer approves. The Course ID, attendee link, QR code, and approval letter are generated automatically.",
  },
  {
    color: "ace",
    title: "Attendees scan or click",
    desc: "Attendees scan the QR code or click the attendee link, complete the quiz, and receive their CE certificate PDF by email instantly.",
  },
  {
    color: "pro",
    title: "CE auto-logged",
    desc: "The certificate appears automatically in the licensee's ProTrack dashboard. No upload needed.",
  },
  {
    color: "ver",
    title: "Board audits",
    desc: "State board runs an audit in Verify. Compliance data is live. Deficiencies flagged instantly.",
  },
  {
    color: "ver",
    title: "Renewal complete",
    desc: "Licensee renews with confidence. Board has a full audit trail. No paper, no delays, no scrambling.",
  },
];

const stepBg: Record<"ace" | "pro" | "ver", string> = {
  ace: "bg-ace-bg border-ace text-ace-dark",
  pro: "bg-pro-bg border-pro text-pro-dark",
  ver: "bg-ver-bg border-ver text-ver-dark",
};

export function HowItWorks() {
  return (
    <section id="how" className="bg-surface px-5 py-16 md:px-10 md:py-20">
      <p className="mb-2.5 text-center font-mono text-[10px] uppercase tracking-[2.5px] text-text-muted">
        The connected platform
      </p>
      <h2 className="mb-2 text-balance text-center font-serif text-3xl font-bold text-navy md:text-[38px]">
        How the three tools work together
      </h2>
      <p className="mx-auto mb-12 max-w-[520px] text-pretty text-center text-[15px] leading-relaxed text-text-muted md:mb-14">
        Every step in the dental CE lifecycle is connected. Data flows
        automatically from accreditation through tracking to compliance.
      </p>

      <ol className="relative mx-auto grid max-w-[1000px] grid-cols-2 gap-y-6 md:grid-cols-5 md:gap-0">
        <div
          aria-hidden
          className="absolute left-[10%] right-[10%] top-7 hidden h-px bg-border md:block"
        />
        {steps.map((step, i) => (
          <li
            key={step.title}
            className="relative z-10 px-3 text-center"
          >
            <div
              className={cn(
                "mx-auto mb-3.5 flex size-14 items-center justify-center rounded-full border bg-white font-serif text-lg font-bold",
                stepBg[step.color],
              )}
              aria-hidden
            >
              {i + 1}
            </div>
            <p className="mb-1 text-[13px] font-semibold text-navy">
              <span className="sr-only">Step {i + 1}. </span>
              {step.title}
            </p>
            <p className="text-pretty text-xs leading-relaxed text-text-muted">
              {step.desc}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
