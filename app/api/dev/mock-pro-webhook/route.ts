import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { isMockMode } from "@/lib/billing/checkout-mode";
import { getProPlan } from "@/lib/billing/pro-plans";
import {
  syncProSubscription,
  cancelProForLicensee,
} from "@/lib/billing/pro-webhook-core";
import { getCurrentUser } from "@/lib/auth/session";

/*
  Dev-only mock Pro-subscription webhook (for scripted testing). Same hard gates
  as /api/dev/mock-stripe-webhook: not production, mock mode, an authenticated
  LICENSEE, acting only on their own account.

  Body: { action: "activate" | "cancel", planId?: "pro_monthly" | "pro_annual" }
*/

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Mock webhook is dev-only." }, { status: 403 });
  }
  if (!isMockMode()) {
    return NextResponse.json(
      { error: "Mock webhook disabled when STRIPE_SECRET_KEY is configured." },
      { status: 403 },
    );
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "Authenticated LICENSEE session required." },
      { status: 401 },
    );
  }

  let body: { action?: string; planId?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.action === "cancel") {
    await cancelProForLicensee(user.id);
    return NextResponse.json({ ok: true, status: "canceled" });
  }

  const plan = getProPlan(body.planId ?? "pro_annual");
  if (!plan) {
    return NextResponse.json({ error: "Unknown planId" }, { status: 400 });
  }

  const end = new Date();
  if (plan.interval === "YEAR") {
    end.setFullYear(end.getFullYear() + 1);
  } else {
    end.setMonth(end.getMonth() + 1);
  }

  await syncProSubscription({
    userId: user.id,
    stripeCustomerId: `cus_mock_${user.id.slice(0, 8)}`,
    stripeSubscriptionId: `sub_mock_${randomUUID()}`,
    status: "ACTIVE",
    interval: plan.interval,
    currentPeriodEnd: end,
    cancelAtPeriodEnd: false,
  });

  return NextResponse.json({ ok: true, status: "activated", plan: plan.id });
}
