import type { Metadata } from "next";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { PageHero } from "@/components/marketing/page-hero";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Get in touch with the DentalACE One team. Email info@dentalace.org, or go straight to the right tool for CE providers, dental professionals, or state boards.",
};

const paths: {
  tag: string;
  title: string;
  body: string;
  href: string;
  cta: string;
  color: "ace" | "pro" | "ver";
}[] = [
  {
    tag: "CE providers & educators",
    title: "Get a course accredited",
    body: "Submit course applications, issue certificates, and manage your accreditation in the DentalACE portal.",
    href: "/company",
    cta: "Go to DentalACE",
    color: "ace",
  },
  {
    tag: "Dentists, hygienists & assistants",
    title: "Track your CE hours",
    body: "Create a free ProTrack account to track CE against your state's requirements and stay audit-ready.",
    href: "/signup",
    cta: "Create free account",
    color: "pro",
  },
  {
    tag: "State dental boards",
    title: "Request board access",
    body: "Verify is provisioned directly by the AADB. Tell us about your board and we will set up access.",
    href: "/verify/contact",
    cta: "Request board access",
    color: "ver",
  },
];

const cardAccent: Record<"ace" | "pro" | "ver", string> = {
  ace: "border-ace/30 hover:border-ace",
  pro: "border-pro/30 hover:border-pro",
  ver: "border-ver/30 hover:border-ver",
};
const tagAccent: Record<"ace" | "pro" | "ver", string> = {
  ace: "text-ace-dark",
  pro: "text-pro-dark",
  ver: "text-ver-dark",
};

export default function ContactPage() {
  return (
    <>
      <PageHero
        eyebrow="Get in touch"
        title={
          <>
            We are here to <span className="text-ace-light">help</span>
          </>
        }
        sub="Questions about accreditation, CE tracking, or board auditing? Reach the DentalACE One team directly, or jump straight to the right tool below."
      />

      {/* Direct contact */}
      <section className="bg-white px-5 py-16 text-center md:px-10 md:py-20">
        <div className="mx-auto max-w-[560px]">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[2.5px] text-text-muted">
            Email us
          </p>
          <a
            href="mailto:info@dentalace.org"
            className="font-serif text-3xl font-bold text-navy underline decoration-ace decoration-2 underline-offset-4 transition-colors hover:text-ace-dark md:text-4xl"
          >
            info@dentalace.org
          </a>
          <p className="mx-auto mt-4 text-pretty text-sm leading-relaxed text-text-mid">
            We typically reply within one business day. For account-specific
            questions, please sign in first so we can find your records quickly.
          </p>
          <Link
            href="/login"
            className="mt-6 inline-block rounded-lg border border-border px-5 py-2 text-[13px] font-semibold text-navy transition-colors hover:bg-surface"
          >
            Sign in
          </Link>
        </div>
      </section>

      {/* Go straight to the right tool */}
      <section className="bg-surface px-5 py-16 md:px-10 md:py-20">
        <h2 className="mb-10 text-center font-serif text-3xl font-bold text-navy md:text-[34px]">
          Or go straight to the right tool
        </h2>
        <div className="mx-auto grid max-w-[1000px] gap-6 md:grid-cols-3">
          {paths.map((p) => (
            <div
              key={p.href}
              className={cn(
                "flex flex-col rounded-2xl border bg-white p-7 transition-colors",
                cardAccent[p.color],
              )}
            >
              <p
                className={cn(
                  "mb-2 font-mono text-[10px] uppercase tracking-[2px]",
                  tagAccent[p.color],
                )}
              >
                {p.tag}
              </p>
              <h3 className="mb-2 font-serif text-xl font-bold text-navy">
                {p.title}
              </h3>
              <p className="mb-5 text-pretty text-sm leading-relaxed text-text-mid">
                {p.body}
              </p>
              <Link
                href={p.href}
                className="mt-auto text-[13px] font-semibold text-navy hover:underline"
              >
                {p.cta} →
              </Link>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
