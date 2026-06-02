"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import Stripe from "stripe";
import { getCurrentUser } from "@/lib/auth/session";
import { isMockMode } from "@/lib/billing/checkout-mode";
import { getProPlan } from "@/lib/billing/pro-plans";
import { cancelProForLicensee } from "@/lib/billing/pro-webhook-core";

/*
  Server actions for the ProTrack Pro upgrade page.

  - startProCheckout: mock mode → the in-app mock checkout page; real mode →
    a Stripe subscription Checkout Session.
  - cancelProSubscription: mock mode → immediate downgrade for testing; real
    mode would open Stripe's billing portal (left as a redirect for now).
*/

export async function startProCheckout(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const plan = getProPlan(String(formData.get("planId") ?? ""));
  if (!plan) redirect("/protrack/upgrade?error=plan");

  if (isMockMode()) {
    redirect(`/dev/protrack-mock-checkout?plan=${plan.id}`);
  }

  const secret = process.env.STRIPE_SECRET_KEY;
  const priceId = process.env[plan.envPriceIdKey];
  if (!secret || !priceId) redirect("/protrack/upgrade?error=config");

  const stripe = new Stripe(secret);
  const host = (await headers()).get("host") ?? "dentalace.org";
  const origin = `https://${host}`;

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    client_reference_id: user.id,
    success_url: `${origin}/protrack?upgraded=1`,
    cancel_url: `${origin}/protrack/upgrade`,
    metadata: { planId: plan.id, userId: user.id },
    subscription_data: { metadata: { userId: user.id, planId: plan.id } },
  });

  if (!session.url) redirect("/protrack/upgrade?error=session");
  redirect(session.url);
}

export async function cancelProSubscription(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  if (!isMockMode()) {
    // Real mode: a Stripe billing-portal session would go here.
    redirect("/protrack/upgrade?error=portal");
  }

  await cancelProForLicensee(user.id);
  redirect("/protrack/upgrade?canceled=1");
}
