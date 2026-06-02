import { NextResponse, type NextRequest } from "next/server";
import Stripe from "stripe";
import { SubscriptionInterval, SubscriptionStatus } from "@prisma/client";
import { isMockMode } from "@/lib/billing/checkout-mode";
import { handleCheckoutCompleted } from "@/lib/billing/webhook-core";
import {
  syncProSubscription,
  cancelProSubscriptionBySubId,
} from "@/lib/billing/pro-webhook-core";

/*
  Real Stripe webhook. Active once STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET are
  set; until then the app runs in mock mode and this returns 503 (the in-app
  mock flows exercise the same shared handlers in-process).

  Branches on event:
  - checkout.session.completed (mode "subscription") → activate ProTrack Pro.
  - checkout.session.completed (mode "payment")      → company one-time SKU.
  - customer.subscription.updated                    → sync Pro status/period.
  - customer.subscription.deleted                    → downgrade to Free.
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
        await activateFromSubscription(sub);
      } else if (session.mode === "payment") {
        const skuId = session.metadata?.skuId;
        const companyId = session.client_reference_id;
        if (skuId && companyId) {
          await handleCheckoutCompleted({
            skuId,
            companyId,
            stripeEventId: event.id,
            stripePaymentId:
              typeof session.payment_intent === "string"
                ? session.payment_intent
                : null,
          });
        }
      }
      break;
    }
    case "customer.subscription.updated": {
      await activateFromSubscription(
        event.data.object as unknown as StripeSubLike,
      );
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
