import "server-only";

import { prisma } from "@/lib/prisma";
import { getSku, type Sku, type SkuId } from "@/lib/billing/catalog";
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

  const quantity =
    sku.grants.applicationCredits ??
    sku.grants.expeditedCredits ??
    sku.grants.certBalance ??
    0;

  try {
    await prisma.$transaction(async (tx) => {
      // Idempotency: this insert fails on a duplicate stripe_event_id.
      await tx.billingTransaction.create({
        data: {
          companyId: input.companyId,
          type: txnType,
          quantity,
          amountCents: sku.amountCents,
          stripePaymentId: input.stripePaymentId ?? null,
          stripeEventId: input.stripeEventId,
          isExpedited: sku.id === "app_1_exp",
        },
      });

      // Lock the company row + apply the grant atomically.
      await tx.$executeRaw`select id from public.companies where id = ${input.companyId}::uuid for update`;

      if (sku.grants.applicationCredits) {
        await tx.company.update({
          where: { id: input.companyId },
          data: {
            applicationCredits: { increment: sku.grants.applicationCredits },
            // Reset the 1-year expiry on every credit purchase. Cleanest model:
            // newest purchase governs the company's credit-expiry window.
            applicationCreditsExpiresAt: oneYearFromNow(),
          },
        });
      } else if (sku.grants.expeditedCredits) {
        await tx.company.update({
          where: { id: input.companyId },
          data: {
            expeditedCredits: { increment: sku.grants.expeditedCredits },
            applicationCreditsExpiresAt: oneYearFromNow(),
          },
        });
      } else if (sku.grants.certBalance) {
        await tx.company.update({
          where: { id: input.companyId },
          data: { certBalance: { increment: sku.grants.certBalance } },
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

function oneYearFromNow(): Date {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d;
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
