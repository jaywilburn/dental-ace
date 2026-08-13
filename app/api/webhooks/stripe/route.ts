import { NextResponse, type NextRequest } from "next/server";
import Stripe from "stripe";
import { SubscriptionInterval, SubscriptionStatus } from "@prisma/client";
import { isMockMode } from "@/lib/billing/checkout-mode";
import { handleCheckoutCompleted } from "@/lib/billing/webhook-core";
import {
  syncProSubscription,
  cancelProSubscriptionBySubId,
} from "@/lib/billing/pro-webhook-core";
import {
  maybeCreateRevshareTransfer,
  type RevshareOutcome,
} from "@/lib/billing/revshare";

/*
  Real Stripe webhook. Active once STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET are
  set; until then the app runs in mock mode and this returns 503 (the in-app
  mock flows exercise the same shared handlers in-process).

  Branches on event:
  - checkout.session.completed (mode "subscription") → activate ProTrack Pro.
  - checkout.session.completed (mode "payment")      → company one-time SKU
                                                       + revshare transfer.
  - invoice.payment_succeeded                        → revshare transfer for
                                                       Pro sub payments
                                                       (initial + renewals).
  - customer.subscription.updated                    → sync Pro status/period.
  - customer.subscription.deleted                    → downgrade to Free.

  Revshare transfer failures return 500 so Stripe redelivers; the grant side is
  idempotent (billing_transactions.stripe_event_id), so a retry only reattempts
  the transfer. The invoice.payment_succeeded event must be enabled on the
  Dashboard webhook endpoint (update it in place, never delete/recreate).
*/

export const runtime = "nodejs";

// Minimal shape we read off a Stripe Subscription, decoupled from the SDK's
// evolving type (current_period_end moved between API versions).
type StripeSubLike = {
  id: string;
  status: string;
  cancel_at_period_end?: boolean;
  current_period_end?: number;
  customer: string | { id: string };
  items?: {
    data?: Array<{
      current_period_end?: number;
      price?: { recurring?: { interval?: string } | null } | null;
    }>;
  };
  metadata?: Record<string, string> | null;
};

function mapStatus(status: string): SubscriptionStatus {
  switch (status) {
    case "active":
      return SubscriptionStatus.ACTIVE;
    case "trialing":
      return SubscriptionStatus.TRIALING;
    case "past_due":
    case "unpaid":
      return SubscriptionStatus.PAST_DUE;
    case "incomplete":
    case "incomplete_expired":
      return SubscriptionStatus.INCOMPLETE;
    default:
      return SubscriptionStatus.CANCELED;
  }
}

function mapInterval(sub: StripeSubLike): SubscriptionInterval {
  const interval = sub.items?.data?.[0]?.price?.recurring?.interval;
  return interval === "year"
    ? SubscriptionInterval.YEAR
    : SubscriptionInterval.MONTH;
}

function periodEnd(sub: StripeSubLike): Date {
  const epoch =
    sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end ?? 0;
  return epoch > 0 ? new Date(epoch * 1000) : new Date();
}

function customerId(sub: StripeSubLike): string {
  return typeof sub.customer === "string" ? sub.customer : sub.customer.id;
}

// Minimal invoice shape, decoupled from the SDK: charge/payment_intent were
// top-level fields before the Basil API versions moved them under payments[].
type StripeInvoiceLike = {
  id: string;
  amount_paid?: number | null;
  currency?: string | null;
  charge?: string | { id: string } | null;
  payment_intent?: string | { id: string } | null;
  payments?: {
    data?: Array<{
      payment?: {
        payment_intent?: string | { id: string } | null;
        charge?: string | { id: string } | null;
      } | null;
    } | null> | null;
  } | null;
};

function idOf(v: string | { id: string } | null | undefined): string | null {
  return typeof v === "string" ? v : (v?.id ?? null);
}

/** Charge id backing an invoice, resolving the payment intent when needed. */
async function invoiceChargeId(
  stripe: Stripe,
  invoice: StripeInvoiceLike,
): Promise<string | null> {
  let paymentIntent = idOf(invoice.payment_intent);
  const direct = idOf(invoice.charge);
  if (direct) return direct;
  if (!paymentIntent) {
    for (const p of invoice.payments?.data ?? []) {
      const charge = idOf(p?.payment?.charge);
      if (charge) return charge;
      paymentIntent ??= idOf(p?.payment?.payment_intent);
    }
  }
  return paymentIntent ? chargeIdFromPaymentIntent(stripe, paymentIntent) : null;
}

async function chargeIdFromPaymentIntent(
  stripe: Stripe,
  paymentIntentId: string,
): Promise<string | null> {
  const intent = (await stripe.paymentIntents.retrieve(
    paymentIntentId,
  )) as unknown as { latest_charge?: string | { id: string } | null };
  return idOf(intent.latest_charge);
}

function logRevshare(eventId: string, outcome: RevshareOutcome): void {
  if (outcome.status === "created") {
    console.log(
      `[stripe-webhook] ${eventId} revshare transfer created: ${outcome.transferId} (${outcome.amountCents} cents)`,
    );
  } else if (outcome.status === "exists") {
    console.log(
      `[stripe-webhook] ${eventId} revshare transfer already exists: ${outcome.transferId}`,
    );
  } else if (outcome.reason === "no_account") {
    console.warn(
      `[stripe-webhook] ${eventId} revshare skipped: STRIPE_CONNECT_REVSHARE_ACCOUNT_ID not set`,
    );
  }
}

async function activateFromSubscription(sub: StripeSubLike): Promise<boolean> {
  const userId = sub.metadata?.userId;
  if (!userId) return false;
  await syncProSubscription({
    userId,
    stripeCustomerId: customerId(sub),
    stripeSubscriptionId: sub.id,
    status: mapStatus(sub.status),
    interval: mapInterval(sub),
    currentPeriodEnd: periodEnd(sub),
    cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
  });
  return true;
}

