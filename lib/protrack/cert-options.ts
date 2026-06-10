import type { DeliveryFormat } from "@prisma/client";

/*
  Plain (non-"use server") module for certificate form options + the action's
  return type. These cannot live in cert-actions.ts because a "use server" file
  may only export async functions.
*/

export type CertActionState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

/*
  Fallback category list. The upload page prefers the category names from the
  user's own state requirement (client feedback, 2026-06: categories should
  match state requirements); this list is used when their state's requirements
  are not loaded yet.
*/
export const CATEGORY_OPTIONS = [
  "General CE",
  "Jurisprudence",
  "Sedation",
  "Infection Control",
  "Med. Emergencies",
  "Ethics",
] as const;

export const ACCREDITATIONS = [
  "ADA_CERP",
  "AGD_PACE",
  "STATE_BOARD",
  "OTHER",
] as const;

export const ACCREDITATION_OPTIONS: { value: string; label: string }[] = [
  { value: "ADA_CERP", label: "ADA CERP" },
  { value: "AGD_PACE", label: "AGD PACE" },
  { value: "STATE_BOARD", label: "State Board" },
  { value: "OTHER", label: "Other" },
];

/*
  Labels mirror the course-application delivery formats (client feedback,
  2026-06). Several labels share the ONLINE bucket because compliance matching
  (lib/protrack/progress.ts) only distinguishes in-person vs online; existing
  rows with the retired HYBRID value keep counting as either.
*/
export const DELIVERY_OPTIONS: { value: DeliveryFormat; label: string }[] = [
  { value: "IN_PERSON", label: "Live/In Person" },
  { value: "ONLINE", label: "Live/Virtual" },
  { value: "ONLINE", label: "Written Education" },
  { value: "ONLINE", label: "On Demand" },
];
