import type { Metadata } from "next";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  APP_CREDIT_SKUS,
  CERT_BUNDLE_SKUS,
  formatPrice,
  type Sku,
} from "@/lib/billing/catalog";
import { PageHero } from "@/components/marketing/page-hero";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "DentalACE pricing: pay per course application plus certificate bundles, with no subscription. ProTrack is free for dental professionals. Verify is provisioned for state boards.",
};

/*
  Prices render live from lib/billing/catalog.ts (the single source of truth for
  what we sell) so this page can never drift from billing. Buying happens inside
  the company portal, so every DentalACE card routes to /company.
*/

function SkuCard({ sku }: { sku: Sku }) {
  const featured = Boolean(sku.badge);
  return (
    <div
      className={cn(
        "relative flex flex-col rounded-2xl border bg-white p-6",
        featured ? "border-ace shadow-lg" : "border-border",
      )}
    >
      {sku.badge ? (
        <span className="absolute -top-2.5 left-6 rounded-full bg-ace px-2.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[1.5px] text-navy">
          {sku.badge}
        </span>
      ) : null}
      <p className="mb-1 text-sm font-semibold text-navy">{sku.name}</p>
      <p className="mb-1 font-serif text-3xl font-bold text-navy">
        {formatPrice(sku.amountCents)}
      </p>
      {sku.blurb ? (
        <p className="mb-5 text-xs leading-relaxed text-text-muted">
          {sku.blurb}
        </p>
      ) : (
        <div className="mb-5" />
      )}
      <Link
        href="/company"
        className="mt-auto rounded-lg bg-navy px-4 py-2 text-center text-[13px] font-semibold text-white transition-colors hover:bg-navy/90"
      >
        Buy in your portal
      </Link>
    </div>
  );
}

export default function PricingPage() {
  return (
    <>
      <PageHero
        eyebrow="Simple, usage-based pricing"
        title={
          <>
            Pay for what you <span className="text-ace-light">use</span>
          </>
        }
        sub="No subscriptions. CE providers pay per course application and buy certificate bundles as they grow. Dental professionals use ProTrack free. State boards are provisioned directly by the AADB."
      />

      {/* DentalACE pricing */}
      <section className="bg-white px-5 py-16 md:px-10 md:py-20">
        <div className="mx-auto max-w-[1040px]">
          <div className="mb-10 text-center">
            <p className="mb-2 font-mono text-[10px] uppercase tracking-[2.5px] text-ace-dark">
              DentalACE · For CE providers
            </p>
            <h2 className="text-balance font-serif text-3xl font-bold text-navy md:text-[34px]">
              Course applications
            </h2>
            <p className="mx-auto mt-2 max-w-[520px] text-pretty text-sm text-text-muted">
              One credit covers one course application through AADB review. Buy
              in bulk to lower your per-credit cost, or add expedited review
              when you are on a deadline.
            </p>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {APP_CREDIT_SKUS.map((sku) => (
              <SkuCard key={sku.id} sku={sku} />
            ))}
          </div>

          <div className="mb-10 mt-16 text-center">
            <h2 className="text-balance font-serif text-3xl font-bold text-navy md:text-[34px]">
              Certificate bundles
            </h2>
            <p className="mx-auto mt-2 max-w-[520px] text-pretty text-sm text-text-muted">
              Certificates are issued to attendees from your balance. The larger
              the bundle, the lower the per-certificate cost.
            </p>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {CERT_BUNDLE_SKUS.map((sku) => (
              <SkuCard key={sku.id} sku={sku} />
            ))}
          </div>
        </div>
      </section>

      {/* ProTrack + Verify */}
      <section className="bg-surface px-5 py-16 md:px-10 md:py-20">
        <div className="mx-auto grid max-w-[840px] gap-6 md:grid-cols-2">
          <div className="flex flex-col rounded-2xl border border-pro/30 bg-white p-7">
            <p className="mb-2 font-mono text-[10px] uppercase tracking-[2px] text-pro-dark">
              ProTrack · For dental professionals
            </p>
            <p className="mb-1 font-serif text-3xl font-bold text-pro">
              Free forever
            </p>
            <p className="mb-5 text-sm leading-relaxed text-text-mid">
              Dentists, hygienists, and dental assistants track CE hours across
              all 50 states at no cost. DentalACE certificates sync
              automatically, and you can upload CE from any provider.
            </p>
            <Link
              href="/signup"
              className="mt-auto rounded-lg bg-pro px-4 py-2 text-center text-[13px] font-semibold text-white transition-colors hover:bg-pro-dark"
            >
              Create free account
            </Link>
          </div>
          <div className="flex flex-col rounded-2xl border border-ver/30 bg-white p-7">
            <p className="mb-2 font-mono text-[10px] uppercase tracking-[2px] text-ver-dark">
              Verify · For state boards
            </p>
            <p className="mb-1 font-serif text-3xl font-bold text-ver">
              Board-provisioned
            </p>
            <p className="mb-5 text-sm leading-relaxed text-text-mid">
              Verify is provisioned directly by the AADB for state dental
              boards. Pricing is arranged per board. Reach out and we will set up
              access for your jurisdiction.
            </p>
            <Link
              href="/verify/contact"
              className="mt-auto rounded-lg bg-ver px-4 py-2 text-center text-[13px] font-semibold text-white transition-colors hover:bg-ver-dark"
            >
              Request board access
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
