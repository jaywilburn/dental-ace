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
      : id === "app_course"
        ? {
            id: "app_course",
            kind: "APP_CREDIT",
            amountCents: 9900,
            quantityPriced: true,
            grants: { applicationCredits: 1 },
          }
        : null,
  clampAppCourseQty: (q: number) =>
    Number.isFinite(q) ? Math.min(Math.max(Math.trunc(q), 1), 500) : 1,
  appCourseTotalCents: (q: number) =>
    (q >= 10 ? 8500 : q >= 5 ? 9000 : q >= 2 ? 9500 : 9900) * q,
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

  it("multiplies grant and tiered price by quantity for app_course", async () => {
    tx.billingTransaction.create.mockResolvedValue({});
    tx.$executeRaw.mockResolvedValue(undefined);
    tx.company.update.mockResolvedValue({});
    const out = await handleCheckoutCompleted({
      stripeEventId: "evt_qty",
      stripePaymentId: "pi_qty",
      skuId: "app_course",
      companyId: "company-1",
      quantity: 5,
    });
    expect(out).toMatchObject({ ok: true, status: "applied" });
    expect(tx.billingTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        quantity: 5,
        amountCents: 45_000, // 5 courses at the $90 tier
        isExpedited: false,
      }),
    });
    expect(tx.company.update).toHaveBeenCalledWith({
      where: { id: "company-1" },
      data: { applicationCredits: { increment: 5 } },
    });
  });

  it("clamps an absurd quantity instead of minting unlimited credits", async () => {
    tx.billingTransaction.create.mockResolvedValue({});
    tx.$executeRaw.mockResolvedValue(undefined);
    tx.company.update.mockResolvedValue({});
    await handleCheckoutCompleted({
      stripeEventId: "evt_clamp",
      skuId: "app_course",
      companyId: "company-1",
      quantity: 1_000_000,
    });
    expect(tx.company.update).toHaveBeenCalledWith({
      where: { id: "company-1" },
      data: { applicationCredits: { increment: 500 } },
    });
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
