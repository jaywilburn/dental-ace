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

  describe("Canadian postal codes", () => {
    const calgary = { ...valid, city: "Calgary", state: "AB", zip: "T2P 2V8" };

    it("accepts a Canadian postal code for a province", () => {
      expect(companyRegisterSchema.parse(calgary).zip).toBe("T2P 2V8");
    });

    it("normalizes spacing, hyphens and case to A1A 1A1", () => {
      for (const zip of ["t2p2v8", "T2P2V8", "t2p-2v8", "  T2P 2V8  "]) {
        expect(companyRegisterSchema.parse({ ...calgary, zip }).zip).toBe("T2P 2V8");
      }
    });

    it("is idempotent, so a stored payload re-validates at approval", () => {
      const once = companyRegisterSchema.parse({ ...calgary, zip: "t2p2v8" });
      expect(companyRegisterSchema.parse(once)).toEqual(once);
    });

    it("rejects a malformed postal code for a province", () => {
      for (const zip of ["T2P", "T2P 2V", "2TP V28", "T2P 2V8X", "TTP 2V8", ""]) {
        expect(companyRegisterSchema.safeParse({ ...calgary, zip }).success).toBe(false);
      }
    });

    it("rejects a US ZIP for a province, with a postal-code message", () => {
      const r = companyRegisterSchema.safeParse({ ...calgary, zip: "78704" });
      expect(r.success).toBe(false);
      expect(r.error?.issues[0]?.path).toEqual(["zip"]);
      expect(r.error?.issues[0]?.message).toMatch(/postal code/i);
    });

    it("rejects a Canadian postal code for a US state, with a ZIP message", () => {
      const r = companyRegisterSchema.safeParse({ ...valid, zip: "T2P 2V8" });
      expect(r.success).toBe(false);
      expect(r.error?.issues[0]?.path).toEqual(["zip"]);
      expect(r.error?.issues[0]?.message).toMatch(/ZIP code/);
    });
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
