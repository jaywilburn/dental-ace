/*
  Pricing catalog. Single source of truth for what we sell, what each SKU costs,
  and what it grants the company on a successful purchase.

  Pricing matches the client's June 2026 pricing sheet:
  - Course applications are volume-tiered per course (APP_COURSE_TIERS below)
    via the quantity-priced `app_course` SKU. Expedited stays a separate SKU.
  - 7 certificate bundles, 50 through 1,500 certificates.

  Real-mode Stripe price IDs come from env (STRIPE_PRICE_ID_<SKU>). In mock
  mode they're undefined and the system uses the SKU id directly. For
  `app_course`, the real-mode Stripe Price should be configured with volume
  tiers matching APP_COURSE_TIERS so Stripe and this table can't disagree.
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
  /** Price in USD cents. For quantity-priced SKUs this is the single-unit price. */
  amountCents: number;
  /** Optional one-line description shown on the product card. */
  blurb?: string;
  /**
   * When true, checkout carries a quantity and the unit price comes from
   * APP_COURSE_TIERS; `grants` is per unit and multiplied by the quantity.
   */
  quantityPriced?: boolean;
  /** What this SKU grants on a successful checkout (per unit when quantityPriced). */
  grants:
    | { applicationCredits: number; expeditedCredits?: never; certBalance?: never }
    | { applicationCredits?: never; expeditedCredits: number; certBalance?: never }
    | { applicationCredits?: never; expeditedCredits?: never; certBalance: number };
  /** Resolved at runtime via env. Undefined when running in mock mode. */
  envPriceIdKey: string;
};

export type SkuId =
  | "app_course"
  | "app_1_exp"
  | "cert_50"
  | "cert_100"
  | "cert_200"
  | "cert_300"
  | "cert_500"
  | "cert_750"
  | "cert_1500";

/*
  Volume tiers for course applications (whole-order pricing: the quantity
  picks one tier and every course in the order gets that unit price).
*/
export const APP_COURSE_TIERS = [
  { minQty: 1, unitCents: 9_900, label: "1 course" },
  { minQty: 2, unitCents: 9_500, label: "2-4 courses" },
  { minQty: 5, unitCents: 9_000, label: "5-9 courses" },
  { minQty: 10, unitCents: 8_500, label: "10+ courses" },
] as const;

/** Sanity ceiling for one checkout; keeps a typo'd quantity from minting 1e9 credits. */
export const MAX_APP_COURSE_QTY = 500;

/** Clamp an arbitrary client-supplied quantity into the valid purchase range. */
export function clampAppCourseQty(quantity: number): number {
  if (!Number.isFinite(quantity)) return 1;
  return Math.min(Math.max(Math.trunc(quantity), 1), MAX_APP_COURSE_QTY);
}

export function appCourseUnitCents(quantity: number): number {
  const qty = clampAppCourseQty(quantity);
  let unit: number = APP_COURSE_TIERS[0].unitCents;
  for (const tier of APP_COURSE_TIERS) {
    if (qty >= tier.minQty) unit = tier.unitCents;
  }
  return unit;
}

export function appCourseTotalCents(quantity: number): number {
  const qty = clampAppCourseQty(quantity);
  return appCourseUnitCents(qty) * qty;
}

export const CATALOG: Record<SkuId, Sku> = {
  app_course: {
    id: "app_course",
    kind: "APP_CREDIT",
    name: "Course Application",
    amountCents: 9_900,
    blurb: "Standard review · ~10 business days · volume pricing from $85",
    quantityPriced: true,
    grants: { applicationCredits: 1 },
    envPriceIdKey: "STRIPE_PRICE_ID_APP_COURSE",
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
    amountCents: 300_000,
    blurb: "$4.00 per cert",
    grants: { certBalance: 750 },
    envPriceIdKey: "STRIPE_PRICE_ID_CERT_750",
  },
  cert_1500: {
    id: "cert_1500",
    kind: "CERT_BUNDLE",
    name: "1,500 Certificates",
    badge: "BEST VALUE",
    amountCents: 450_000,
    blurb: "$3.00 per cert",
    grants: { certBalance: 1500 },
    envPriceIdKey: "STRIPE_PRICE_ID_CERT_1500",
  },
};

export const APP_CREDIT_SKUS: Sku[] = [CATALOG.app_course, CATALOG.app_1_exp];

export const CERT_BUNDLE_SKUS: Sku[] = [
  CATALOG.cert_50,
  CATALOG.cert_100,
  CATALOG.cert_200,
  CATALOG.cert_300,
  CATALOG.cert_500,
  CATALOG.cert_750,
  CATALOG.cert_1500,
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

/** Whole-dollar variant for tier tables ("$99", not "$99.00"). */
export function formatWholePrice(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", {
    maximumFractionDigits: 0,
  })}`;
}
