import { PageHeader } from "@/components/portal-shell";
import { ProgressBar } from "@/components/protrack/progress-bar";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { LicenseType } from "@prisma/client";
import {
  STATE_CODES,
  US_STATES,
  licenseTypeLong,
  stateName,
} from "@/lib/protrack/reference";
import {
  computeRequirementProgress,
  formatHours,
  formatLabel,
  parseCategories,
  type ProgressCertificate,
} from "@/lib/protrack/progress";

/*
  50-state CE requirements browser. Shows the requirements for the licensee's
  license type across every state. Only states with loaded requirements show
  hours; the rest are pending John's authoritative file. Mirrors
  logic/protrack-dev-mockup-suite.html #states.
*/
export default async function StatesPage() {
  const user = await requireUser();

  const primary = await prisma.userLicense.findFirst({
    where: { licenseeId: user.id, isPrimary: true },
    select: { state: true, licenseType: true },
  });
  const licenseType = primary?.licenseType ?? LicenseType.RDH;
  const primaryState = primary?.state ?? null;

  const requirements = await prisma.stateRequirement.findMany({
    where: { licenseType },
  });
  const byState = new Map(requirements.map((r) => [r.state, r]));

  // The licensee's certificates, to show real progress on their primary state.
  const certs = primaryState
    ? await prisma.ceCertificate.findMany({
        where: { licenseeId: user.id },
        select: { category: true, hours: true, deliveryFormat: true },
      })
    : [];

  const primaryReq = primaryState ? byState.get(primaryState) : null;

  return (
    <>
      <PageHeader
        title="State CE Requirements"
        subtitle={`Continuing-education requirements for a ${licenseTypeLong(
          licenseType,
        )} across all 50 states. Select your state to see the full breakdown.`}
      />

      <p className="mb-4 rounded-md border border-ace/40 bg-ace-bg px-3 py-2 text-[11px] text-ace-dark text-pretty">
        Requirements are provisional and being confirmed board by board. Loaded
        states show real numbers; the rest are coming soon. ProTrack tracks your
        hours; it does not certify compliance.
      </p>

      {primaryReq ? (
        <PrimaryStateCard
          state={primaryReq.state}
          licenseType={licenseType}
          totalHours={Number(primaryReq.totalHours)}
          cycleMonths={primaryReq.cycleMonths}
          categoriesJson={primaryReq.categories}
          certs={certs.map((c) => ({
            category: c.category,
            hours: Number(c.hours),
            deliveryFormat: c.deliveryFormat,
          }))}
        />
      ) : null}

      <h2 className="mb-2 mt-6 text-[12px] font-semibold uppercase tracking-wide text-text-muted">
        All states
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {STATE_CODES.map((code) => {
          const req = byState.get(code);
          const isPrimary = code === primaryState;
          return (
            <div
              key={code}
              className={`rounded-lg border bg-white p-3 ${
                isPrimary ? "border-ace ring-1 ring-ace/40" : "border-border"
              }`}
            >
              <div className="flex items-center justify-between">
                <p className="text-[13px] font-semibold text-navy">
                  {US_STATES[code]}
                </p>
                {isPrimary ? (
                  <span className="rounded-full bg-ace-bg px-2 py-0.5 text-[9px] font-semibold text-ace-dark">
                    Your state
                  </span>
                ) : null}
              </div>
              {req ? (
                <p className="mt-1 text-[11px] text-text-mid tabular-nums">
                  {formatHours(Number(req.totalHours))} hrs ·{" "}
                  {cycleLabel(req.cycleMonths)}
                </p>
              ) : (
                <p className="mt-1 text-[11px] text-text-muted">Not yet loaded</p>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

function cycleLabel(months: number): string {
  if (months === 12) return "Annual";
  return `${Math.round(months / 12)}-year cycle`;
}

function PrimaryStateCard({
  state,
  licenseType,
  totalHours,
  cycleMonths,
  categoriesJson,
  certs,
}: {
  state: string;
  licenseType: LicenseType;
  totalHours: number;
  cycleMonths: number;
  categoriesJson: unknown;
  certs: ProgressCertificate[];
}) {
  const categories = parseCategories(categoriesJson);
  const progress = computeRequirementProgress({ totalHours, categories }, certs);

  return (
    <section className="rounded-lg border border-ace/50 bg-ace-bg/40 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-serif text-lg font-semibold text-navy">
          📍 {stateName(state)}, {licenseTypeLong(licenseType)}
        </p>
        <p className="text-[11px] text-text-muted tabular-nums">
          {formatHours(totalHours)} hours · {cycleLabel(cycleMonths)}
        </p>
      </div>
      <ul className="mt-3 divide-y divide-border/70">
        {progress.categories.map((cat) => (
          <li
            key={cat.name}
            className="flex items-center justify-between gap-4 py-2"
          >
            <div className="min-w-0">
              <p className="truncate text-[12px] font-medium text-navy">
                {cat.name}
              </p>
              <p className="text-[10px] text-text-muted">
                {formatHours(cat.required)} hrs · {formatLabel(cat.format)}
              </p>
            </div>
            <div className="flex w-40 shrink-0 items-center gap-2">
              <ProgressBar
                value={cat.required > 0 ? (cat.completed / cat.required) * 100 : 0}
                tone={
                  cat.status === "complete"
                    ? "green"
                    : cat.status === "not_started"
                      ? "red"
                      : "ace"
                }
                label={`${cat.name} progress`}
              />
              <span className="w-12 shrink-0 text-right text-[10px] tabular-nums text-text-muted">
                {formatHours(cat.earned)}/{formatHours(cat.required)}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
