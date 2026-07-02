import { describe, it, expect } from "vitest";
import { evaluateDeletable, type DeletionFacts } from "@/lib/admin/deletion-rules";

const CLEAN: DeletionFacts = {
  isSelf: false,
  isLastActiveAdmin: false,
  hasPerformedAdminActions: false,
  hasInitiatedAudits: false,
  isUnderAudit: false,
  hasProSubscription: false,
  hasCeCertificates: false,
  companyHasActivity: false,
};

describe("evaluateDeletable", () => {
  it("allows a clean account", () => {
    expect(evaluateDeletable(CLEAN)).toEqual({ deletable: true });
  });

  it("blocks self-deletion first", () => {
    const r = evaluateDeletable({ ...CLEAN, isSelf: true, hasCeCertificates: true });
    expect(r).toEqual({ deletable: false, reason: "You can't delete your own account." });
  });

  it("blocks the last active admin", () => {
    const r = evaluateDeletable({ ...CLEAN, isLastActiveAdmin: true });
    expect(r.deletable).toBe(false);
    if (!r.deletable) expect(r.reason).toContain("last active admin");
  });

  it("blocks an account that performed admin actions, suggesting suspend", () => {
    const r = evaluateDeletable({ ...CLEAN, hasPerformedAdminActions: true });
    expect(r).toEqual({
      deletable: false,
      reason: "This account has performed admin actions. Suspend it instead.",
    });
  });

  it("blocks on initiated audits", () => {
    expect(evaluateDeletable({ ...CLEAN, hasInitiatedAudits: true })).toEqual({
      deletable: false,
      reason: "This account has initiated audits. Suspend it instead.",
    });
  });

  it("blocks an account under audit", () => {
    expect(evaluateDeletable({ ...CLEAN, isUnderAudit: true })).toEqual({
      deletable: false,
      reason: "This account appears in an audit. Suspend it instead.",
    });
  });

  it("blocks an account with an active subscription", () => {
    expect(evaluateDeletable({ ...CLEAN, hasProSubscription: true })).toEqual({
      deletable: false,
      reason: "This account has an active subscription. Suspend it instead.",
    });
  });

  it("blocks an account with CE records", () => {
    expect(evaluateDeletable({ ...CLEAN, hasCeCertificates: true })).toEqual({
      deletable: false,
      reason: "This account has CE records. Suspend it instead.",
    });
  });

  it("blocks an account whose company has activity", () => {
    expect(evaluateDeletable({ ...CLEAN, companyHasActivity: true })).toEqual({
      deletable: false,
      reason: "This company has accreditation or billing activity. Suspend it instead.",
    });
  });

  it("prefers the self reason over compliance reasons", () => {
    const r = evaluateDeletable({ ...CLEAN, isSelf: true, hasProSubscription: true });
    if (!r.deletable) expect(r.reason).toBe("You can't delete your own account.");
  });
});
