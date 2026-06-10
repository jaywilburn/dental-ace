"use client";

import { useState } from "react";
import { startCheckout } from "@/lib/billing/start-checkout";
import {
  APP_COURSE_TIERS,
  MAX_APP_COURSE_QTY,
  appCourseTotalCents,
  appCourseUnitCents,
  clampAppCourseQty,
  formatPrice,
  formatWholePrice,
} from "@/lib/billing/catalog";
import { cn } from "@/lib/utils";

/*
  Quantity picker for course-application credits. Shows the volume tier table,
  highlights the tier the chosen quantity lands in, and previews the unit price
  and total. The price shown here is cosmetic; the webhook recomputes the total
  from the same catalog tiers server-side.
*/
export function AppCoursePurchase() {
  const [qty, setQty] = useState(1);
  const clamped = clampAppCourseQty(qty);
  const unit = appCourseUnitCents(clamped);
  const total = appCourseTotalCents(clamped);
  const activeTier = APP_COURSE_TIERS.reduce(
    (acc, tier) => (clamped >= tier.minQty ? tier : acc),
    APP_COURSE_TIERS[0],
  );

  return (
    <div className="rounded-lg border border-ace bg-white p-5">
      <p className="text-[13px] font-semibold text-navy">Course Applications</p>
      <p className="mt-1 text-[11px] text-text-muted">
        Standard review · ~10 business days · the more courses you buy, the
        lower the per-course price
      </p>

      <ul className="mt-4 divide-y divide-border rounded-md border border-border text-[12px]">
        {APP_COURSE_TIERS.map((tier) => (
          <li
            key={tier.minQty}
            className={cn(
              "flex items-center justify-between px-3 py-2",
              tier.minQty === activeTier.minQty
                ? "bg-ace-bg font-semibold text-ace-dark"
                : "text-text-mid",
            )}
          >
            <span>{tier.label}</span>
            <span className="tabular-nums">
              {formatWholePrice(tier.unitCents)} per course
            </span>
          </li>
        ))}
      </ul>

      <form action={startCheckout} className="mt-4">
        <input type="hidden" name="skuId" value="app_course" />
        <div className="flex flex-wrap items-end gap-4">
          <label className="block text-[11px] font-semibold text-text-mid">
            Number of courses
            <input
              type="number"
              name="quantity"
              min={1}
              max={MAX_APP_COURSE_QTY}
              value={qty}
              onChange={(e) => setQty(Number(e.target.value))}
              onBlur={() => setQty(clamped)}
              className="mt-1 block w-28 rounded-md border border-border bg-white px-3 py-2 text-[14px] text-navy tabular-nums outline-none focus:border-ace"
            />
          </label>
          <div className="min-w-32">
            <p className="text-[11px] text-text-muted">
              {formatPrice(unit)} per course
            </p>
            <p className="font-serif text-2xl font-bold text-navy tabular-nums">
              {formatPrice(total)}
            </p>
          </div>
          <button
            type="submit"
            className="ml-auto rounded-md bg-navy px-5 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-navy/90"
          >
            Continue to checkout
          </button>
        </div>
      </form>
    </div>
  );
}
