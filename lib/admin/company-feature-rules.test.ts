import { describe, it, expect } from "vitest";
import {
  COMPANY_FEATURES,
  companyFeatureSummary,
  parseCompanyFeatureForm,
} from "@/lib/admin/company-feature-rules";

const COMPANY = "5425fb59-0000-4000-8000-000000000001";

describe("parseCompanyFeatureForm", () => {
  it("parses each feature with the target state as a boolean", () => {
    for (const feature of COMPANY_FEATURES) {
      expect(parseCompanyFeatureForm({ companyId: COMPANY, feature, enabled: "true" })).toEqual({
        companyId: COMPANY,
        feature,
        enabled: true,
      });
      expect(parseCompanyFeatureForm({ companyId: COMPANY, feature, enabled: "false" })?.enabled).toBe(false);
    }
  });

  it("rejects a feature outside the allowlist", () => {
    for (const feature of ["certBalance", "applicationCredits", "name", "", null]) {
      expect(parseCompanyFeatureForm({ companyId: COMPANY, feature, enabled: "true" })).toBeNull();
    }
  });

  it("rejects anything but the literal strings true/false", () => {
    for (const enabled of ["on", "1", "", null, true]) {
      expect(parseCompanyFeatureForm({ companyId: COMPANY, feature: "surveyEnabled", enabled })).toBeNull();
    }
  });

  it("rejects a malformed company id", () => {
    expect(
      parseCompanyFeatureForm({ companyId: "not-a-uuid", feature: "surveyEnabled", enabled: "true" }),
    ).toBeNull();
    expect(parseCompanyFeatureForm({ companyId: null, feature: "surveyEnabled", enabled: "true" })).toBeNull();
  });
});

describe("companyFeatureSummary", () => {
  it("names the feature, direction and company", () => {
    expect(companyFeatureSummary("surveyEnabled", true, "AADB")).toBe('Turned on event surveys for "AADB"');
    expect(companyFeatureSummary("attendanceCodesEnabled", false, "AADB")).toBe(
      'Turned off attendance codes for "AADB"',
    );
  });
});
