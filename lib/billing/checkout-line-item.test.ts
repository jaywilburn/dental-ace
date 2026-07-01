import { describe, it, expect } from "vitest";
import { getSku } from "@/lib/billing/catalog";
import { buildCheckoutLineItem } from "@/lib/billing/checkout-line-item";

const certSku = getSku("cert_50")!;
const appSku = getSku("app_course")!;

describe("buildCheckoutLineItem", () => {
  it("uses the stored Stripe Price for a fixed cert bundle", () => {
    const item = buildCheckoutLineItem(certSku, 1, { priceId: "price_cert50" });
    expect(item).toEqual({ price: "price_cert50", quantity: 1 });
  });

  it("ignores quantity for fixed packs (always one unit)", () => {
    const item = buildCheckoutLineItem(certSku, 9, { priceId: "price_cert50" });
    expect(item).toMatchObject({ price: "price_cert50", quantity: 1 });
  });

  it("throws naming the missing Price env var for a fixed SKU", () => {
    expect(() => buildCheckoutLineItem(certSku, 1, {})).toThrow(
      /STRIPE_PRICE_ID_CERT_50/,
    );
  });

  // Volume tiers from APP_COURSE_TIERS: 1→$99, 2-4→$95, 5-9→$90, 10+→$85.
  it.each([
    [1, 9900],
    [3, 9500],
    [7, 9000],
    [12, 8500],
  ])(
    "prices app_course inline at the correct tier: qty %i → %i cents/unit",
    (qty, unit) => {
      const item = buildCheckoutLineItem(appSku, qty, {
        appCourseProductId: "prod_app",
      });
      expect(item).toEqual({
        quantity: qty,
        price_data: {
          currency: "usd",
          product: "prod_app",
          unit_amount: unit,
        },
      });
    },
  );

  it("throws naming the missing product env var for app_course", () => {
    expect(() => buildCheckoutLineItem(appSku, 1, {})).toThrow(
      /STRIPE_PRODUCT_ID_APP_COURSE/,
    );
  });
});
