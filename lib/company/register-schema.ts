import { z } from "zod";
import { US_STATES } from "@/lib/protrack/reference";

/*
  Validation for the /company/register form (self-serve CE provider sign-up).
  Name + contact info only; the company starts with zero credits, so the
  existing credit gate is the real barrier to submitting applications.
*/

export const ZIP_RE = /^\d{5}(-\d{4})?$/;

export const companyRegisterSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Organization name must be at least 2 characters")
    .max(200, "Organization name must be 200 characters or fewer"),
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
    .length(2, "Pick a state")
    .refine((code) => Boolean(US_STATES[code]), "Pick a valid US state"),
  zip: z
    .string()
    .trim()
    .regex(ZIP_RE, "Enter a valid ZIP code (12345 or 12345-6789)"),
});

export type CompanyRegisterInput = z.infer<typeof companyRegisterSchema>;
