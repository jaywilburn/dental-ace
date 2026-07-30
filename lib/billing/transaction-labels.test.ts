import { describe, it, expect } from "vitest";
import { txnLabel, txnUnit, txnQuantityText } from "@/lib/billing/transaction-labels";

describe("txnLabel", () => {
  it("names which balance an admin adjustment touched", () => {
    expect(txnLabel("ADMIN_OVERRIDE_APP_CREDITS")).toBe("Admin adjustment (application credits)");
    expect(txnLabel("ADMIN_OVERRIDE_CERTS")).toBe("Admin adjustment (certificates)");
  });

  // The 28 pre-2026-07-29 rows genuinely do not record which balance moved.
  it("labels legacy rows generically rather than guessing", () => {
    expect(txnLabel("ADMIN_OVERRIDE")).toBe("Admin adjustment");
  });

  it("labels purchases", () => {
    expect(txnLabel("APP_CREDIT")).toBe("Application credits");
    expect(txnLabel("CERT_BUNDLE")).toBe("Certificate bundle");
  });

  it("falls back to the raw value for an unknown type", () => {
    expect(txnLabel("SOMETHING_NEW")).toBe("SOMETHING_NEW");
  });
});

describe("txnUnit", () => {
  it("maps both credit types to credits and both cert types to certificates", () => {
    expect(txnUnit("APP_CREDIT")).toBe("credit");
    expect(txnUnit("ADMIN_OVERRIDE_APP_CREDITS")).toBe("credit");
    expect(txnUnit("CERT_BUNDLE")).toBe("certificate");
    expect(txnUnit("ADMIN_OVERRIDE_CERTS")).toBe("certificate");
  });
});

describe("txnQuantityText", () => {
  it("pluralizes", () => {
    expect(txnQuantityText("CERT_BUNDLE", 50)).toBe("50 certificates");
    expect(txnQuantityText("APP_CREDIT", 1)).toBe("1 credit");
  });

  it("reads as a removal when the admin took the balance back", () => {
    expect(txnQuantityText("ADMIN_OVERRIDE_APP_CREDITS", -155)).toBe("155 credits removed");
    expect(txnQuantityText("ADMIN_OVERRIDE_CERTS", -1)).toBe("1 certificate removed");
  });
});
