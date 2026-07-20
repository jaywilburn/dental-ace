import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { getCurrentUser } from "@/lib/auth/session";
import { isMockMode } from "@/lib/billing/checkout-mode";
import {
  appCourseTotalCents,
  appCourseUnitCents,
  clampAppCourseQty,
  formatPrice,
  getSku,
  type Sku,
} from "@/lib/billing/catalog";
import { handleCheckoutCompleted } from "@/lib/billing/webhook-core";
import { BrandMark } from "@/components/brand-mark";

/*
  Dev-only mock Stripe Checkout page. Renders an order summary that mirrors
  what Stripe Hosted Checkout would show. A "Simulate successful payment"
  form posts to the mock webhook, which flips the company's balance via the
  same code path as a real webhook would.

  Gates: only renders in mock mode + only for the currently signed-in CUSTOMER.
*/
export default async function StripeMockCheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ sku?: string; qty?: string }>;
}) {
  if (!isMockMode()) redirect("/company/buy/credits");

  const { sku: skuId, qty } = await searchParams;
  const sku = skuId ? getSku(skuId) : null;
  if (!sku) redirect("/company/buy/credits");

  const user = await getCurrentUser();
  if (!user || !user.companyId) redirect("/login");

  const quantity = sku.quantityPriced ? clampAppCourseQty(Number(qty ?? 1)) : 1;
  const totalCents = sku.quantityPriced
    ? appCourseTotalCents(quantity)
    : sku.amountCents;
  const grants = formatGrants(sku, quantity);
  const stripeEventId = `evt_mock_${randomUUID()}`;

  return (
    <main className="min-h-dvh bg-navy text-white">
      <div className="mx-auto max-w-md px-6 py-16">
        <div className="mb-6 flex flex-col items-center">
          <BrandMark size="md" />
          <p className="mt-2 text-xs uppercase tracking-[2px] text-white/40">
            Mock Checkout · No real charge
          </p>
        </div>

        <div className="rounded-xl bg-white p-6 text-text">
          <h1 className="font-serif text-xl font-bold text-navy">Order Summary</h1>
          <p className="mt-1 text-xs text-text-muted">
            This is a dev-mode mock of Stripe Checkout. Clicking the button below
            simulates a successful payment and fires the same webhook handler that
            real Stripe would.
          </p>

          <div className="mt-5 border-t border-border pt-4 text-sm">
            <div className="flex justify-between font-medium text-navy">
              <span>
                {sku.quantityPriced ? `${quantity} × ${sku.name}` : sku.name}
              </span>
              <span>{formatPrice(totalCents)}</span>
            </div>
            {sku.quantityPriced ? (
              <p className="mt-1 text-xs text-text-muted">
                {formatPrice(appCourseUnitCents(quantity))} per course at this
                volume
              </p>
            ) : null}
            <p className="mt-1 text-xs text-text-muted">Grants: {grants}</p>
          </div>

          <div className="mt-4 border-t border-border pt-4 flex justify-between text-base font-bold text-navy">
            <span>Total</span>
            <span>{formatPrice(totalCents)}</span>
          </div>

          <form
            action={async (formData: FormData) => {
              "use server";
              await completeMockCheckout(formData);
            }}
            className="mt-6"
          >
            <input type="hidden" name="skuId" value={sku.id} />
            <input type="hidden" name="quantity" value={quantity} />
            <input type="hidden" name="stripeEventId" value={stripeEventId} />
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
            href="/company/buy/credits"
            className="text-xs text-white/40 underline-offset-4 hover:text-white hover:underline"
          >
            ← Cancel and go back
          </a>
        </div>
      </div>
    </main>
  );
}

function formatGrants(sku: Sku, quantity: number): string {
  const units = sku.quantityPriced ? quantity : 1;
  if (sku.grants.applicationCredits) {
    const n = sku.grants.applicationCredits * units;
    return `+${n} application credit${n === 1 ? "" : "s"}`;
  }
  if (sku.grants.certBalance) {
    return `+${sku.grants.certBalance} certificates`;
  }
  return "";
}

async function completeMockCheckout(formData: FormData) {
  // Gates duplicated from /api/dev/mock-stripe-webhook so this server action
  // can't mint credits in production / for the wrong company even if someone
  // wires the form to a different company id.
  if (process.env.NODE_ENV === "production") {
    throw new Error("Mock checkout disabled in production");
  }
  if (!isMockMode()) {
    throw new Error("Mock checkout disabled when STRIPE_SECRET_KEY is configured");
  }

  const user = await getCurrentUser();
  if (!user || !user.companyId) redirect("/login");

  const skuId = String(formData.get("skuId") ?? "");
  const quantity = Number(formData.get("quantity") ?? 1);
  const stripeEventId = String(formData.get("stripeEventId") ?? "");

  // Call the shared handler directly. The webhook route stays in place for
  // any real Stripe-style POSTs from external testing tools; for our
  // in-app mock-checkout button, in-process is simpler and avoids the
  // server-to-server fetch + cookie-forwarding problem.
  const outcome = await handleCheckoutCompleted({
    skuId,
    quantity,
    stripeEventId,
    companyId: user.companyId,
    stripePaymentId: `mock_${stripeEventId}`,
  });
  if (!outcome.ok) {
    throw new Error(`Mock checkout failed: ${outcome.status}`);
  }

  redirect("/company/billing?just=success");
}
