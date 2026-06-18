import { PageHeader } from "@/components/portal-shell";
import { requireDentalAce } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { AppCoursePurchase } from "@/components/billing/app-course-purchase";

/*
  Buy Application Credits page. Course applications use the volume-tiered
  quantity picker (AppCoursePurchase), which starts the checkout flow — mock or
  real depending on env.
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
        },
      })
    : null;
  const total = company?.applicationCredits ?? 0;

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
          review. Pricing is per course and drops with volume.
        </p>
      </div>

      <AppCoursePurchase />

      <p className="mt-6 text-center text-[10px] text-text-muted">
        Powered by Stripe · Secure checkout
      </p>
    </>
  );
}
