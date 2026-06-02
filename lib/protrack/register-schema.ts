import { z } from "zod";
import { LicenseType } from "@prisma/client";

/*
  Validation for the public platform sign-up form. Name/email/password are
  required; the ProTrack license fields are optional (a non-licensee can sign
  up too). The route validates the license trio together and ignores partial
  input. Shared by the route handler and kept framework-agnostic.
*/
export const registerSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(80),
  lastName: z.string().trim().min(1, "Last name is required").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
  licenseType: z
    .enum([LicenseType.RDH, LicenseType.DDS_DMD, LicenseType.DA])
    .optional(),
  primaryState: z.string().trim().toUpperCase().optional(),
  licenseNumber: z.string().trim().max(60).optional(),
  inviteCode: z.string().trim().max(60).optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
