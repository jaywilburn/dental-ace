import { NextResponse } from "next/server";
import { isMockMode } from "@/lib/billing/checkout-mode";
import { handleCheckoutCompleted } from "@/lib/billing/webhook-core";

/*
  Dev-only mock webhook. Replicates the shape of a real Stripe
  checkout.session.completed event without the signature dance.

  Locked out unless we're in mock mode. The body is a plain JSON
  payload that the mock checkout page POSTs.
*/

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isMockMode()) {
    return NextResponse.json(
      { error: "Mock webhook disabled when STRIPE_SECRET_KEY is configured." },
      { status: 403 },
    );
  }

  let body: { skuId?: string; companyId?: string; stripeEventId?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { skuId, companyId, stripeEventId } = body;
  if (!skuId || !companyId || !stripeEventId) {
    return NextResponse.json(
      { error: "skuId, companyId, and stripeEventId are required" },
      { status: 400 },
    );
  }

  const outcome = await handleCheckoutCompleted({
    skuId,
    companyId,
    stripeEventId,
    stripePaymentId: `mock_${stripeEventId}`,
  });

  if (!outcome.ok) {
    return NextResponse.json(outcome, { status: 400 });
  }
  return NextResponse.json(outcome);
}
