/*
  Pricing catalog. Single source of truth for what we sell, what each SKU costs,
  and what it grants the company on a successful purchase.

  Phase 1 = 10 products: 4 application-credit tiers + 6 cert bundles. Pricing
  matches logic/dentalace-dev-mockup-suite-v3.html (May 2026 design decision;
  supersedes the original SOW §6 table).

  Real-mode Stripe price IDs come from env (STRIPE_PRICE_ID_<SKU>). In mock
  mode they're undefined and the system uses the SKU id directly.
*/

export type SkuKind = "APP_CREDIT" | "CERT_BUNDLE";

export type Sku = {
  /** Stable internal id used in URLs, the mock checkout, and the webhook payload. */
  id: SkuId;
  kind: SkuKind;
  /** Human-readable display name for cart/checkout. */
  name: string;
  /** Optional eyebrow/sub-name for marketing tags ("MOST POPULAR", etc.). */
  badge?: string;
  /** Price in USD cents. */
  amountCents: number;
  /** Optional one-line description shown on the product card. */
  blurb?: string;
  /** What this SKU grants on a successful checkout. */
  grants:
    | { applicationCredits: number; expeditedCredits?: never; certBalance?: never }
    | { applicationCredits?: never; expeditedCredits: number; certBalance?: never }
    | { applicationCredits?: never; expeditedCredits?: never; certBalance: number };
  /** Resolved at runtime via env. Undefined when running in mock mode. */
  envPriceIdKey: string;
};

export type SkuId =
  | "app_1"
  | "app_1_exp"
  | "app_3"
  | "app_5"
  | "cert_50"
  | "cert_100"
  | "cert_200"
  | "cert_300"
  | "cert_500"
  | "cert_750";

export const CATALOG: Record<SkuId, Sku> = {
  app_1: {
    id: "app_1",
    kind: "APP_CREDIT",
    name: "1 Application",
    amountCents: 12_900,
    blurb: "Standard review · ~10 business days",
    grants: { applicationCredits: 1 },
    envPriceIdKey: "STRIPE_PRICE_ID_APP_1",
  },
  app_1_exp: {
    id: "app_1_exp",
    kind: "APP_CREDIT",
    name: "1 Application + Expedited",
    amountCents: 21_900,
    blurb: "Priority review · ~3 business days",
    grants: { expeditedCredits: 1 },
    envPriceIdKey: "STRIPE_PRICE_ID_APP_1_EXP",
  },
  app_3: {
    id: "app_3",
    kind: "APP_CREDIT",
    name: "3 Applications",
    amountCents: 34_900,
    blurb: "$116 per credit · Save 10%",
    grants: { applicationCredits: 3 },
    envPriceIdKey: "STRIPE_PRICE_ID_APP_3",
  },
  app_5: {
    id: "app_5",
    kind: "APP_CREDIT",
    name: "5 Applications",
    badge: "MOST POPULAR",
    amountCents: 54_900,
    blurb: "$110 per credit · Save 15%",
    grants: { applicationCredits: 5 },
    envPriceIdKey: "STRIPE_PRICE_ID_APP_5",
  },
  cert_50: {
    id: "cert_50",
    kind: "CERT_BUNDLE",
    name: "50 Certificates",
    amountCents: 50_000,
    blurb: "$10.00 per cert",
    grants: { certBalance: 50 },
    envPriceIdKey: "STRIPE_PRICE_ID_CERT_50",
  },
  cert_100: {
    id: "cert_100",
    kind: "CERT_BUNDLE",
    name: "100 Certificates",
    amountCents: 90_000,
    blurb: "$9.00 per cert",
    grants: { certBalance: 100 },
    envPriceIdKey: "STRIPE_PRICE_ID_CERT_100",
  },
  cert_200: {
    id: "cert_200",
    kind: "CERT_BUNDLE",
    name: "200 Certificates",
    amountCents: 140_000,
    blurb: "$7.00 per cert",
    grants: { certBalance: 200 },
    envPriceIdKey: "STRIPE_PRICE_ID_CERT_200",
  },
  cert_300: {
    id: "cert_300",
    kind: "CERT_BUNDLE",
    name: "300 Certificates",
    amountCents: 180_000,
    blurb: "$6.00 per cert",
    grants: { certBalance: 300 },
    envPriceIdKey: "STRIPE_PRICE_ID_CERT_300",
  },
  cert_500: {
    id: "cert_500",
    kind: "CERT_BUNDLE",
    name: "500 Certificates",
    amountCents: 250_000,
    blurb: "$5.00 per cert",
    grants: { certBalance: 500 },
    envPriceIdKey: "STRIPE_PRICE_ID_CERT_500",
  },
  cert_750: {
    id: "cert_750",
    kind: "CERT_BUNDLE",
    name: "750 Certificates",
    badge: "BEST VALUE",
    amountCents: 300_000,
    blurb: "$4.00 per cert",
    grants: { certBalance: 750 },
    envPriceIdKey: "STRIPE_PRICE_ID_CERT_750",
  },
};

export const APP_CREDIT_SKUS: Sku[] = [
  CATALOG.app_1,
  CATALOG.app_1_exp,
  CATALOG.app_3,
  CATALOG.app_5,
];

export const CERT_BUNDLE_SKUS: Sku[] = [
  CATALOG.cert_50,
  CATALOG.cert_100,
  CATALOG.cert_200,
  CATALOG.cert_300,
  CATALOG.cert_500,
  CATALOG.cert_750,
];

export function getSku(id: string): Sku | null {
  return id in CATALOG ? CATALOG[id as SkuId] : null;
}

/** USD-format helper used by buy pages + receipts. */
export function formatPrice(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
