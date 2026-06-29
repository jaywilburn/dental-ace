"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import Stripe from "stripe";
import { getCurrentUser } from "@/lib/auth/session";
import {
  appCourseUnitCents,
  clampAppCourseQty,
  getSku,
  type Sku,
} from "@/lib/billing/catalog";
import { isMockMode } from "@/lib/billing/checkout-mode";

/*
  Server action invoked from the Buy Credits / Buy Cert Bundles pages.

  - Mock mode: redirects to the dev mock-checkout page with the chosen SKU.
  - Real mode: creates a Stripe Checkout Session (one-time payment) and
    redirects to its hosted URL.

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

  const stripe = new Stripe(secret);
  const host = (await headers()).get("host") ?? "dentalace.org";
  const origin = `https://${host}`;

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [lineItem(sku, quantity)],
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

/*
  Inline price_data keyed off the catalog (the single source of truth) instead
  of pre-created Stripe Price IDs. For app_course this makes the volume tier
  exact: unit_amount(qty) * qty === appCourseTotalCents(qty). product_data.name
  is required by Stripe.
*/
function lineItem(
  sku: Sku,
  quantity: number,
): Stripe.Checkout.SessionCreateParams.LineItem {
  if (sku.quantityPriced) {
    const noun = quantity === 1 ? "course" : "courses";
    return {
      quantity,
      price_data: {
        currency: "usd",
        unit_amount: appCourseUnitCents(quantity),
        product_data: {
          name: `${sku.name} (${quantity} ${noun})`,
        },
      },
    };
  }
  return {
    quantity: 1,
    price_data: {
      currency: "usd",
      unit_amount: sku.amountCents,
      product_data: { name: sku.name },
    },
  };
}
