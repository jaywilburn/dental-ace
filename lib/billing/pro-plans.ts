import { SubscriptionInterval } from "@prisma/client";

/*
  ProTrack Pro subscription plans. Deliberately separate from the frozen 10-SKU
  one-time catalog (lib/billing/catalog.ts): Pro is recurring and its state lives
  in pro_subscriptions + licensees.planTier, so it never touches company credits.

  Prices: $7/mo or $67/yr (June 2026 pricing sheet; the annual saves $17 vs
  monthly). Money in cents.
*/

export type ProPlanId = "pro_monthly" | "pro_annual";

export type ProPlan = {
  id: ProPlanId;
  interval: SubscriptionInterval;
  amountCents: number;
  cadence: string;
  /** env var holding the Stripe Price ID for real mode. */
  envPriceIdKey: string;
};

export const PRO_PLANS: Record<ProPlanId, ProPlan> = {
  pro_monthly: {
    id: "pro_monthly",
    interval: SubscriptionInterval.MONTH,
    amountCents: 700,
    cadence: "per month",
    envPriceIdKey: "STRIPE_PRICE_ID_PRO_MONTHLY",
  },
  pro_annual: {
    id: "pro_annual",
    interval: SubscriptionInterval.YEAR,
    amountCents: 6700,
    cadence: "per year",
    envPriceIdKey: "STRIPE_PRICE_ID_PRO_ANNUAL",
  },
};

export function getProPlan(id: string): ProPlan | null {
  return (PRO_PLANS as Record<string, ProPlan>)[id] ?? null;
}