export async function POST(request: NextRequest) {
  if (isMockMode()) {
    return NextResponse.json(
      {
        error:
          "Real Stripe webhook disabled in mock mode. Use the dev mock webhooks for tests.",
      },
      { status: 503 },
    );
  }

  const secret = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !webhookSecret) {
    return NextResponse.json(
      { error: "Stripe is not configured." },
      { status: 500 },
    );
  }

  const stripe = new Stripe(secret);
  const signature = request.headers.get("stripe-signature");
  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature ?? "",
      webhookSecret,
    );
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode === "subscription" && session.subscription) {
        const subId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription.id;
        const sub = (await stripe.subscriptions.retrieve(
          subId,
        )) as unknown as StripeSubLike;
        if (!sub.metadata?.userId && session.client_reference_id) {
          sub.metadata = { ...(sub.metadata ?? {}), userId: session.client_reference_id };
        }
        const activated = await activateFromSubscription(sub);
        if (!activated) {
          console.error(
            `[stripe-webhook] ${event.id}: subscription ${sub.id} has no userId metadata; Pro not activated`,
          );
        }
      } else if (session.mode === "payment") {
        const skuId = session.metadata?.skuId;
        const companyId = session.client_reference_id;
        // Quantity-priced SKUs (app_course) carry their quantity in session
        // metadata, set by createCheckoutSession when real mode is wired.
        const quantity = Number(session.metadata?.quantity ?? "1") || 1;
        if (skuId && companyId) {
          const outcome = await handleCheckoutCompleted({
            skuId,
            companyId,
            quantity,
            stripeEventId: event.id,
            stripePaymentId:
              typeof session.payment_intent === "string"
                ? session.payment_intent
                : null,
          });
          if (outcome.ok) {
            console.log(
              `[stripe-webhook] ${event.id} ${outcome.status}: ${skuId} x${quantity} -> company ${companyId}`,
            );
            // Revshare AFTER the grant: the grant is idempotent, so a 500 here
            // makes Stripe redeliver and only the transfer is reattempted.
            const gross = session.amount_total ?? 0;
            if (gross > 0) {
              const paymentIntentId = idOf(session.payment_intent);
              const chargeId = paymentIntentId
                ? await chargeIdFromPaymentIntent(stripe, paymentIntentId)
                : null;
              if (!chargeId) {
                console.error(
                  `[stripe-webhook] ${event.id} revshare unresolvable: session ${session.id} has no charge`,
                );
                return NextResponse.json(
                  { error: "Revshare source charge not found" },
                  { status: 500 },
                );
              }
              try {
                const revshare = await maybeCreateRevshareTransfer(stripe, {
                  stripeEventId: event.id,
                  sourceId: session.id,
                  grossCents: gross,
                  currency: session.currency ?? "usd",
                  chargeId,
                  description: `DentalACE One revenue share (${skuId} x${quantity})`,
                });
                logRevshare(event.id, revshare);
              } catch (err) {
                console.error(
                  `[stripe-webhook] ${event.id} revshare transfer failed for session ${session.id}`,
                  err,
                );
                return NextResponse.json(
                  { error: "Revshare transfer failed" },
                  { status: 500 },
                );
              }
            }
          } else {
            console.error(
              `[stripe-webhook] ${event.id} dropped (${outcome.status}): ${skuId} x${quantity} -> company ${companyId}`,
            );
          }
        } else {
          // Sessions created outside the app (Payment Link, Dashboard) carry
          // no skuId/client_reference_id and can't be fulfilled automatically.
          // No revshare transfer is created either; handle both manually.
          console.error(
            `[stripe-webhook] ${event.id} unfulfillable: missing ${skuId ? "" : "metadata.skuId "}${companyId ? "" : "client_reference_id"} (session ${session.id})`,
          );
        }
      }
      break;
    }
    case "invoice.payment_succeeded": {
      // ProTrack Pro subscription revenue: the initial payment and every
      // renewal each produce one paid invoice, so this single handler covers
      // the whole subscription stream without double-counting the checkout.
      const invoice = event.data.object as unknown as StripeInvoiceLike;
      const gross = invoice.amount_paid ?? 0;
      if (gross <= 0) break;
      const chargeId = await invoiceChargeId(stripe, invoice);
      if (!chargeId) {
        console.error(
          `[stripe-webhook] ${event.id} revshare unresolvable: invoice ${invoice.id} has no charge`,
        );
        return NextResponse.json(
          { error: "Revshare source charge not found" },
          { status: 500 },
        );
      }
      try {
        const revshare = await maybeCreateRevshareTransfer(stripe, {
          stripeEventId: event.id,
          sourceId: invoice.id,
          grossCents: gross,
          currency: invoice.currency ?? "usd",
          chargeId,
          description: "DentalACE One revenue share (ProTrack Pro invoice)",
        });
        logRevshare(event.id, revshare);
      } catch (err) {
        console.error(
          `[stripe-webhook] ${event.id} revshare transfer failed for invoice ${invoice.id}`,
          err,
        );
        return NextResponse.json(
          { error: "Revshare transfer failed" },
          { status: 500 },
        );
      }
      break;
    }
    case "customer.subscription.updated": {
      const sub = event.data.object as unknown as StripeSubLike;
      const activated = await activateFromSubscription(sub);
      if (!activated) {
        console.error(
          `[stripe-webhook] ${event.id}: subscription ${sub.id} has no userId metadata; update not synced`,
        );
      }
      break;
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as unknown as StripeSubLike;
      await cancelProSubscriptionBySubId(sub.id);
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ received: true });
}
