import Link from "next/link";
import { cn } from "@/lib/utils";

/*
  Reusable product detail section. Two-column layout (text + mockup); the
  ProTrack variant flips the column order via `reverse` so the mockup sits on
  the left.

  Each feature item leads with a bold phrase followed by a descriptive
  paragraph. The bold lead is rendered as <strong> inside the same flow so it
  reads as a single body paragraph with visual emphasis.

  Section bg can be `white` or `alt` (--surface). On `alt`, the eyebrow's
  product color stays the same; only the surrounding canvas shifts.
*/

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2";

export type DetailFeature = { lead: string; body: string };

const labelColor: Record<"ace" | "pro" | "ver", string> = {
  ace: "text-ace",
  pro: "text-pro",
  ver: "text-ver",
};

const dotColor: Record<"ace" | "pro" | "ver", string> = {
  ace: "bg-ace",
  pro: "bg-pro",
  ver: "bg-ver",
};

const buttonStyles: Record<"ace" | "pro" | "ver", string> = {
  ace: "bg-ace text-navy hover:opacity-90 focus-visible:ring-ace-light focus-visible:ring-offset-white",
  pro: "bg-pro text-white hover:opacity-90 focus-visible:ring-pro-light focus-visible:ring-offset-surface",
  ver: "bg-ver text-white hover:opacity-90 focus-visible:ring-ver-light focus-visible:ring-offset-white",
};

export function ProductDetail({
  id,
  color,
  bg = "white",
  reverse = false,
  label,
  name,
  audience,
  description,
  features,
  ctaLabel,
  ctaHref,
  mockup,
}: {
  id: string;
  color: "ace" | "pro" | "ver";
  bg?: "white" | "alt";
  reverse?: boolean;
  label: string;
  name: React.ReactNode;
  audience: string;
  description: string;
  features: DetailFeature[];
  ctaLabel: string;
  ctaHref: string;
  mockup: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className={cn(
        "px-5 py-16 md:px-10 md:py-20",
        bg === "alt" && "bg-surface",
      )}
    >
      <div className="mx-auto grid max-w-[1000px] items-center gap-10 md:grid-cols-2 md:gap-16">
        <div className={cn(reverse && "md:order-2")}>
          <p
            className={cn(
              "mb-2.5 text-[10px] font-bold uppercase tracking-[2px]",
              labelColor[color],
            )}
          >
            {label}
          </p>
          <h2 className="mb-2 text-balance font-serif text-3xl font-bold leading-tight text-navy md:text-[36px]">
            {name}
          </h2>
          <p className="mb-4 text-[13px] text-text-muted">{audience}</p>
          <p className="mb-6 text-pretty text-sm leading-relaxed text-text-mid">
            {description}
          </p>
          <ul className="mb-7 flex flex-col gap-2">
            {features.map((feat) => (
              <li
                key={feat.lead}
                className="flex items-start gap-2.5 text-[13px] leading-snug text-text-mid"
              >
                <span
                  className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", dotColor[color])}
                />
                <span className="text-pretty">
                  <strong className="font-semibold text-navy">{feat.lead}</strong>{" "}
                  {feat.body}
                </span>
              </li>
            ))}
          </ul>
          <Link
            href={ctaHref}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg px-6 py-2.5 text-[13px] font-semibold transition-opacity",
              buttonStyles[color],
              focusRing,
            )}
          >
            {ctaLabel} <span aria-hidden>→</span>
          </Link>
        </div>
        <div className={cn(reverse && "md:order-1")}>{mockup}</div>
      </div>
    </section>
  );
}
