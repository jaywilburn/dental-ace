import "server-only";

import { prisma } from "@/lib/prisma";
import {
  appCourseTotalCents,
  clampAppCourseQty,
  getSku,
  type Sku,
  type SkuId,
} from "@/lib/billing/catalog";
import { BillingTransactionType } from "@prisma/client";

/*
  Shared idempotent checkout-completed handler. Called by both the real Stripe
  webhook and the dev mock webhook.

  Idempotency is enforced via billing_transactions.stripe_event_id UNIQUE: if
  the same event arrives twice, the first row insert wins and the increment
  runs once; the second insert is rejected by the unique constraint and we
  short-circuit before touching the balance.

  Returns the outcome so callers can craft the right HTTP response or UI
  feedback. Never throws on a duplicate event (that's the happy path).
*/

export type CheckoutCompletedInput = {
  stripeEventId: string;
  stripePaymentId?: string | null;
  skuId: SkuId | string;
  companyId: string;
  /** Units purchased for quantity-priced SKUs (app_course); ignored otherwise. */
  quantity?: number;
};

export type CheckoutCompletedOutcome =
  | { ok: true; status: "applied"; sku: Sku }
  | { ok: true; status: "duplicate" }
  | { ok: false; status: "unknown_sku"; skuId: string }
  | { ok: false; status: "unknown_company"; companyId: string };

export async function handleCheckoutCompleted(
  input: CheckoutCompletedInput,
): Promise<CheckoutCompletedOutcome> {
  const sku = getSku(input.skuId);
  if (!sku) return { ok: false, status: "unknown_sku", skuId: input.skuId };

  const company = await prisma.company.findUnique({
    where: { id: input.companyId },
    select: { id: true },
  });
  if (!company) {
    return { ok: false, status: "unknown_company", companyId: input.companyId };
  }

  // Run idempotent insert + balance update in a single transaction with a
  // row-level lock on the company so concurrent webhooks can't race.
  const txnType: BillingTransactionType =
    sku.kind === "CERT_BUNDLE"
      ? BillingTransactionType.CERT_BUNDLE
      : BillingTransactionType.APP_CREDIT;

  // Quantity-priced SKUs (app_course) multiply their per-unit grant and price
  // by the purchased quantity; everything else is a fixed pack (units = 1).
  // The amount is always recomputed server-side from the catalog tiers, never
  // trusted from the caller.
  const units = sku.quantityPriced ? clampAppCourseQty(input.quantity ?? 1) : 1;
  const granted = {
    applicationCredits: (sku.grants.applicationCredits ?? 0) * units,
    expeditedCredits: (sku.grants.expeditedCredits ?? 0) * units,
    certBalance: (sku.grants.certBalance ?? 0) * units,
  };
  const amountCents = sku.quantityPriced
    ? appCourseTotalCents(units)
    : sku.amountCents;

  const quantity =
    granted.applicationCredits || granted.expeditedCredits || granted.certBalance || 0;

  try {
    await prisma.$transaction(async (tx) => {
      // Idempotency: this insert fails on a duplicate stripe_event_id.
      await tx.billingTransaction.create({
        data: {
          companyId: input.companyId,
          type: txnType,
          quantity,
          amountCents,
          stripePaymentId: input.stripePaymentId ?? null,
          stripeEventId: input.stripeEventId,
          isExpedited: sku.id === "app_1_exp",
        },
      });

      // Lock the company row + apply the grant atomically.
      await tx.$executeRaw`select id from public.companies where id = ${input.companyId}::uuid for update`;

      if (granted.applicationCredits) {
        await tx.company.update({
          where: { id: input.companyId },
          data: {
            applicationCredits: { increment: granted.applicationCredits },
          },
        });
      } else if (granted.expeditedCredits) {
        await tx.company.update({
          where: { id: input.companyId },
          data: {
            expeditedCredits: { increment: granted.expeditedCredits },
          },
        });
      } else if (granted.certBalance) {
        await tx.company.update({
          where: { id: input.companyId },
          data: { certBalance: { increment: granted.certBalance } },
        });
      }
    });
  } catch (err: unknown) {
    if (isPrismaUniqueViolation(err, "stripe_event_id")) {
      return { ok: true, status: "duplicate" };
    }
    throw err;
  }

  return { ok: true, status: "applied", sku };
}

function isPrismaUniqueViolation(err: unknown, column: string): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { code?: string; meta?: { target?: unknown } };
  if (e.code !== "P2002") return false;
  const target = e.meta?.target;
  if (typeof target === "string") return target.includes(column);
  if (Array.isArray(target)) return target.some((t) => String(t).includes(column));
  return false;
}
