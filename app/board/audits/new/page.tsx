import { PageHeader } from "@/components/portal-shell";
import { requireBoard } from "@/lib/board/scope";
import { prisma } from "@/lib/prisma";
import { runAudit } from "@/lib/board/audits/run";
import { LicenseType } from "@prisma/client";
import { parseStoredSettings } from "@/lib/board/settings/schema";

/*
  /board/audits/new — single-page form to configure a random audit.

  Inputs:
   - samplePercent (radio, 10/15/20/25)
   - licenseType (select, ALL or DDS_DMD/RDH/DA)
   - renewalCycle (free-text label — not used for filtering today)
   - name (free-text, required)

  Submit posts to the runAudit server action, which transactionally creates
  the batch + selections + deficiencies and redirects to /board/audits/[id].
*/

const SAMPLES = [10, 15, 20, 25] as const;

const LICENSE_LABELS: Record<LicenseType | "ALL", string> = {
  ALL: "All license types",
  DDS_DMD: "Dentist (DDS/DMD)",
  RDH: "Hygienist (RDH)",
  DA: "Assistant (DA)",
};

const fieldClass =
  "w-full rounded-md border border-border bg-white px-3 py-2 text-[13px] text-navy outline-none focus:border-ver";
const labelClass = "mb-1 block text-[11px] font-semibold text-text-mid";

export default async function NewAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { board } = await requireBoard();
  const { error } = await searchParams;
  const settings = parseStoredSettings(board.settings);

  // Counts per license type so the form can preview the audit size before
  // submission. Counts are scoped to the board's state.
  const counts = await prisma.userLicense.groupBy({
    by: ["licenseType"],
    where: { state: board.state },
    _count: { _all: true },
  });
  const totalCount = counts.reduce((acc, c) => acc + c._count._all, 0);

  // Snap the saved default (5-50) to the closest of the four radio options.
  const defaultSample = SAMPLES.reduce((best, s) =>
    Math.abs(s - settings.defaultSamplePercent) <
    Math.abs(best - settings.defaultSamplePercent)
      ? s
      : best,
  );

  return (
    <>
      <PageHeader
        title="Run an audit"
        subtitle={`Pick a sample size and license type. Verify will snapshot CE compliance for the selected licensees in ${board.state}.`}
      />

      {error ? (
        <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700 text-pretty">
          {error}
        </p>
      ) : null}

      <form action={runAudit} className="space-y-6 rounded-lg border border-border bg-white p-6">
        <div>
          <label className={labelClass}>Audit name</label>
          <input
            name="name"
            className={fieldClass}
            placeholder="Spring 2026 audit"
            required
            minLength={3}
            maxLength={120}
          />
        </div>

        <div>
          <label className={labelClass}>Renewal cycle</label>
          <input
            name="renewalCycle"
            className={fieldClass}
            placeholder="2024-2026"
            required
            minLength={1}
            maxLength={40}
            defaultValue="2024-2026"
          />
          <p className="mt-1 text-[10px] text-text-muted">
            Labels the batch. Cycle-based filtering is a follow-up; today the
            audit includes every licensee matching the license-type filter.
          </p>
        </div>

        <div>
          <label className={labelClass}>License type</label>
          <select
            name="licenseType"
            className={fieldClass}
            defaultValue="ALL"
          >
            <option value="ALL">
              {LICENSE_LABELS.ALL} — {totalCount} licensees
            </option>
            {counts.map((c) => (
              <option key={c.licenseType} value={c.licenseType}>
                {LICENSE_LABELS[c.licenseType]} — {c._count._all} licensees
              </option>
            ))}
          </select>
        </div>

        <fieldset>
          <legend className={labelClass}>Sample size</legend>
          <div className="grid grid-cols-4 gap-2">
            {SAMPLES.map((pct) => (
              <label
                key={pct}
                className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-border bg-white px-3 py-2 text-[12px] font-semibold text-navy transition hover:border-ver has-[:checked]:border-ver has-[:checked]:bg-ver/5"
              >
                <input
                  type="radio"
                  name="samplePercent"
                  value={pct}
                  defaultChecked={pct === defaultSample}
                  className="accent-ver"
                />
                {pct}%
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex items-center justify-between border-t border-border pt-4">
          <p className="text-[11px] text-text-muted">
            Selection uses a Fisher–Yates shuffle and snapshots CE state at
            audit time. Selected licensees can&apos;t change the result after the
            fact, even if they upload new certificates.
          </p>
          <button
            type="submit"
            className="rounded-md bg-ver px-4 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-ver/90"
          >
            🎲 Run audit
          </button>
        </div>
      </form>
    </>
  );
}
