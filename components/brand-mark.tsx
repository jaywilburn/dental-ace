import { cn } from "@/lib/utils";

/*
  Brand mark. The first word inherits the surrounding text color; the accent
  word is rendered in --ace-light (gold) regardless of product, matching the
  prototypes and the "internal UI defaults to gold" brand rule. Use on navy
  backgrounds (sidebar, login). For light surfaces, override the parent text
  color to navy via className.

  product (default "suite" → the whole platform):
    "suite" → DentalACE One   "ace" → DentalACE
    "pro" → ProTrack   "ver" → Verify
*/
export function BrandMark({
  tag,
  product = "suite",
  size = "md",
  className,
}: {
  tag?: string;
  product?: "suite" | "ace" | "pro" | "ver";
  size?: "sm" | "md" | "lg";
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
        <span className="font-mono text-[9px] uppercase tracking-[2px] text-white/30">
          {tag}
        </span>
      ) : null}
      <span className={cn("font-serif font-bold leading-none", sizeClass)}>
        {wordmark}
      </span>
    </div>
  );
}
