import { z } from "zod";
import { LicenseType } from "@prisma/client";

/*
  Zod schema for the runAudit input. Lives in its own file so the action
  module (lib/board/audits/run.ts, "use server") can stay async-functions-only,
  per Next 16's rule for server-action modules.
*/

export const SAMPLE_PERCENTS = [10, 15, 20, 25] as const;

export const runAuditSchema = z.object({
  samplePercent: z.coerce
    .number()
    .int()
    .refine((n) => (SAMPLE_PERCENTS as readonly number[]).includes(n), {
      message: "Sample must be 10, 15, 20, or 25",
    }),
  licenseType: z
    .enum([LicenseType.DDS_DMD, LicenseType.RDH, LicenseType.DA, "ALL"])
    .default("ALL"),
  renewalCycle: z.string().trim().min(1).max(40),
  name: z.string().trim().min(3, "Audit name is required").max(120),
});

export type RunAuditInput = z.infer<typeof runAuditSchema>;
