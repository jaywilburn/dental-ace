import { PageHeader } from "@/components/portal-shell";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { APP_CREDIT_SKUS, formatPrice } from "@/lib/billing/catalog";
import { startCheckout } from "@/lib/billing/start-checkout";
import { cn } from "@/lib/utils";

/*
  Buy Application Credits page. Renders the four app-credit SKUs from the
  catalog. Each form button starts the checkout flow — mock or real depending
  on env. The $549/5-pack carries the "MOST POPULAR" badge defined in catalog.
*/
export default async function BuyCreditsPage() {
  const user = await requireRole("CUSTOMER");
  const company = user.companyId
    ? await prisma.company.findUnique({
        where: { id: user.companyId },
        select: {
          applicationCredits: true,
          expeditedCredits: true,
        },
      })
    : null;
  const total =
    (company?.applicationCredits ?? 0) + (company?.expeditedCredits ?? 0);

  return (
    <>
      <PageHeader
        title="Buy Application Credits"
        subtitle={`Current balance: ${total} credit${total === 1 ? "" : "s"} · Credits expire 1 year from purchase`}
      />

      <div className="mb-5 rounded-lg border border-ace bg-ace-bg p-4">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ace-dark">
          What is an Application Credit?
        </p>
        <p className="text-[12px] leading-relaxed text-text-mid">
          Each credit allows you to submit one course for AADB accreditation
          review. The Expedited add-on is bundled into the $219 SKU below for
          faster turnaround (~3 business days vs ~10 for standard).
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {APP_CREDIT_SKUS.map((sku) => (
          <form key={sku.id} action={startCheckout}>
            <input type="hidden" name="skuId" value={sku.id} />
            <button
              type="submit"
              className={cn(
                "block w-full rounded-lg border bg-white p-4 text-left transition-colors hover:border-navy/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ace focus-visible:ring-offset-2",
                sku.badge && "border-ace bg-ace-bg/30",
                !sku.badge && "border-border",
              )}
            >
              {sku.badge ? (
                <span className="mb-1 inline-block text-[9px] font-bold uppercase tracking-wider text-ace-dark">
                  ★ {sku.badge}
                </span>
              ) : null}
              <p className="text-[12px] font-semibold text-navy">{sku.name}</p>
              <p className="mt-2 font-serif text-3xl font-bold text-navy tabular-nums">
                {formatPrice(sku.amountCents)}
              </p>
              <p className="mt-2 text-[11px] text-text-muted">{sku.blurb}</p>
            </button>
          </form>
        ))}
      </div>

      <p className="mt-6 text-center text-[10px] text-text-muted">
        Powered by Stripe · Secure checkout
      </p>
    </>
  );
}
