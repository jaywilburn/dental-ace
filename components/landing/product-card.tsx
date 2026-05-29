import Link from "next/link";
import { cn } from "@/lib/utils";

/*
  Hero product card. Three instances render side-by-side in the hero grid:
  Dental ACE, ProTrack, Verify. Each is a clickable card linking to its
  respective portal. Hover lifts the card with a transform + shadow (compositor
  props only, wrapped in motion-safe).
*/

export type ProductColor = "ace" | "pro" | "ver";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ace-light focus-visible:ring-offset-4 focus-visible:ring-offset-navy";

const stripeBg: Record<ProductColor, string> = {
  ace: "bg-gradient-to-r from-ace to-ace-light",
  pro: "bg-gradient-to-r from-pro to-pro-light",
  ver: "bg-gradient-to-r from-ver to-ver-light",
};

const tagStyles: Record<ProductColor, string> = {
  ace: "bg-ace-bg text-ace-dark",
  pro: "bg-pro-bg text-pro-dark",
  ver: "bg-ver-bg text-ver-dark",
};

const nameColor: Record<ProductColor, string> = {
  ace: "text-ace-dark",
  pro: "text-pro-dark",
  ver: "text-ver-dark",
};

const dotColor: Record<ProductColor, string> = {
  ace: "bg-ace",
  pro: "bg-pro",
  ver: "bg-ver",
};

const buttonStyles: Record<ProductColor, string> = {
  ace: "bg-ace text-navy hover:opacity-90",
  pro: "bg-pro text-white hover:opacity-90",
  ver: "bg-ver text-white hover:opacity-90",
};

export function ProductCard({
  color,
  tag,
  name,
  audience,
  description,
  features,
  buttonLabel,
  href,
}: {
  color: ProductColor;
  tag: string;
  name: React.ReactNode;
  audience: string;
  description: string;
  features: string[];
  buttonLabel: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group block overflow-hidden rounded-2xl border border-white/[0.08] bg-white text-left transition-transform duration-200 motion-safe:hover:-translate-y-1 motion-safe:hover:shadow-2xl",
        focusRing,
      )}
    >
      <div className={cn("h-[5px]", stripeBg[color])} />
      <div className="p-6 pb-5">
        <span
          className={cn(
            "mb-3.5 inline-block rounded-[10px] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[1.5px]",
            tagStyles[color],
          )}
        >
          {tag}
        </span>
        <p className={cn("mb-1 font-serif text-[28px] font-bold leading-tight", nameColor[color])}>
          {name}
        </p>
        <p className="mb-3.5 text-xs font-medium text-text-muted">{audience}</p>
        <p className="mb-5 text-pretty text-[13px] leading-relaxed text-text-mid">
          {description}
        </p>
        <ul className="mb-5 flex flex-col gap-1.5">
          {features.map((feature) => (
            <li
              key={feature}
              className="flex items-start gap-2 text-[12px] leading-snug text-text-mid"
            >
              <span
                className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", dotColor[color])}
              />
              {feature}
            </li>
          ))}
        </ul>
        <span
          className={cn(
            "flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-[13px] font-semibold transition-opacity",
            buttonStyles[color],
          )}
        >
          {buttonLabel} <span aria-hidden>→</span>
        </span>
      </div>
    </Link>
  );
}
