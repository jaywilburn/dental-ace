import { describe, it, expect } from "vitest";
import { companyNameLockKey } from "@/lib/company/register-core";
import { stateLockKey } from "@/lib/auth/grants";

describe("grant lock keys", () => {
  it("company name lock key is case/space-insensitive", () => {
    expect(companyNameLockKey("Texas Dental")).toBe(companyNameLockKey("  texas dental "));
  });
  it("different names produce different keys", () => {
    expect(companyNameLockKey("Alpha")).not.toBe(companyNameLockKey("Beta"));
  });
  it("state lock key is stable and distinct per state", () => {
    expect(stateLockKey("TX")).toBe(stateLockKey("TX"));
    expect(stateLockKey("TX")).not.toBe(stateLockKey("CA"));
  });
});
