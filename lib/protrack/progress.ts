import type { DeliveryFormat } from "@prisma/client";

/*
  Pure CE-progress math. No DB, no framework — reused by the dashboard,
  multi-state tracking, and the audit PDF export.

  A certificate counts toward a category only if its delivery format satisfies
  the category's constraint (e.g. a Texas RDH's 2 sedation hours must be earned
  in person). Hours beyond a category's minimum spill nowhere — but every cert,
  regardless of category, counts toward the overall total (up to the total
  required), modelling boards whose total exceeds the sum of named minimums.
*/

export type CategoryFormat = "ANY" | "IN_PERSON" | "ONLINE";

export type RequirementCategory = {
  name: string;
  hours: number;
  format: CategoryFormat;
};

export type ProgressCertificate = {
  category: string;
  hours: number;
  deliveryFormat: DeliveryFormat | null;
};

export type CategoryStatus = "complete" | "in_progress" | "not_started";

export type CategoryProgress = {
  name: string;
  format: CategoryFormat;
  required: number;
  completed: number; // capped at required, for the progress bar
  earned: number; // uncapped sum of qualifying hours
  needed: number; // max(0, required - earned)
  status: CategoryStatus;
};

export type RequirementProgress = {
  totalRequired: number;
  totalCompleted: number; // capped at totalRequired
  totalEarned: number; // uncapped
  remaining: number;
  pct: number; // 0-100, integer
  categories: CategoryProgress[];
  status: "complete" | "in_progress";
};

function formatSatisfies(
  reqFormat: CategoryFormat,
  certFormat: DeliveryFormat | null,
): boolean {
  if (reqFormat === "ANY") return true;
  if (certFormat === "HYBRID") return true; // hybrid counts for either constraint
  if (reqFormat === "IN_PERSON") return certFormat === "IN_PERSON";
  if (reqFormat === "ONLINE") return certFormat === "ONLINE";
  return false;
}

export function computeRequirementProgress(
  requirement: { totalHours: number; categories: RequirementCategory[] },
  certificates: ProgressCertificate[],
): RequirementProgress {
  const categories: CategoryProgress[] = requirement.categories.map((cat) => {
    const earned = certificates
      .filter(
        (c) =>
          c.category === cat.name &&
          formatSatisfies(cat.format, c.deliveryFormat),
      )
      .reduce((sum, c) => sum + c.hours, 0);

    const completed = Math.min(earned, cat.hours);
    const needed = Math.max(0, cat.hours - earned);
    const status: CategoryStatus =
      earned >= cat.hours ? "complete" : earned > 0 ? "in_progress" : "not_started";

    return {
      name: cat.name,
      format: cat.format,
      required: cat.hours,
      completed,
      earned,
      needed,
      status,
    };
  });

  const totalEarned = certificates.reduce((sum, c) => sum + c.hours, 0);
  const totalRequired = requirement.totalHours;
  const totalCompleted = Math.min(totalEarned, totalRequired);
  const remaining = Math.max(0, totalRequired - totalEarned);
  const pct =
    totalRequired > 0 ? Math.round((totalCompleted / totalRequired) * 100) : 0;

  return {
    totalRequired,
    totalCompleted,
    totalEarned,
    remaining,
    pct,
    categories,
    status: remaining <= 0 ? "complete" : "in_progress",
  };
}

/** Whole months from `from` to `to`, floored at 0. */
export function monthsUntil(from: Date, to: Date): number {
  let months =
    (to.getFullYear() - from.getFullYear()) * 12 +
    (to.getMonth() - from.getMonth());
  if (to.getDate() < from.getDate()) months -= 1;
  return Math.max(0, months);
}

/** Parse the StateRequirement.categories JSON column into typed categories. */
export function parseCategories(json: unknown): RequirementCategory[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const obj = raw as Record<string, unknown>;
    const name = typeof obj.name === "string" ? obj.name : null;
    const hours = typeof obj.hours === "number" ? obj.hours : Number(obj.hours);
    const format =
      obj.format === "IN_PERSON" || obj.format === "ONLINE" ? obj.format : "ANY";
    if (!name || Number.isNaN(hours)) return [];
    return [{ name, hours, format }];
  });
}

const CATEGORY_ICONS: Record<string, string> = {
  "General CE": "🦷",
  Jurisprudence: "⚖️",
  Sedation: "😴",
  "Infection Control": "🧬",
  "Med. Emergencies": "🚑",
  "Medical Errors": "📋",
  "Basic Life Support": "❤️",
  "HIV/AIDS": "🎗️",
  "Domestic Violence": "🛡️",
  Ethics: "🧭",
};

export function categoryIcon(name: string): string {
  return CATEGORY_ICONS[name] ?? "📘";
}

export function formatLabel(format: CategoryFormat): string {
  switch (format) {
    case "IN_PERSON":
      return "In-Person only";
    case "ONLINE":
      return "Online only";
    default:
      return "Online or In-Person";
  }
}

/** Format a number of CE hours without a trailing ".0" for whole numbers. */
export function formatHours(hours: number): string {
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
}
