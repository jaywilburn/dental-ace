import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import {
  companyNameLockKey,
  isUniqueNameViolation,
  DUPLICATE_COMPANY_MESSAGE,
} from "@/lib/company/register-core";

describe("companyNameLockKey", () => {
  it("is stable for the same name", () => {
    expect(companyNameLockKey("Texas Dental Association")).toBe(
      companyNameLockKey("Texas Dental Association"),
    );
  });

  it("is case- and whitespace-insensitive so racing variants serialize", () => {
    const base = companyNameLockKey("Texas Dental Association");
    expect(companyNameLockKey("  TEXAS DENTAL ASSOCIATION  ")).toBe(base);
    expect(companyNameLockKey("texas dental association")).toBe(base);
  });

  it("differs for different names", () => {
    expect(companyNameLockKey("Texas Dental Association")).not.toBe(
      companyNameLockKey("California Dental Association"),
    );
  });

  it("returns a bigint (Postgres advisory lock key)", () => {
    expect(typeof companyNameLockKey("Anything")).toBe("bigint");
  });
});

describe("isUniqueNameViolation", () => {
  function p2002(target: unknown) {
    return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
      code: "P2002",
      clientVersion: "test",
      meta: { target },
    });
  }

  it("matches a P2002 on the name column", () => {
    expect(isUniqueNameViolation(p2002(["name"]))).toBe(true);
  });

  it("matches a P2002 without a parsable target (conservative)", () => {
    expect(isUniqueNameViolation(p2002(undefined))).toBe(true);
  });

  it("ignores a P2002 on a different column", () => {
    expect(isUniqueNameViolation(p2002(["stripe_customer_id"]))).toBe(false);
  });

  it("ignores other Prisma errors and plain errors", () => {
    const other = new Prisma.PrismaClientKnownRequestError("Not found", {
      code: "P2025",
      clientVersion: "test",
    });
    expect(isUniqueNameViolation(other)).toBe(false);
    expect(isUniqueNameViolation(new Error("boom"))).toBe(false);
    expect(isUniqueNameViolation(null)).toBe(false);
  });
});

describe("DUPLICATE_COMPANY_MESSAGE", () => {
  it("points the user at AADB and contains no em dashes", () => {
    expect(DUPLICATE_COMPANY_MESSAGE).toContain("info@dentalace.org");
    expect(DUPLICATE_COMPANY_MESSAGE).not.toContain("—");
  });
});
