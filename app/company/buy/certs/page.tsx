import { PageHeader } from "@/components/portal-shell";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { CERT_BUNDLE_SKUS, formatPrice } from "@/lib/billing/catalog";
import { startCheckout } from "@/lib/billing/start-checkout";
import { cn } from "@/lib/utils";

/*
  Buy Certificate Bundles page. Renders the six cert-bundle SKUs. The 750-pack
  carries the "BEST VALUE" badge. Mirrors logic/dentalace-dev-mockup-suite-v3.html
  #co-buycerts.
*/
export default async function BuyCertsPage() {
  const user = await requireRole("CUSTOMER");
  const certBalance = user.companyId
    ? (
        await prisma.company.findUnique({
          where: { id: user.companyId },
          select: { certBalance: true },
        })
      )?.certBalance ?? 0
    : 0;

  return (
    <>
      <PageHeader
        title="Buy Certificate Bundles"
        subtitle={`Current balance: ${certBalance} certificate${certBalance === 1 ? "" : "s"} · Certificates never expire · Shared across all courses`}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {CERT_BUNDLE_SKUS.map((sku) => (
          <form key={sku.id} action={startCheckout}>
            <input type="hidden" name="skuId" value={sku.id} />
            <button
              type="submit"
              className={cn(
                "relative block w-full rounded-lg border bg-white p-4 text-left transition-colors hover:border-navy/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ace focus-visible:ring-offset-2",
                sku.badge && "border-2 border-ace bg-ace-bg",
                !sku.badge && "border-border",
              )}
            >
              {sku.badge ? (
                <span className="absolute -top-2 right-3 rounded-full bg-ace px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-navy">
                  {sku.badge}
                </span>
              ) : null}
              <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                {sku.name}
              </p>
              <p className="mt-1 font-serif text-3xl font-bold text-navy tabular-nums">
                {formatPrice(sku.amountCents)}
              </p>
              <p className="mt-2 text-[11px] text-text-muted">{sku.blurb}</p>
            </button>
          </form>
        ))}
      </div>

      <div className="mt-6 rounded-lg border border-ace bg-ace-bg p-4">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ace-dark">
          10 Stripe products total
        </p>
        <p className="text-[12px] leading-relaxed text-text-mid">
          4 application credit tiers + 6 certificate bundles. The webhook handler
          identifies each SKU and applies the right balance grant atomically.
        </p>
      </div>
    </>
  );
}
