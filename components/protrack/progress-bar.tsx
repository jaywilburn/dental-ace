import { cn } from "@/lib/utils";

/*
  Thin progress bar used on the CE dashboard, multi-state trackers, and the
  state-requirements view. Solid fills (no gradient) per the UI constraints.
*/

type ProgressTone = "ace" | "green" | "red" | "muted";

const toneFill: Record<ProgressTone, string> = {
  ace: "bg-ace",
  green: "bg-green-600",
  red: "bg-red-500",
  muted: "bg-border",
};

export function ProgressBar({
  value,
  tone = "ace",
  className,
  label,
}: {
  value: number; // 0-100
  tone?: ProgressTone;
  className?: string;
  label?: string;
}) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      className={cn("h-2 w-full overflow-hidden rounded-full bg-surface-2", className)}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className={cn("h-full rounded-full", toneFill[tone])}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
