import { describe, it, expect } from "vitest";
import { isValidSignupRole } from "@/lib/auth/signup-role";

describe("isValidSignupRole", () => {
  it("accepts the three declared roles", () => {
    expect(isValidSignupRole("individual")).toBe(true);
    expect(isValidSignupRole("company")).toBe(true);
    expect(isValidSignupRole("staff")).toBe(true);
  });

  it("rejects an unknown role", () => {
    expect(isValidSignupRole("admin")).toBe(false);
    expect(isValidSignupRole("reviewer")).toBe(false);
    expect(isValidSignupRole("")).toBe(false);
  });

  it("rejects a missing value (absent / invalid ?as=)", () => {
    expect(isValidSignupRole(undefined)).toBe(false);
    expect(isValidSignupRole(null)).toBe(false);
  });
});
