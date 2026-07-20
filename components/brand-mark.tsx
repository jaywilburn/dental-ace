import { cn } from "@/lib/utils";

/*
  Brand mark. The wordmark no longer inherits the surrounding text color; it
  takes an explicit `tone` prop instead. The accent word is rendered in
  --ace-light (gold) regardless of product, matching the prototypes and the
  "internal UI defaults to gold" brand rule. Defaults to white-on-dark (navy
  backgrounds: sidebar, login). For light surfaces, pass tone="light".

  product (default "suite" → the whole platform):
    "suite" → DentalACE One   "ace" → DentalACE
    "pro" → ProTrack   "ver" → Verify
*/
export function BrandMark({
  tag,
  product = "suite",
  size = "md",
  tone = "dark",
  className,
}: {
  tag?: string;
  product?: "suite" | "ace" | "pro" | "ver";
  size?: "sm" | "md" | "lg";
  tone?: "dark" | "light";
  className?: string;
}) {
  const sizeClass = {
    sm: "text-base",
    md: "text-xl",
    lg: "text-2xl",
  }[size];

  const wordmark = {
    suite: (
      <>
        Dental<span className="text-ace-light">ACE</span> One
      </>
    ),
    ace: (
      <>
        Dental<span className="text-ace-light">ACE</span>
      </>
    ),
    pro: (
      <>
        Pro<span className="text-ace-light">Track</span>
      </>
    ),
    ver: <>Verify</>,
  }[product];

  return (
    <div className={cn("flex flex-col gap-0.5", className)}>
      {tag ? (
        <span
          className={cn(
            "font-mono text-[9px] uppercase tracking-[2px]",
            tone === "light" ? "text-navy/40" : "text-white/30",
          )}
        >
          {tag}
        </span>
      ) : null}
      <span
        className={cn(
          "font-serif font-bold leading-none",
          tone === "light" ? "text-navy" : "text-white",
          sizeClass,
        )}
      >
        {wordmark}
      </span>
    </div>
  );
}
