import { PageHeader } from "@/components/portal-shell";
import { requireDentalAce } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { CATALOG, formatPrice } from "@/lib/billing/catalog";
import { startCheckout } from "@/lib/billing/start-checkout";
import { AppCoursePurchase } from "@/components/billing/app-course-purchase";

/*
  Buy Application Credits page. Course applications use the volume-tiered
  quantity picker (AppCoursePurchase); the expedited add-on stays a fixed SKU.
  Both start the checkout flow — mock or real depending on env.
*/
export default async function BuyCreditsPage({
  searchParams,
}: {
  searchParams: Promise<{ need?: string }>;
}) {
  const user = await requireDentalAce();
  const { need } = await searchParams;
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

  const expedited = CATALOG.app_1_exp;

  return (
    <>
      <PageHeader
        title="Buy Application Credits"
        subtitle={`Current balance: ${total} credit${total === 1 ? "" : "s"} · Credits never expire`}
      />

      {need === "credits" ? (
        <div className="mb-4 rounded-md border border-ace bg-ace-bg px-4 py-2.5 text-[13px] text-ace-dark">
          You need at least one application credit before you can start a new
          application. Pick a quantity below to get going.
        </div>
      ) : null}

      <div className="mb-5 rounded-lg border border-ace bg-ace-bg p-4">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ace-dark">
          What is an Application Credit?
        </p>
        <p className="text-[12px] leading-relaxed text-text-mid">
          Each credit allows you to submit one course for AADB accreditation
          review. Pricing is per course and drops with volume. Need a faster
          decision? The expedited option below includes priority review (~3
          business days vs ~10 for standard).
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <AppCoursePurchase />

        <form action={startCheckout}>
          <input type="hidden" name="skuId" value={expedited.id} />
          <button
            type="submit"
            className="block h-full w-full rounded-lg border border-border bg-white p-5 text-left transition-colors hover:border-navy/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ace focus-visible:ring-offset-2"
          >
            <p className="text-[13px] font-semibold text-navy">{expedited.name}</p>
            <p className="mt-2 font-serif text-3xl font-bold text-navy tabular-nums">
              {formatPrice(expedited.amountCents)}
            </p>
            <p className="mt-2 text-[11px] text-text-muted">{expedited.blurb}</p>
          </button>
        </form>
      </div>

      <p className="mt-6 text-center text-[10px] text-text-muted">
        Powered by Stripe · Secure checkout
      </p>
    </>
  );
}
