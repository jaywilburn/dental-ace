import type Stripe from "stripe";
import { appCourseUnitCents, type Sku } from "@/lib/billing/catalog";

/*
  Maps a catalog SKU + quantity to a single Stripe Checkout line item. Pure and
  Stripe-key-free so it can be unit-tested; start-checkout.ts resolves the env
  values and hands them in.

  - Fixed packs (cert bundles) reference their pre-created Stripe Price, so every
    purchase reuses one product + one price (clean dashboard, real reporting).
  - app_course is volume-tiered, which Checkout can't express as a stored Price,
    so it uses inline price_data (unit_amount picked by tier) that still points at
    the pre-created "Course Application" product via `product` (not product_data,
    which would mint a fresh product per purchase). The webhook re-derives the
    grant from the catalog, so the amount here never authorizes credits on its own.
*/

export type CheckoutLineItemEnv = {
  /** Stored Stripe Price ID for a fixed-price SKU (from sku.envPriceIdKey). */
  priceId?: string;
  /** Stripe Product ID for the quantity-priced app_course SKU. */
  appCourseProductId?: string;
};

export function buildCheckoutLineItem(
  sku: Sku,
  quantity: number,
  env: CheckoutLineItemEnv,
): Stripe.Checkout.SessionCreateParams.LineItem {
  if (sku.quantityPriced) {
    if (!env.appCourseProductId) {
      throw new Error(
        `Missing STRIPE_PRODUCT_ID_APP_COURSE for quantity-priced SKU "${sku.id}"`,
      );
    }
    return {
      quantity,
      price_data: {
        currency: "usd",
        product: env.appCourseProductId,
        unit_amount: appCourseUnitCents(quantity),
      },
    };
  }

  if (!env.priceId) {
    throw new Error(`Missing ${sku.envPriceIdKey} for SKU "${sku.id}"`);
  }
  return { price: env.priceId, quantity: 1 };
}
