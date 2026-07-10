import { describe, it, expect } from "vitest";
import {
  isHoneypotFilled,
  marketingLeadSchema,
  MARKETING_LEAD_RETURN_PATH,
} from "@/lib/leads/schema";

/*
  Boundary tests for the marketing lead-capture forms. The submitMarketingLead
  server action pulls in next/headers, prisma, and the email sender, so its
  validation contract lives in lib/leads/schema.ts (mirrors register-schema.ts)
  and is unit-tested here: the Zod boundary and the honeypot predicate that
  drives the action's silent bot no-op.
*/

const valid = {
  source: "VERIFYIQ",
  contactName: "Dr. Jane Smith",
  title: "Compliance Director",
  organization: "Bright Smiles Dental Group",
  email: "jane@brightsmiles.example",
  message: "We run 12 offices across TX and NM.",
};

describe("marketingLeadSchema", () => {
  it("accepts a fully valid VerifyIQ submission", () => {
    const parsed = marketingLeadSchema.parse(valid);
    expect(parsed.source).toBe("VERIFYIQ");
    expect(parsed.contactName).toBe("Dr. Jane Smith");
    expect(parsed.organization).toBe("Bright Smiles Dental Group");
  });

  it("accepts the VERIFY source", () => {
    expect(marketingLeadSchema.parse({ ...valid, source: "VERIFY" }).source).toBe("VERIFY");
  });

  it("lowercases + trims the email and trims the name", () => {
    const parsed = marketingLeadSchema.parse({
      ...valid,
      contactName: "  Jane Smith  ",
      email: "  Jane@BrightSmiles.Example  ",
    });
    expect(parsed.contactName).toBe("Jane Smith");
    expect(parsed.email).toBe("jane@brightsmiles.example");
  });

  it("treats empty optional title / message as undefined", () => {
    const parsed = marketingLeadSchema.parse({ ...valid, title: "", message: "" });
    expect(parsed.title).toBeUndefined();
    expect(parsed.message).toBeUndefined();
  });

  it("rejects a missing contact name", () => {
    expect(marketingLeadSchema.safeParse({ ...valid, contactName: "" }).success).toBe(false);
    expect(marketingLeadSchema.safeParse({ ...valid, contactName: "   " }).success).toBe(false);
  });

  it("rejects a missing organization", () => {
    expect(marketingLeadSchema.safeParse({ ...valid, organization: "" }).success).toBe(false);
  });

  it("rejects an invalid email", () => {
    expect(marketingLeadSchema.safeParse({ ...valid, email: "not-an-email" }).success).toBe(false);
    expect(marketingLeadSchema.safeParse({ ...valid, email: "" }).success).toBe(false);
  });

  it("rejects an unknown source", () => {
    expect(marketingLeadSchema.safeParse({ ...valid, source: "MARKETING" }).success).toBe(false);
    expect(marketingLeadSchema.safeParse({ ...valid, source: "" }).success).toBe(false);
  });

  it("rejects an over-long message", () => {
    expect(
      marketingLeadSchema.safeParse({ ...valid, message: "x".repeat(2001) }).success,
    ).toBe(false);
  });
});

describe("isHoneypotFilled", () => {
  it("is false for an empty, whitespace, null, or missing value (real humans)", () => {
    expect(isHoneypotFilled("")).toBe(false);
    expect(isHoneypotFilled("   ")).toBe(false);
    expect(isHoneypotFilled(null)).toBe(false);
    expect(isHoneypotFilled(undefined)).toBe(false);
  });

  it("is true when the hidden field has content (a bot)", () => {
    expect(isHoneypotFilled("http://spam.example")).toBe(true);
    expect(isHoneypotFilled("anything")).toBe(true);
  });

  it("is false for a File value (never a human-filled honeypot string)", () => {
    const file = new File(["x"], "x.txt");
    expect(isHoneypotFilled(file)).toBe(false);
  });
});

describe("MARKETING_LEAD_RETURN_PATH", () => {
  it("maps each source back to its originating form page", () => {
    expect(MARKETING_LEAD_RETURN_PATH.VERIFYIQ).toBe("/verifyiq/contact");
    expect(MARKETING_LEAD_RETURN_PATH.VERIFY).toBe("/verify/contact");
  });
});
