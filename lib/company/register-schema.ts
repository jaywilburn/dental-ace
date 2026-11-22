import { z } from "zod";
import { CA_PROVINCES, JURISDICTIONS } from "@/lib/protrack/reference";

/*
  Validation for the /company/register form (self-serve CE provider sign-up).
  Name + contact info only; the company starts with zero credits, so the
  existing credit gate is the real barrier to submitting applications.
*/

export const ZIP_RE = /^\d{5}(-\d{4})?$/;

/*
  Canadian postal code: letter-digit-letter, then digit-letter-digit, with an
  optional space or hyphen between the halves. Deliberately shape-only (no
  Canada Post letter exclusions): the address is contact info, not a mailing
  validator, and a too-clever rule would lock out a real provider again.
*/
export const CA_POSTAL_RE = /^[A-Z]\d[A-Z][ -]?\d[A-Z]\d$/;

/*
  Exported on its own because the admin rename action validates a bare name
  against the same rule. The full schema below is refined and transformed, so
  it has no `.shape` to reach into.
*/
export const companyNameSchema = z
  .string()
  .trim()
  .min(2, "Organization name must be at least 2 characters")
  .max(200, "Organization name must be 200 characters or fewer");

/*
  The `zip` column holds either a US ZIP or a Canadian postal code. Which
  format applies follows the selected state/province, so a province paired
  with a ZIP (or a state with a postal code) is rejected as a mismatch.
*/
export const companyRegisterSchema = z
  .object({
    name: companyNameSchema,
    contactEmail: z
      .string()
      .trim()
      .toLowerCase()
      .email("Enter a valid contact email address")
      .max(200),
    contactPhone: z
      .string()
      .trim()
      .max(40, "Phone number must be 40 characters or fewer")
      .optional()
      .transform((v) => (v ? v : undefined)),
    addressLine1: z
      .string()
      .trim()
      .min(3, "Street address is required")
      .max(200),
    addressLine2: z
      .string()
      .trim()
      .max(200)
      .optional()
      .transform((v) => (v ? v : undefined)),
    city: z.string().trim().min(2, "City is required").max(100),
    state: z
      .string()
      .trim()
      .toUpperCase()
      .length(2, "Pick a state or province")
      .refine((code) => Boolean(JURISDICTIONS[code]), "Pick a valid state or province"),
    zip: z
      .string()
      .trim()
      .toUpperCase()
      .min(1, "Enter a ZIP or postal code")
      .max(10, "Enter a valid ZIP or postal code"),
  })
  .superRefine((data, ctx) => {
    // An unknown state already has its own issue; don't guess a format for it.
    if (!JURISDICTIONS[data.state] || !data.zip) return;
    if (CA_PROVINCES[data.state]) {
      if (!CA_POSTAL_RE.test(data.zip)) {
        ctx.addIssue({
          code: "custom",
          path: ["zip"],
          message: "Enter a valid Canadian postal code (A1A 1A1)",
        });
      }
    } else if (!ZIP_RE.test(data.zip)) {
      ctx.addIssue({
        code: "custom",
        path: ["zip"],
        message: "Enter a valid ZIP code (12345 or 12345-6789)",
      });
    }
  })
  .transform((data) =>
    // Store postal codes in the canonical "A1A 1A1" form. Idempotent, because
    // this schema re-validates the stored payload at admin approval.
    CA_PROVINCES[data.state]
      ? { ...data, zip: data.zip.replace(/[ -]/g, "").replace(/^(.{3})/, "$1 ") }
      : data,
  );

export type CompanyRegisterInput = z.infer<typeof companyRegisterSchema>;
