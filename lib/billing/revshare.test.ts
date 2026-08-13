import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  REVSHARE_PERCENT,
  revshareAmountCents,
  revshareAccountId,
  maybeCreateRevshareTransfer,
  type RevshareStripe,
} from "@/lib/billing/revshare";

const ACCT = "acct_test_jsm";

function stubStripe(existing: Array<{ id: string }> = []) {
  const list = vi.fn().mockResolvedValue({ data: existing });
  const create = vi.fn().mockResolvedValue({ id: "tr_new" });
  const stripe: RevshareStripe = { transfers: { list, create } };
  return { stripe, list, create };
}

const input = {
  stripeEventId: "evt_1",
  sourceId: "cs_test_1",
  grossCents: 9900,
  currency: "usd",
  chargeId: "ch_1",
  description: "test transfer",
};

describe("revshareAmountCents", () => {
  it("is 75% of gross", () => {
    expect(REVSHARE_PERCENT).toBe(75);
    expect(revshareAmountCents(9900)).toBe(7425);
    expect(revshareAmountCents(25000)).toBe(18750);
  });

  it("rounds to the nearest cent", () => {
    // 101 * 0.75 = 75.75 -> 76
    expect(revshareAmountCents(101)).toBe(76);
    // 102 * 0.75 = 76.5 -> 77 (Math.round half-up)
    expect(revshareAmountCents(102)).toBe(77);
  });

  it("returns 0 for zero, negative, or non-finite gross", () => {
    expect(revshareAmountCents(0)).toBe(0);
    expect(revshareAmountCents(-500)).toBe(0);
    expect(revshareAmountCents(Number.NaN)).toBe(0);
  });
});

describe("maybeCreateRevshareTransfer", () => {
  beforeEach(() => {
    vi.stubEnv("STRIPE_CONNECT_REVSHARE_ACCOUNT_ID", ACCT);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("skips without touching Stripe when the account id is unset", async () => {
    vi.stubEnv("STRIPE_CONNECT_REVSHARE_ACCOUNT_ID", "");
    expect(revshareAccountId()).toBeNull();
    const { stripe, list, create } = stubStripe();
    const outcome = await maybeCreateRevshareTransfer(stripe, input);
    expect(outcome).toEqual({ status: "skipped", reason: "no_account" });
    expect(list).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("skips zero-amount payments before listing", async () => {
    const { stripe, list, create } = stubStripe();
    const outcome = await maybeCreateRevshareTransfer(stripe, {
      ...input,
      grossCents: 0,
    });
    expect(outcome).toEqual({ status: "skipped", reason: "zero_amount" });
    expect(list).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("does not create a second transfer for the same source", async () => {
    const { stripe, list, create } = stubStripe([{ id: "tr_existing" }]);
    const outcome = await maybeCreateRevshareTransfer(stripe, input);
    expect(outcome).toEqual({ status: "exists", transferId: "tr_existing" });
    expect(list).toHaveBeenCalledWith({ transfer_group: "cs_test_1", limit: 1 });
    expect(create).not.toHaveBeenCalled();
  });

  it("creates a 75% transfer pinned to the charge", async () => {
    const { stripe, create } = stubStripe();
    const outcome = await maybeCreateRevshareTransfer(stripe, input);
    expect(outcome).toEqual({
      status: "created",
      transferId: "tr_new",
      amountCents: 7425,
    });
    expect(create).toHaveBeenCalledWith({
      amount: 7425,
      currency: "usd",
      destination: ACCT,
      source_transaction: "ch_1",
      transfer_group: "cs_test_1",
      description: "test transfer",
      metadata: {
        stripe_event_id: "evt_1",
        revshare_percent: "75",
        gross_cents: "9900",
      },
    });
  });

  it("propagates Stripe errors so the webhook can 500 and retry", async () => {
    const { stripe, create } = stubStripe();
    create.mockRejectedValue(new Error("insufficient capability"));
    await expect(maybeCreateRevshareTransfer(stripe, input)).rejects.toThrow(
      "insufficient capability",
    );
  });
});
