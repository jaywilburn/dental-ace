import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { getCurrentUser } from "@/lib/auth/session";
import { isMockMode } from "@/lib/billing/checkout-mode";
import { formatPrice } from "@/lib/billing/catalog";
import { getProPlan } from "@/lib/billing/pro-plans";
import { syncProSubscription } from "@/lib/billing/pro-webhook-core";
import { BrandMark } from "@/components/brand-mark";

/*
  Dev-only mock Stripe Checkout for the ProTrack Pro subscription. Mirrors
  app/dev/stripe-mock-checkout but activates a subscription (not a one-time SKU).
  The "Simulate" button calls syncProSubscription in-process via the same handler
  the real webhook uses. Gated to mock mode + the signed-in LICENSEE.
*/
export default async function ProtrackMockCheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>;
}) {
  if (!isMockMode()) redirect("/protrack/upgrade");

  const { plan: planId } = await searchParams;
  const plan = planId ? getProPlan(planId) : null;
  if (!plan) redirect("/protrack/upgrade");

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const stripeEventId = `evt_mock_${randomUUID()}`;

  return (
    <main className="min-h-dvh bg-navy text-white">
      <div className="mx-auto max-w-md px-6 py-16">
        <div className="mb-6 flex flex-col items-center">
          <BrandMark size="md" product="pro" />
          <p className="mt-2 text-xs uppercase tracking-[2px] text-white/40">
            Mock Checkout · No real charge
          </p>
        </div>

        <div className="rounded-xl bg-white p-6 text-text">
          <h1 className="font-serif text-xl font-bold text-navy">Order Summary</h1>
          <p className="mt-1 text-xs text-text-muted text-pretty">
            Dev-mode mock of Stripe subscription checkout. The button below
            simulates a successful payment and fires the same handler real Stripe
            would.
          </p>

          <div className="mt-5 flex justify-between border-t border-border pt-4 text-sm">
            <span className="font-medium text-navy">ProTrack Pro</span>
            <span className="font-medium text-navy tabular-nums">
              {formatPrice(plan.amountCents)} {plan.cadence}
            </span>
          </div>

          <form
            action={async () => {
              "use server";
              await completeMockProCheckout(plan.id);
            }}
            className="mt-6"
          >
            <button
              type="submit"
              className="w-full rounded-md bg-ace py-3 text-sm font-bold text-navy transition-colors hover:bg-ace-light"
            >
              Simulate successful payment
            </button>
          </form>

          <p className="mt-3 text-center text-[10px] text-text-muted">
            event_id: <code>{stripeEventId}</code>
          </p>
        </div>

        <div className="mt-6 text-center">
          <a
            href="/protrack/upgrade"
            className="text-xs text-white/40 underline-offset-4 hover:text-white hover:underline"
          >
            ← Cancel and go back
          </a>
        </div>
      </div>
    </main>
  );
}

async function completeMockProCheckout(planId: string) {
  "use server";
  if (process.env.NODE_ENV === "production") {
    throw new Error("Mock checkout disabled in production");
  }
  if (!isMockMode()) {
    throw new Error("Mock checkout disabled when STRIPE_SECRET_KEY is set");
  }

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const plan = getProPlan(planId);
  if (!plan) redirect("/protrack/upgrade");

  const now = new Date();
  const end = new Date(now);
  if (plan.interval === "YEAR") {
    end.setFullYear(end.getFullYear() + 1);
  } else {
    end.setMonth(end.getMonth() + 1);
  }

  await syncProSubscription({
    userId: user.id,
    stripeCustomerId: `cus_mock_${user.id.slice(0, 8)}`,
    stripeSubscriptionId: `sub_mock_${randomUUID()}`,
    status: "ACTIVE",
    interval: plan.interval,
    currentPeriodEnd: end,
    cancelAtPeriodEnd: false,
  });

  redirect("/protrack?upgraded=1");
}
