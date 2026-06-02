import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @prisma/client before importing the module under test so BillingTransactionType
// resolves without a real DB connection. The real enum values are strings at runtime.
vi.mock("@prisma/client", () => ({
  BillingTransactionType: {
    CERT_BUNDLE: "CERT_BUNDLE",
    APP_CREDIT: "APP_CREDIT",
  },
}));

const company = { findUnique: vi.fn() };
const tx = {
  billingTransaction: { create: vi.fn() },
  company: { update: vi.fn() },
  $executeRaw: vi.fn(),
};
const $transaction = vi.fn(async (cb: (t: typeof tx) => Promise<void>) => cb(tx));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    company: { findUnique: (...a: unknown[]) => company.findUnique(...a) },
    $transaction: (...a: unknown[]) => $transaction(...(a as [never])),
  },
}));

vi.mock("@/lib/billing/catalog", () => ({
  getSku: (id: string) =>
    id === "cert_50"
      ? { id: "cert_50", kind: "CERT_BUNDLE", amountCents: 25000, grants: { certBalance: 50 } }
      : null,
}));

import { handleCheckoutCompleted } from "@/lib/billing/webhook-core";

describe("handleCheckoutCompleted idempotency", () => {
  beforeEach(() => {
    company.findUnique.mockReset();
    tx.billingTransaction.create.mockReset();
    tx.company.update.mockReset();
    tx.$executeRaw.mockReset();
    $transaction.mockClear();
    company.findUnique.mockResolvedValue({ id: "company-1" });
  });

  it("applies the grant exactly once on first delivery", async () => {
    tx.billingTransaction.create.mockResolvedValue({});
    tx.$executeRaw.mockResolvedValue(undefined);
    tx.company.update.mockResolvedValue({});
    const out = await handleCheckoutCompleted({
      stripeEventId: "evt_1",
      stripePaymentId: "pi_1",
      skuId: "cert_50",
      companyId: "company-1",
    });
    expect(out).toMatchObject({ ok: true, status: "applied" });
    expect(tx.company.update).toHaveBeenCalledWith({
      where: { id: "company-1" },
      data: { certBalance: { increment: 50 } },
    });
  });

  it("does not increment on a duplicate event", async () => {
    tx.billingTransaction.create.mockRejectedValue({
      code: "P2002",
      meta: { target: ["stripe_event_id"] },
    });
    const out = await handleCheckoutCompleted({
      stripeEventId: "evt_1",
      skuId: "cert_50",
      companyId: "company-1",
    });
    expect(out).toEqual({ ok: true, status: "duplicate" });
    expect(tx.company.update).not.toHaveBeenCalled();
  });

  it("rejects an unknown SKU before any DB work", async () => {
    const out = await handleCheckoutCompleted({
      stripeEventId: "evt_2",
      skuId: "nope",
      companyId: "company-1",
    });
    expect(out).toMatchObject({ ok: false, status: "unknown_sku" });
    expect($transaction).not.toHaveBeenCalled();
  });
});
