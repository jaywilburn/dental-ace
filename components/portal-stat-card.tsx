import { cn } from "@/lib/utils";

/*
  Stat card used across the customer dashboard. Top stripe colour signals
  the metric category. Children render below the value as supporting meta.
*/

export type StatTone = "gold" | "green" | "blue" | "purple" | "muted";

const toneStripe: Record<StatTone, string> = {
  gold: "bg-ace",
  green: "bg-green-600",
  blue: "bg-ver",
  purple: "bg-purple",
  muted: "bg-border",
};

export function PortalStatCard({
  label,
  value,
  meta,
  tone = "gold",
  className,
}: {
  label: string;
  value: React.ReactNode;
  meta?: string;
  tone?: StatTone;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border border-border bg-white p-4",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn("absolute inset-x-0 top-0 h-[3px]", toneStripe[tone])}
      />
      <p className="text-[11px] font-medium uppercase tracking-wide text-text-muted">
        {label}
      </p>
      <p className="mt-1 font-serif text-3xl font-bold leading-none text-navy tabular-nums">
        {value}
      </p>
      {meta ? <p className="mt-2 text-[11px] text-text-muted">{meta}</p> : null}
    </div>
  );
}
