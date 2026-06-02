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

export const DELIVERY_OPTIONS: { value: DeliveryFormat; label: string }[] = [
  { value: "IN_PERSON", label: "In-Person" },
  { value: "ONLINE", label: "Online" },
  { value: "HYBRID", label: "Hybrid / Webinar" },
];
