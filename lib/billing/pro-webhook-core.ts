import "server-only";
import {
  PlanTier,
  SubscriptionInterval,
  SubscriptionStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";

/*
  Shared ProTrack Pro subscription state writer. Called by both the real Stripe
  webhook and the dev mock flow. Stripe-agnostic: takes plain data so the same
  code path serves both.

  Upsert is the idempotency mechanism: re-processing the same subscription event
  just re-sets the same state, so no event-id ledger is needed (there is no
  balance increment to double-apply). pro_subscriptions writes happen here (and
  in the webhook) under the service-role/privileged DB connection.
*/

export type ProSubscriptionSync = {
  userId: string; // licensee user id (Stripe client_reference_id)
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  status: SubscriptionStatus;
  interval: SubscriptionInterval;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd?: boolean;
};

function isActiveStatus(status: SubscriptionStatus): boolean {
  return (
    status === SubscriptionStatus.ACTIVE ||
    status === SubscriptionStatus.TRIALING
  );
}

/** Upsert the subscription row and mirror the plan tier onto the licensee. */
export async function syncProSubscription(
  input: ProSubscriptionSync,
): Promise<void> {
  const active = isActiveStatus(input.status);
  await prisma.$transaction(async (tx) => {
    await tx.proSubscription.upsert({
      where: { licenseeId: input.userId },
      update: {
        stripeCustomerId: input.stripeCustomerId,
        stripeSubscriptionId: input.stripeSubscriptionId,
        status: input.status,
        interval: input.interval,
        currentPeriodEnd: input.currentPeriodEnd,
        cancelAtPeriodEnd: input.cancelAtPeriodEnd ?? false,
      },
      create: {
        licenseeId: input.userId,
        stripeCustomerId: input.stripeCustomerId,
        stripeSubscriptionId: input.stripeSubscriptionId,
        status: input.status,
        interval: input.interval,
        currentPeriodEnd: input.currentPeriodEnd,
        cancelAtPeriodEnd: input.cancelAtPeriodEnd ?? false,
      },
    });
    await tx.user.update({
      where: { id: input.userId },
      data: {
        protrackTier: active ? PlanTier.PRO : PlanTier.FREE,
        proExpiresAt: active ? input.currentPeriodEnd : null,
      },
    });
  });
}

/** Real webhook customer.subscription.deleted: downgrade by Stripe sub id. */
export async function cancelProSubscriptionBySubId(
  stripeSubscriptionId: string,
): Promise<void> {
  const sub = await prisma.proSubscription.findUnique({
    where: { stripeSubscriptionId },
    select: { licenseeId: true },
  });
  if (!sub) return;
  await downgrade(sub.licenseeId, stripeSubscriptionId);
}

/** Mock/manual cancel for a licensee (immediate downgrade). */
export async function cancelProForLicensee(userId: string): Promise<void> {
  await downgrade(userId, null);
}

async function downgrade(
  userId: string,
  stripeSubscriptionId: string | null,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    if (stripeSubscriptionId) {
      await tx.proSubscription.update({
        where: { stripeSubscriptionId },
        data: { status: SubscriptionStatus.CANCELED, cancelAtPeriodEnd: true },
      });
    } else {
      await tx.proSubscription.updateMany({
        where: { licenseeId: userId },
        data: { status: SubscriptionStatus.CANCELED, cancelAtPeriodEnd: true },
      });
    }
    await tx.user.update({
      where: { id: userId },
      data: { protrackTier: PlanTier.FREE, proExpiresAt: null },
    });
  });
}
