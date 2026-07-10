import { z } from "zod";

/*
  Validation for the marketing lead-capture forms (VerifyIQ early-access and
  Verify sales inquiry). Kept in its own module (mirrors lib/company/
  register-schema.ts) so the submitMarketingLead server action and the unit
  tests share one boundary definition without either pulling in server-only deps.

  Both landing pages are pre-launch marketing; this schema is the trust boundary
  for a fully public, unauthenticated endpoint, so every field is bounded.
*/

// Mirrors the Prisma enum MarketingLeadSource. Kept as a local literal union so
// this module stays free of the Prisma client (pure + trivially testable); the
// string values are identical, so the action passes parsed.source straight
// through to prisma.marketingLead.create.
export const MARKETING_LEAD_SOURCES = ["VERIFYIQ", "VERIFY"] as const;
export type MarketingLeadSourceValue = (typeof MARKETING_LEAD_SOURCES)[number];

/** Where each source's form lives — the action redirects back here with ?sent / ?error. */
export const MARKETING_LEAD_RETURN_PATH: Record<MarketingLeadSourceValue, string> = {
  VERIFYIQ: "/verifyiq/contact",
  VERIFY: "/verify/contact",
};

export const marketingLeadSchema = z.object({
  source: z.enum(MARKETING_LEAD_SOURCES),
  contactName: z
    .string()
    .trim()
    .min(1, "Your name is required")
    .max(200, "Name must be 200 characters or fewer"),
  title: z
    .string()
    .trim()
    .max(200, "Title must be 200 characters or fewer")
    .optional()
    .transform((v) => (v ? v : undefined)),
  organization: z
    .string()
    .trim()
    .min(1, "Organization is required")
    .max(200, "Organization must be 200 characters or fewer"),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Enter a valid email address")
    .max(200, "Email must be 200 characters or fewer"),
  message: z
    .string()
    .trim()
    .max(2000, "Message must be 2000 characters or fewer")
    .optional()
    .transform((v) => (v ? v : undefined)),
});

export type MarketingLeadInput = z.infer<typeof marketingLeadSchema>;

/*
  Honeypot predicate. The forms carry a hidden field a human never sees or fills;
  a bot that auto-fills every input trips it. A tripped honeypot makes the action
  return "success" without inserting or emailing (no signal to the bot that it
  was caught). Returns true when the field has any non-whitespace content.
*/
export function isHoneypotFilled(value: FormDataEntryValue | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}
