import { NextResponse } from "next/server";
import { isMockMode } from "@/lib/billing/checkout-mode";
import { handleCheckoutCompleted } from "@/lib/billing/webhook-core";
import { getCurrentUser } from "@/lib/auth/session";

/*
  Dev-only mock webhook. Replicates the shape of a real Stripe
  checkout.session.completed event without the signature dance.

  Hard gates (must all pass before any credit is granted):
  1. Not running in production (NODE_ENV check).
  2. STRIPE_SECRET_KEY is unset OR STRIPE_MOCK_MODE=true (isMockMode).
  3. The caller is an authenticated CUSTOMER.
  4. The companyId in the body matches the caller's own companyId.

  Without these, an attacker who reaches this URL while the app sits in
  mock mode could mint credits for any company. The mock-checkout page
  already enforces (3) and (4) before calling here; this route enforces
  them too so it isn't a trust-the-client setup.
*/

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "Mock webhook is dev-only." },
      { status: 403 },
    );
  }

  if (!isMockMode()) {
    return NextResponse.json(
      { error: "Mock webhook disabled when STRIPE_SECRET_KEY is configured." },
      { status: 403 },
    );
  }

  const user = await getCurrentUser();
  if (!user || !user.companyId) {
    return NextResponse.json(
      { error: "Authenticated CUSTOMER session required." },
      { status: 401 },
    );
  }

  let body: {
    skuId?: string;
    companyId?: string;
    stripeEventId?: string;
    quantity?: number;
  } = {};
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

  if (companyId !== user.companyId) {
    return NextResponse.json(
      { error: "companyId must match the authenticated user's company." },
      { status: 403 },
    );
  }

  const outcome = await handleCheckoutCompleted({
    skuId,
    companyId,
    stripeEventId,
    quantity: typeof body.quantity === "number" ? body.quantity : undefined,
    stripePaymentId: `mock_${stripeEventId}`,
  });

  if (!outcome.ok) {
    return NextResponse.json(outcome, { status: 400 });
  }
  return NextResponse.json(outcome);
}
