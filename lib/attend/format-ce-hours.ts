import { formatHours } from "@/lib/protrack/progress";

/*
  The one CE-hours label used by the event attendee form (session list, review
  step, page header) and the event certificate PDF, so every surface reads the
  same way: "1 CE hour", "1.5 CE hours", "8 CE hours". No trailing ".0", and
  singular only for exactly one hour. A missing or invalid value renders as
  "? CE hours" (the old "? hrs" placeholder) rather than a misleading 0.
*/
export function formatCeHours(hours: number | null | undefined): string {
  if (typeof hours !== "number" || !Number.isFinite(hours) || hours < 0) return "? CE hours";
  return `${formatHours(hours)} CE ${hours === 1 ? "hour" : "hours"}`;
}
