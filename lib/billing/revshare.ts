import "server-only";

/*
  Platform revenue share: 75% of every gross charge moves to John Stamper
  Media's Stripe Connect account; AADB keeps 25% on the master account and
  absorbs Stripe processing fees out of its share. Applies to ALL platform
  revenue (company SKUs and ProTrack Pro subscriptions). Documented as an SOW
  deviation in CLAUDE.md (supersedes the 75/25 CE Exchange split); confirmed
  by the client 2026-08-05.

  Duplicate protection is stateless and two-layered:
  - before creating, list transfers by transfer_group (the checkout-session or
    invoice id) and skip if one already exists;
  - every transfer is pinned to its charge via source_transaction, so Stripe
    itself rejects any transfer that would move more than the charge amount.
  Deliberately no Stripe idempotency keys: Stripe caches error responses per
  key for 24h, which would keep replaying a transient failure (e.g. Connect
  capability not yet active) across webhook retries even after it is fixed.

  Only the real webhook creates transfers. Mock mode never reaches this code.
*/

export const REVSHARE_PERCENT = 75;

/** 75% of the gross charge, rounded to the nearest cent. */
export function revshareAmountCents(grossCents: number): number {
  if (!Number.isFinite(grossCents) || grossCents <= 0) return 0;
  return Math.round((grossCents * REVSHARE_PERCENT) / 100);
}

/** Connected account that receives the share; null until onboarding is done. */
export function revshareAccountId(): string | null {
  const id = process.env.STRIPE_CONNECT_REVSHARE_ACCOUNT_ID?.trim();
  return id ? id : null;
}

/** Minimal slice of the Stripe SDK the transfer flow touches (stub-friendly). */
export type RevshareStripe = {
  transfers: {
    list(params: {
      transfer_group: string;
      limit?: number;
    }): Promise<{ data: Array<{ id: string }> }>;
    create(params: {
      amount: number;
      currency: string;
      destination: string;
      source_transaction: string;
      transfer_group: string;
      description: string;
      metadata: Record<string, string>;
    }): Promise<{ id: string }>;
  };
};

export type RevshareInput = {
  /** Webhook event id, recorded in transfer metadata for tracing. */
  stripeEventId: string;
  /** Checkout-session or invoice id; doubles as the transfer_group dedupe key. */
  sourceId: string;
  /** Gross amount the customer paid, in cents. */
  grossCents: number;
  currency: string;
  /** Charge backing the payment; the transfer is pinned to it. */
  chargeId: string;
  description: string;
};

export type RevshareOutcome =
  | { status: "created"; transferId: string; amountCents: number }
  | { status: "exists"; transferId: string }
  | { status: "skipped"; reason: "no_account" | "zero_amount" };

export async function maybeCreateRevshareTransfer(
  stripe: RevshareStripe,
  input: RevshareInput,
): Promise<RevshareOutcome> {
  const destination = revshareAccountId();
  if (!destination) return { status: "skipped", reason: "no_account" };

  const amount = revshareAmountCents(input.grossCents);
  if (amount <= 0) return { status: "skipped", reason: "zero_amount" };

  const existing = await stripe.transfers.list({
    transfer_group: input.sourceId,
    limit: 1,
  });
  if (existing.data.length > 0) {
    return { status: "exists", transferId: existing.data[0].id };
  }

  const transfer = await stripe.transfers.create({
    amount,
    currency: input.currency,
    destination,
    source_transaction: input.chargeId,
    transfer_group: input.sourceId,
    description: input.description,
    metadata: {
      stripe_event_id: input.stripeEventId,
      revshare_percent: String(REVSHARE_PERCENT),
      gross_cents: String(input.grossCents),
    },
  });
  return { status: "created", transferId: transfer.id, amountCents: amount };
}
