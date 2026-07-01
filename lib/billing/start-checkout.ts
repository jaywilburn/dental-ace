"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import Stripe from "stripe";
import { getCurrentUser } from "@/lib/auth/session";
import { clampAppCourseQty, getSku } from "@/lib/billing/catalog";
import { buildCheckoutLineItem } from "@/lib/billing/checkout-line-item";
import { isMockMode } from "@/lib/billing/checkout-mode";

/*
  Server action invoked from the Buy Credits / Buy Cert Bundles pages.

  - Mock mode: redirects to the dev mock-checkout page with the chosen SKU.
  - Real mode: creates a Stripe Checkout Session (one-time payment) against the
    pre-created catalog (stored Price for fixed packs; inline tiered price_data
    referencing the Course Application product for app_course) and redirects to
    its hosted URL.

  The session carries skuId + quantity in metadata and the companyId as
  client_reference_id; the webhook (app/api/webhooks/stripe/route.ts →
  handleCheckoutCompleted) recomputes the grant from the catalog server-side,
  so the amount charged here never authorizes a credit grant on its own.
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

  // Quantity only applies to quantity-priced SKUs (course applications);
  // fixed packs always check out as a single unit.
  const quantity = sku.quantityPriced
    ? clampAppCourseQty(Number(formData.get("quantity") ?? 1))
    : 1;

  if (isMockMode()) {
    redirect(`/dev/stripe-mock-checkout?sku=${sku.id}&qty=${quantity}`);
  }

  const buyPath =
    sku.kind === "CERT_BUNDLE" ? "/company/buy/certs" : "/company/buy/credits";

  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) redirect(`${buyPath}?error=config`);

  // Resolve the SKU's Stripe catalog reference. A fixed pack needs its stored
  // Price ID; app_course needs the Course Application product ID (its price is
  // computed inline per tier). A missing value means the env isn't configured.
  const priceId = process.env[sku.envPriceIdKey];
  const appCourseProductId = process.env.STRIPE_PRODUCT_ID_APP_COURSE;
  if (sku.quantityPriced ? !appCourseProductId : !priceId) {
    redirect(`${buyPath}?error=config`);
  }

  const stripe = new Stripe(secret);
  const host = (await headers()).get("host") ?? "dentalace.org";
  const origin = `https://${host}`;

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [buildCheckoutLineItem(sku, quantity, { priceId, appCourseProductId })],
    // Webhook reads the company off client_reference_id (NOT the user id).
    client_reference_id: user.companyId,
    // Stripe metadata values must be strings; the webhook does Number(quantity).
    metadata: { skuId: sku.id, quantity: String(quantity) },
    // Surfaces a promo-code field on hosted checkout; coupons are created in
    // the Stripe dashboard. The grant is by SKU/qty, so a discount does not
    // change how many credits/certs are granted.
    allow_promotion_codes: true,
    success_url: `${origin}/company/billing?just=success`,
    cancel_url: `${origin}${buyPath}`,
  });

  if (!session.url) redirect(`${buyPath}?error=session`);
  redirect(session.url);
}
