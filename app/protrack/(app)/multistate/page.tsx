import Link from "next/link";
import { PageHeader } from "@/components/portal-shell";
import { ProgressBar } from "@/components/protrack/progress-bar";
import { requireUser } from "@/lib/auth/session";
import { isProActive } from "@/lib/protrack/require-pro";
import { prisma } from "@/lib/prisma";
import { LicenseType } from "@prisma/client";
import {
  LICENSE_TYPE_OPTIONS,
  licenseTypeShort,
  stateName,
} from "@/lib/protrack/reference";
import { JurisdictionOptions } from "@/components/jurisdiction-options";
import {
  computeRequirementProgress,
  formatHours,
  parseCategories,
  type ProgressCertificate,
} from "@/lib/protrack/progress";
import { addStateLicense } from "@/lib/protrack/license-actions";

const dateFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const fieldClass =
  "w-full rounded-md border border-border bg-white px-3 py-2 text-[13px] text-navy outline-none focus:border-ace";

/*
  Pro-gated multi-state tracking. One progress tracker per license; certificates
  count toward every state whose requirements list their category. Mirrors
  logic/protrack-dev-mockup-suite.html #multistate.
*/
export default async function MultiStatePage({
  searchParams,
}: {
  searchParams: Promise<{ added?: string; error?: string }>;
}) {
  const user = await requireUser();
  const { added, error } = await searchParams;

  // Multi-state tracking stays a Pro feature. Rather than bounce Free users
  // away (Row 15: "how do they upgrade?"), show a teaser with a clear upgrade
  // CTA. The add-state action is still Pro-gated server-side.
  if (!isProActive(user)) {
    return <MultiStateUpsell />;
  }

  const [licenses, certRows, requirements] = await Promise.all([
    prisma.userLicense.findMany({
      where: { licenseeId: user.id },
      orderBy: [{ isPrimary: "desc" }, { state: "asc" }],
    }),
    prisma.ceCertificate.findMany({
      where: { licenseeId: user.id },
      select: { category: true, hours: true, deliveryFormat: true },
    }),
    prisma.stateRequirement.findMany(),
  ]);

  const certs: ProgressCertificate[] = certRows.map((c) => ({
    category: c.category,
    hours: Number(c.hours),
    deliveryFormat: c.deliveryFormat,
  }));
  const reqMap = new Map(
    requirements.map((r) => [`${r.state}:${r.licenseType}`, r]),
  );

  return (
    <>
      <PageHeader
        title="Multi-State Tracking"
        subtitle="Track CE compliance for every state you are licensed in, at once."
      />

      {added ? (
        <p className="mb-4 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-[12px] text-green-700">
          State license added.
        </p>
      ) : null}
      {error ? (
        <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">
          {error === "duplicate"
            ? "You already track that state and license type."
            : "Please check the license details and try again."}
        </p>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-2">
        {licenses.map((license) => {
          const requirement = reqMap.get(
            `${license.state}:${license.licenseType}`,
          );
          const progress = requirement
            ? computeRequirementProgress(
                {
                  totalHours: Number(requirement.totalHours),
                  categories: parseCategories(requirement.categories),
                },
                certs,
              )
            : null;

          const status = !progress
            ? { label: "No data", tone: "muted" as const }
            : progress.remaining <= 0
              ? { label: "On Track", tone: "green" as const }
              : progress.categories.some((c) => c.status === "not_started")
                ? { label: "Needs Attention", tone: "red" as const }
                : { label: "In Progress", tone: "ace" as const };

          const gaps = progress
            ? progress.categories.filter((c) => c.needed > 0).map((c) => c.name)
            : [];

          return (
            <div
              key={license.id}
              className="rounded-lg border border-border bg-white p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-serif text-lg font-semibold text-navy">
                    {stateName(license.state)}
                    {license.isPrimary ? (
                      <span className="ml-2 rounded-full bg-ace-bg px-2 py-0.5 align-middle text-[9px] font-semibold text-ace-dark">
                        Primary
                      </span>
                    ) : null}
                  </p>
                  <p className="text-[11px] text-text-muted">
                    {licenseTypeShort(license.licenseType)} ·{" "}
                    {license.licenseNumber} · renews{" "}
                    {dateFmt.format(license.renewalDate)}
                  </p>
                </div>
                <StatusPill label={status.label} tone={status.tone} />
              </div>

              {progress ? (
                <>
                  <ProgressBar
                    className="mt-3"
                    value={progress.pct}
                    tone={status.tone === "muted" ? "ace" : status.tone}
                    label={`${stateName(license.state)} progress`}
                  />
                  <p className="mt-2 text-[11px] text-text-muted tabular-nums">
                    {formatHours(progress.totalCompleted)} of{" "}
                    {formatHours(progress.totalRequired)} hours
                  </p>
                  {gaps.length > 0 ? (
                    <p className="mt-1 text-[11px] text-red-600 text-pretty">
                      ⚠ Still need: {gaps.join(", ")}
                    </p>
                  ) : (
                    <p className="mt-1 text-[11px] text-green-700">
                      ✓ All categories complete
                    </p>
                  )}
                </>
              ) : (
                <p className="mt-3 text-[11px] text-text-muted text-pretty">
                  Requirements for this state are not loaded yet. Your
                  certificates are still saved.
                </p>
              )}
            </div>
          );
        })}

        {/* Add state license */}
        <form
          action={addStateLicense}
          className="flex flex-col gap-2 rounded-lg border border-dashed border-border bg-white p-4"
        >
          <p className="text-[13px] font-semibold text-navy">
            🌐 Add a state or province license
          </p>
          <select name="state" className={fieldClass} defaultValue="" required>
            <option value="" disabled>
              State/Province
            </option>
            <JurisdictionOptions />
          </select>
          <select
            name="licenseType"
            className={fieldClass}
            defaultValue={LicenseType.RDH}
            required
          >
            {LICENSE_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <input
            name="licenseNumber"
            placeholder="License number"
            className={fieldClass}
            required
          />
          <button
            type="submit"
            className="mt-1 rounded-md bg-navy px-4 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-navy/90"
          >
            Add license
          </button>
        </form>
      </div>
    </>
  );
}

function MultiStateUpsell() {
  return (
    <>
      <PageHeader
        title="Multi-State Tracking"
        subtitle="Track CE compliance for every state or province you are licensed in, at once."
      />
      <div className="mx-auto max-w-xl rounded-xl border-2 border-ace bg-white p-6 text-center">
        <p className="text-2xl">🌐</p>
        <p className="mt-2 font-serif text-lg font-bold text-navy">
          Licensed in more than one state or province?
        </p>
        <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-text-mid">
          ProTrack Pro tracks every jurisdiction you hold a license in side by
          side, so a single certificate counts toward each one automatically.
          Multi-state tracking is a Pro feature.
        </p>
        <Link
          href="/protrack/upgrade?gate=multistate"
          className="mt-5 inline-block rounded-md bg-navy px-5 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-navy/90"
        >
          Upgrade to add multi-state
        </Link>
      </div>
    </>
  );
}

function StatusPill({
  label,
  tone,
}: {
  label: string;
  tone: "green" | "red" | "ace" | "muted";
}) {
  const cls = {
    green: "bg-green-100 text-green-700",
    red: "bg-red-100 text-red-600",
    ace: "bg-ace-bg text-ace-dark",
    muted: "bg-surface-2 text-text-muted",
  }[tone];
  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${cls}`}
    >
      {label}
    </span>
  );
}
