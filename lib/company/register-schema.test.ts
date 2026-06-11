import { describe, it, expect } from "vitest";
import { companyRegisterSchema } from "@/lib/company/register-schema";

const valid = {
  name: "Texas Dental Association",
  contactEmail: "info@tda.org",
  contactPhone: "(512) 555-0100",
  addressLine1: "1946 S IH-35 Frontage Rd",
  addressLine2: "Suite 400",
  city: "Austin",
  state: "TX",
  zip: "78704",
};

describe("companyRegisterSchema", () => {
  it("accepts a fully valid form", () => {
    const parsed = companyRegisterSchema.parse(valid);
    expect(parsed.name).toBe("Texas Dental Association");
    expect(parsed.state).toBe("TX");
  });

  it("accepts ZIP+4", () => {
    expect(
      companyRegisterSchema.parse({ ...valid, zip: "78704-1234" }).zip,
    ).toBe("78704-1234");
  });

  it("lowercases the contact email and trims the name", () => {
    const parsed = companyRegisterSchema.parse({
      ...valid,
      name: "  Texas Dental Association  ",
      contactEmail: "Info@TDA.org",
    });
    expect(parsed.name).toBe("Texas Dental Association");
    expect(parsed.contactEmail).toBe("info@tda.org");
  });

  it("uppercases the state code", () => {
    expect(companyRegisterSchema.parse({ ...valid, state: "tx" }).state).toBe("TX");
  });

  it("treats empty optional fields as undefined", () => {
    const parsed = companyRegisterSchema.parse({
      ...valid,
      contactPhone: "",
      addressLine2: "",
    });
    expect(parsed.contactPhone).toBeUndefined();
    expect(parsed.addressLine2).toBeUndefined();
  });

  it("rejects a too-short name", () => {
    expect(companyRegisterSchema.safeParse({ ...valid, name: "A" }).success).toBe(false);
  });

  it("rejects a bad email", () => {
    expect(
      companyRegisterSchema.safeParse({ ...valid, contactEmail: "not-an-email" }).success,
    ).toBe(false);
  });

  it("rejects a non-US state code", () => {
    expect(companyRegisterSchema.safeParse({ ...valid, state: "ZZ" }).success).toBe(false);
    expect(companyRegisterSchema.safeParse({ ...valid, state: "Texas" }).success).toBe(false);
  });

  it("rejects bad ZIP codes", () => {
    for (const zip of ["1234", "123456", "78704-12", "abcde", ""]) {
      expect(companyRegisterSchema.safeParse({ ...valid, zip }).success).toBe(false);
    }
  });

  it("rejects a missing street address", () => {
    expect(
      companyRegisterSchema.safeParse({ ...valid, addressLine1: "ab" }).success,
    ).toBe(false);
  });

  it("rejects a missing city", () => {
    expect(companyRegisterSchema.safeParse({ ...valid, city: "A" }).success).toBe(false);
  });
});
