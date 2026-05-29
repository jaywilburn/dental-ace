import { NextResponse } from "next/server";
import { isMockMode } from "@/lib/billing/checkout-mode";

/*
  Real Stripe webhook handler. Skeleton in place — wires up once we have a
  Stripe account + STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET.

  When real Stripe lands:
  1. Read raw body via `await request.text()`.
  2. Verify signature against STRIPE_WEBHOOK_SECRET using stripe.webhooks.constructEvent.
  3. For checkout.session.completed events, pull skuId from session metadata
     (we set it during session creation), pull companyId from client_reference_id,
     and call handleCheckoutCompleted({ skuId, companyId, stripeEventId: event.id }).
  4. Return 200 on success or duplicate (idempotency).
*/

export const runtime = "nodejs";

export async function POST() {
  if (isMockMode()) {
    return NextResponse.json(
      {
        error:
          "Real Stripe webhook disabled in mock mode. Use /api/dev/mock-stripe-webhook for tests.",
      },
      { status: 503 },
    );
  }

  return NextResponse.json(
    { error: "Real Stripe webhook not yet implemented." },
    { status: 501 },
  );
}
