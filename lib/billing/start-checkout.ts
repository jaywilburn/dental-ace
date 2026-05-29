"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getSku } from "@/lib/billing/catalog";
import { isMockMode } from "@/lib/billing/checkout-mode";

/*
  Server action invoked from the Buy Credits / Buy Cert Bundles pages.

  - Mock mode: redirects to the dev mock-checkout page with the chosen SKU.
  - Real mode: TODO — creates a Stripe Checkout Session and redirects to its
    hosted URL. Stub in place so it's a small, isolated swap when a Stripe
    account exists.
*/
export async function startCheckout(formData: FormData) {
  const skuId = String(formData.get("skuId") ?? "");
  const sku = getSku(skuId);
  if (!sku) {
    throw new Error(`Unknown SKU: ${skuId}`);
  }

  const user = await getCurrentUser();
  if (!user || !user.companyId) {
    throw new Error("Authenticated company user required to start checkout");
  }

  if (isMockMode()) {
    redirect(`/dev/stripe-mock-checkout?sku=${sku.id}`);
  }

  throw new Error(
    "Real Stripe checkout not yet wired. Set STRIPE_SECRET_KEY + STRIPE_PRICE_ID_* envs and implement createCheckoutSession.",
  );
}
