import { describe, it, expect } from "vitest";
import { landingPathFor } from "@/lib/auth/session";

const base = { staffRole: "NONE" as const, companyId: null as string | null, verifyAccess: false };

describe("landingPathFor", () => {
  it("sends an admin to /admin (highest priority)", () => {
    expect(landingPathFor({ ...base, staffRole: "ADMIN", companyId: "c1", verifyAccess: true })).toBe("/admin");
  });
  it("sends a reviewer to /reviewer", () => {
    expect(landingPathFor({ ...base, staffRole: "REVIEWER" })).toBe("/reviewer");
  });
  it("sends a company member to /company", () => {
    expect(landingPathFor({ ...base, companyId: "c1" })).toBe("/company");
  });
  it("sends a verify user to /board", () => {
    expect(landingPathFor({ ...base, verifyAccess: true })).toBe("/board");
  });
  it("falls back to /home for a plain ProTrack account", () => {
    expect(landingPathFor(base)).toBe("/home");
  });
  it("prefers company over board when both present", () => {
    expect(landingPathFor({ ...base, companyId: "c1", verifyAccess: true })).toBe("/company");
  });
});
