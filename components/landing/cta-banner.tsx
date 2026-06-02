import Link from "next/link";
import { cn } from "@/lib/utils";

/*
  Final CTA: navy band with a centered gold radial blob, headline, and 3 role
  selector cards that go directly to the right entry point per role.
*/

const blob = {
  background:
    "radial-gradient(circle, rgba(200,151,26,0.08) 0%, transparent 70%)",
};

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ace-light focus-visible:ring-offset-2 focus-visible:ring-offset-navy";

const ctaCards: {
  href: string;
  name: string;
  desc: string;
  color: "ace" | "pro" | "ver";
}[] = [
  {
    href: "/company",
    name: "DentalACE",
    desc: "CE providers & educators",
    color: "ace",
  },
  {
    href: "/signup",
    name: "ProTrack",
    desc: "Dentists, hygienists & assistants",
    color: "pro",
  },
  {
    href: "/verify/contact",
    name: "Verify",
    desc: "State dental boards",
    color: "ver",
  },
];

const nameColor: Record<"ace" | "pro" | "ver", string> = {
  ace: "text-ace-light",
  pro: "text-pro-light",
  ver: "text-ver-light",
};

export function CtaBanner() {
  return (
    <section className="relative overflow-hidden bg-navy px-5 py-16 text-center md:px-10 md:py-20">
      <div
        aria-hidden
        style={blob}
        className="pointer-events-none absolute left-1/2 top-1/2 size-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full"
      />
      <h2 className="relative z-10 mb-2.5 text-balance font-serif text-3xl font-bold text-white md:text-[40px]">
        Ready to get started?
      </h2>
      <p className="relative z-10 mx-auto mb-9 max-w-[460px] text-pretty text-base text-white/60">
        Select your role and go directly to the right tool.
      </p>
      <div className="relative z-10 flex flex-wrap justify-center gap-3">
        {ctaCards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className={cn(
              "min-w-[200px] rounded-xl border border-white/15 bg-white/[0.06] px-6 py-4 text-left transition-colors hover:border-white/25 hover:bg-white/10",
              focusRing,
            )}
          >
            <p
              className={cn(
                "mb-0.5 text-[15px] font-semibold",
                nameColor[card.color],
              )}
            >
              {card.name}
            </p>
            <p className="text-xs text-white/60">{card.desc} →</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
