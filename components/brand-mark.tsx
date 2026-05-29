import { cn } from "@/lib/utils";

/*
  Dental ACE brand mark. "Dental" inherits the surrounding text color; "ACE" is
  always rendered in --ace-light. Use on navy backgrounds (sidebar, login).
  For light surfaces, override the parent text color to navy via className.
*/
export function BrandMark({
  tag,
  size = "md",
  className,
}: {
  tag?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sizeClass = {
    sm: "text-base",
    md: "text-xl",
    lg: "text-2xl",
  }[size];

  return (
    <div className={cn("flex flex-col gap-0.5", className)}>
      {tag ? (
        <span className="font-mono text-[9px] uppercase tracking-[2px] text-white/30">
          {tag}
        </span>
      ) : null}
      <span className={cn("font-serif font-bold leading-none", sizeClass)}>
        Dental <span className="text-ace-light">ACE</span>
      </span>
    </div>
  );
}
