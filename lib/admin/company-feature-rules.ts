import { z } from "zod";

/*
  Pure validation + labels for the admin per-company feature toggles. No DB,
  no server-only: unit-tested directly (mirrors company-rename-rules.ts). The
  server action (company-features.ts) applies the parsed result under the
  company row lock.

  `feature` is the Prisma field name on Company, so the action can write it
  directly; the enum is the allowlist, so a tampered form can never name any
  other column.
*/

export const COMPANY_FEATURES = ["surveyEnabled", "attendanceCodesEnabled"] as const;
export type CompanyFeature = (typeof COMPANY_FEATURES)[number];

/** Noun used in the admin card, the success message and the audit summary. */
export const COMPANY_FEATURE_LABEL: Record<CompanyFeature, string> = {
  surveyEnabled: "event surveys",
  attendanceCodesEnabled: "attendance codes",
};

export const companyFeatureFormSchema = z.object({
  companyId: z.string().uuid(),
  feature: z.enum(COMPANY_FEATURES),
  // Posted by a hidden input as the TARGET state, so a double submit (or a
  // stale tab) is a no-op rather than a flip back.
  enabled: z.enum(["true", "false"]).transform((v) => v === "true"),
});
export type CompanyFeatureForm = z.infer<typeof companyFeatureFormSchema>;

export function parseCompanyFeatureForm(input: {
  companyId: unknown;
  feature: unknown;
  enabled: unknown;
}): CompanyFeatureForm | null {
  const parsed = companyFeatureFormSchema.safeParse(input);
  return parsed.success ? parsed.data : null;
}

/** Audit-log summary line, e.g. 'Turned on event surveys for "AADB"'. */
export function companyFeatureSummary(
  feature: CompanyFeature,
  enabled: boolean,
  companyName: string,
): string {
  return `Turned ${enabled ? "on" : "off"} ${COMPANY_FEATURE_LABEL[feature]} for "${companyName}"`;
}
