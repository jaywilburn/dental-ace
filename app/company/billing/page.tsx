import { PageHeader } from "@/components/portal-shell";
import { requireDentalAce } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

/*
  Billing History — paginated table of all billing_transactions rows for the
  company. For Phase 1 we render the most recent 50 in one page; pagination
  drops in when there's more than a screen of data.
*/

export default async function BillingHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ just?: string }>;
}) {
  const user = await requireDentalAce();
  const { just } = await searchParams;

  if (!user.companyId) {
    return (
      <PageHeader
        title="Billing History"
        subtitle="No company is linked to your account."
      />
    );
  }

  const txns = await prisma.billingTransaction.findMany({
    where: { companyId: user.companyId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <>
      <PageHeader
        title="Billing History"
        subtitle="All Stripe transactions on this company · Most recent first"
      />

      {just === "success" ? (
        <div className="mb-4 rounded-md border border-emerald-400 bg-emerald-50 px-4 py-2.5 text-[13px] text-emerald-700">
          ✓ Payment successful. Your balance has been updated.
        </div>
      ) : null}

      <div className="overflow-hidden rounded-lg border border-border bg-white">
        {txns.length === 0 ? (
          <p className="px-4 py-8 text-center text-[12px] text-text-muted">
            No billing transactions yet. Visit Buy App Credits or Buy Cert Bundles
            to get started.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-border bg-surface text-left text-[10px] uppercase tracking-wide text-text-muted">
                  <th className="px-4 py-2 font-semibold">Date</th>
                  <th className="px-4 py-2 font-semibold">Type</th>
                  <th className="px-4 py-2 font-semibold">Description</th>
                  <th className="px-4 py-2 text-right font-semibold">Amount</th>
                  <th className="px-4 py-2 font-semibold">Receipt</th>
                </tr>
              </thead>
              <tbody>
                {txns.map((txn) => (
                  <tr key={txn.id} className="border-b border-border last:border-b-0">
                    <td className="px-4 py-2 text-text-muted">
                      {new Intl.DateTimeFormat("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      }).format(txn.createdAt)}
                    </td>
                    <td className="px-4 py-2 font-medium text-navy">
                      {labelFor(txn.type)}
                    </td>
                    <td className="px-4 py-2 text-text-mid">
                      {txn.quantity}{" "}
                      {txn.type === "CERT_BUNDLE" ? "certificates" : "credits"}
                    </td>
                    <td className="px-4 py-2 text-right font-medium text-navy tabular-nums">
                      {txn.amountCents > 0
                        ? `$${(txn.amountCents / 100).toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                          })}`
                        : "—"}
                    </td>
                    <td className="px-4 py-2 text-text-muted">
                      {txn.stripePaymentId ? (
                        <code className="font-mono text-[10px]">
                          {txn.stripePaymentId.slice(0, 14)}…
                        </code>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

function labelFor(type: string): string {
  switch (type) {
    case "APP_CREDIT":
      return "Application credits";
    case "CERT_BUNDLE":
      return "Certificate bundle";
    case "ADMIN_OVERRIDE":
      return "Admin override";
    default:
      return type;
  }
}
