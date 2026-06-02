import { z } from "zod";

/*
  Validation for the /signup/board form. State is a 2-char code matched against
  US_STATES in lib/protrack/reference. Board name is free-text — the form
  suggests the canonical name for the picked state but lets the user override.
*/
export const boardSignupSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(80),
  lastName: z.string().trim().min(1, "Last name is required").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
  state: z
    .string()
    .trim()
    .toUpperCase()
    .length(2, "Pick a state"),
  boardName: z
    .string()
    .trim()
    .min(3, "Board name is required")
    .max(160),
});

export type BoardSignupInput = z.infer<typeof boardSignupSchema>;
