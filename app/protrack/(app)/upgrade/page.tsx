import { PageHeader } from "@/components/portal-shell";
import { formatPrice } from "@/lib/billing/catalog";
import { PRO_PLANS } from "@/lib/billing/pro-plans";
import { requireUser } from "@/lib/auth/session";
import { isProActive } from "@/lib/protrack/require-pro";
import {
  startProCheckout,
  cancelProSubscription,
} from "@/lib/billing/pro-checkout-actions";

const dateFmt = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
});

const FREE_FEATURES = [
  "CE dashboard with live progress",
  "Unlimited certificate uploads",
  "Automatic DentalACE certificate sync",
  "All 50-state requirements",
];

const PRO_FEATURES = [
  "Everything in Free",
  "Renewal reminders (90 / 60 / 30 / 7 days)",
  "Category-gap alerts",
  "Multi-state license tracking",
  "Audit-ready PDF export",
];

export default async function UpgradePage({
  searchParams,
}: {
  searchParams: Promise<{ gate?: string; error?: string; canceled?: string }>;
}) {
  const { gate, error, canceled } = await searchParams;
  const user = await requireUser();
  const pro = isProActive(user);

  return (
    <>
      <PageHeader
        title="ProTrack Pro"
        subtitle="Stay audit-ready and never miss a renewal deadline."
      />

      {gate === "multistate" ? (
        <p className="mb-4 rounded-md border border-ace/40 bg-ace-bg px-3 py-2 text-[12px] text-ace-dark text-pretty">
          Multi-state tracking lets you track every state or province you are
          licensed in at once. Upgrade below to unlock it.
        </p>
      ) : gate === "pro" ? (
        <p className="mb-4 rounded-md border border-ace/40 bg-ace-bg px-3 py-2 text-[12px] text-ace-dark text-pretty">
          Renewal reminders, multi-state tracking, and audit-ready exports are Pro
          features. Upgrade below to unlock them.
        </p>
      ) : null}
      {canceled ? (
        <p className="mb-4 rounded-md border border-border bg-surface px-3 py-2 text-[12px] text-text-mid">
          Your Pro plan was canceled. You are back on the Free plan.
        </p>
      ) : null}
      {error ? (
        <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">
          Something went wrong starting checkout. Please try again.
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Free */}
        <div className="rounded-xl border border-border bg-white p-6">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
            Free
          </p>
          <p className="mt-1 font-serif text-3xl font-bold text-navy tabular-nums">
            $0
          </p>
          <ul className="mt-4 space-y-2">
            {FREE_FEATURES.map((f) => (
              <li key={f} className="flex gap-2 text-[12px] text-text-mid">
                <span className="text-green-600">✓</span> {f}
              </li>
            ))}
          </ul>
          {!pro ? (
            <p className="mt-5 rounded-md border border-border bg-surface py-2 text-center text-[12px] font-semibold text-text-muted">
              Your current plan
            </p>
          ) : null}
        </div>

        {/* Pro */}
        <div className="rounded-xl border-2 border-ace bg-white p-6">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ace-dark">
              ProTrack Pro
            </p>
            {pro ? (
              <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-[10px] font-semibold text-green-700">
                Active
              </span>
            ) : null}
          </div>

          <ul className="mt-4 space-y-2">
            {PRO_FEATURES.map((f) => (
              <li key={f} className="flex gap-2 text-[12px] text-navy">
                <span className="text-ace-dark">✓</span> {f}
              </li>
            ))}
          </ul>

          {pro ? (
            <div className="mt-5 border-t border-border pt-4">
              <p className="text-[12px] text-text-mid text-pretty">
                Active{" "}
                {user.proExpiresAt
                  ? `until ${dateFmt.format(user.proExpiresAt)}`
                  : ""}
                .
              </p>
              <form action={cancelProSubscription} className="mt-3">
                <button
                  type="submit"
                  className="rounded-md border border-border bg-white px-4 py-2 text-[12px] font-semibold text-navy transition-colors hover:bg-surface"
                >
                  Cancel subscription
                </button>
              </form>
            </div>
          ) : (
            <div className="mt-5 space-y-2 border-t border-border pt-4">
              <form action={startProCheckout}>
                <input type="hidden" name="planId" value={PRO_PLANS.pro_annual.id} />
                <button
                  type="submit"
                  className="flex w-full items-center justify-between rounded-md bg-navy px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-navy/90"
                >
                  <span>Go Pro · Annual</span>
                  <span className="tabular-nums">
                    {formatPrice(PRO_PLANS.pro_annual.amountCents)}/yr
                  </span>
                </button>
              </form>
              <form action={startProCheckout}>
                <input
                  type="hidden"
                  name="planId"
                  value={PRO_PLANS.pro_monthly.id}
                />
                <button
                  type="submit"
                  className="flex w-full items-center justify-between rounded-md border border-border bg-white px-4 py-2.5 text-[13px] font-semibold text-navy transition-colors hover:bg-surface"
                >
                  <span>Go Pro · Monthly</span>
                  <span className="tabular-nums">
                    {formatPrice(PRO_PLANS.pro_monthly.amountCents)}/mo
                  </span>
                </button>
              </form>
              <p className="pt-1 text-center text-[10px] text-text-muted">
                Annual saves about{" "}
                {formatPrice(
                  PRO_PLANS.pro_monthly.amountCents * 12 -
                    PRO_PLANS.pro_annual.amountCents,
                )}{" "}
                a year.
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
