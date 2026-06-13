import { describe, it, expect } from "vitest";
import { validateRequestPayload, roleLabelFor } from "@/lib/auth/access-requests";

describe("validateRequestPayload", () => {
  it("accepts a COMPANY payload and returns a label", () => {
    const r = validateRequestPayload("COMPANY", {
      name: "Bright Smiles", contactEmail: "a@b.com", addressLine1: "1 St",
      city: "Austin", state: "TX", zip: "78701",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.label).toBe("Bright Smiles");
  });
  it("rejects a COMPANY payload with a bad zip", () => {
    const r = validateRequestPayload("COMPANY", { name: "X", contactEmail: "a@b.com", addressLine1: "1", city: "Y", state: "TX", zip: "bad" });
    expect(r.ok).toBe(false);
  });
  it("accepts a BOARD payload", () => {
    const r = validateRequestPayload("BOARD", { state: "TX", boardName: "Texas Board of Dental Examiners" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.label).toContain("Texas");
  });
  it("accepts a REVIEWER payload (empty)", () => {
    const r = validateRequestPayload("REVIEWER", {});
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.label).toBe("AADB Reviewer");
  });
  it("roleLabelFor is human-readable", () => {
    expect(roleLabelFor("COMPANY")).toBe("CE Company");
    expect(roleLabelFor("BOARD")).toBe("State Board");
    expect(roleLabelFor("REVIEWER")).toBe("AADB Reviewer");
    expect(roleLabelFor("ADMIN")).toBe("AADB Admin");
  });
});
