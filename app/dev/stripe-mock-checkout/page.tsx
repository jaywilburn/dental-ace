import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { randomUUID } from "node:crypto";
import { getCurrentUser } from "@/lib/auth/session";
import { isMockMode } from "@/lib/billing/checkout-mode";
import { CATALOG, formatPrice, getSku, type SkuId } from "@/lib/billing/catalog";
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
  searchParams: Promise<{ sku?: string }>;
}) {
  if (!isMockMode()) redirect("/company/buy/credits");

  const { sku: skuId } = await searchParams;
  const sku = skuId ? getSku(skuId) : null;
  if (!sku) redirect("/company/buy/credits");

  const user = await getCurrentUser();
  if (!user || user.role !== "CUSTOMER" || !user.companyId) redirect("/login");

  const grants = formatGrants(sku.id);
  const stripeEventId = `evt_mock_${randomUUID()}`;
  const origin = await currentOrigin();

  return (
    <main className="min-h-screen bg-navy text-white">
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
              <span>{sku.name}</span>
              <span>{formatPrice(sku.amountCents)}</span>
            </div>
            <p className="mt-1 text-xs text-text-muted">Grants: {grants}</p>
          </div>

          <div className="mt-4 border-t border-border pt-4 flex justify-between text-base font-bold text-navy">
            <span>Total</span>
            <span>{formatPrice(sku.amountCents)}</span>
          </div>

          <form
            action={async (formData: FormData) => {
              "use server";
              await completeMockCheckout(formData);
            }}
            className="mt-6"
          >
            <input type="hidden" name="skuId" value={sku.id} />
            <input type="hidden" name="stripeEventId" value={stripeEventId} />
            <input type="hidden" name="origin" value={origin} />
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

function formatGrants(skuId: SkuId): string {
  const sku = CATALOG[skuId];
  if (sku.grants.applicationCredits) {
    return `+${sku.grants.applicationCredits} application credit${sku.grants.applicationCredits === 1 ? "" : "s"}`;
  }
  if (sku.grants.expeditedCredits) {
    return `+${sku.grants.expeditedCredits} expedited application credit`;
  }
  if (sku.grants.certBalance) {
    return `+${sku.grants.certBalance} certificates`;
  }
  return "";
}

async function currentOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

async function completeMockCheckout(formData: FormData) {
  const skuId = String(formData.get("skuId") ?? "");
  const stripeEventId = String(formData.get("stripeEventId") ?? "");
  const origin = String(formData.get("origin") ?? "");

  const user = await getCurrentUser();
  if (!user || !user.companyId) redirect("/login");

  const res = await fetch(`${origin}/api/dev/mock-stripe-webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      skuId,
      stripeEventId,
      companyId: user.companyId,
    }),
  });
  if (!res.ok) {
    throw new Error(`Mock webhook returned ${res.status}: ${await res.text()}`);
  }
  redirect("/company/billing?just=success");
}
