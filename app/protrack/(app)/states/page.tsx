import { PageHeader } from "@/components/portal-shell";
import { ProgressBar } from "@/components/protrack/progress-bar";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { LicenseType } from "@prisma/client";
import { US_STATES, licenseTypeLong, stateName } from "@/lib/protrack/reference";
import {
  computeRequirementProgress,
  formatHours,
  formatLabel,
  parseCategories,
  type ProgressCertificate,
} from "@/lib/protrack/progress";

/*
  CE requirements for the licensee's own states. Scoped to the states where
  the user holds a license (client feedback, 2026-06: showing all 50 states
  was noise); states without loaded requirements show as pending John's
  authoritative file.
*/
export default async function StatesPage() {
  const user = await requireUser();

  const licenses = await prisma.userLicense.findMany({
    where: { licenseeId: user.id },
    select: { state: true, licenseType: true, isPrimary: true },
    orderBy: [{ isPrimary: "desc" }, { state: "asc" }],
  });
  const primary = licenses.find((l) => l.isPrimary) ?? licenses[0] ?? null;
  const licenseType = primary?.licenseType ?? LicenseType.RDH;
  const primaryState = primary?.state ?? null;

  const requirements = licenses.length
    ? await prisma.stateRequirement.findMany({
        where: {
          OR: licenses.map((l) => ({
            state: l.state,
            licenseType: l.licenseType,
          })),
        },
      })
    : [];
  const byKey = new Map(
    requirements.map((r) => [`${r.state}-${r.licenseType}`, r]),
  );

  // The licensee's certificates, to show real progress on their primary state.
  const certs = primaryState
    ? await prisma.ceCertificate.findMany({
        where: { licenseeId: user.id },
        select: { category: true, hours: true, deliveryFormat: true },
      })
    : [];

  const primaryReq = primary
    ? byKey.get(`${primary.state}-${primary.licenseType}`)
    : null;

  return (
    <>
      <PageHeader
        title="State CE Requirements"
        subtitle={`Continuing-education requirements for the states where you hold a ${licenseTypeLong(
          licenseType,
        )} license.`}
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
        Your states
      </h2>
      {licenses.length === 0 ? (
        <p className="rounded-lg border border-border bg-white px-4 py-8 text-center text-[12px] text-text-muted">
          Add a license to see your state&apos;s CE requirements.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {licenses.map((license) => {
            const code = license.state;
            const req = byKey.get(`${code}-${license.licenseType}`);
            const isPrimary = code === primaryState;
            return (
              <div
                key={`${code}-${license.licenseType}`}
                className={`rounded-lg border bg-white p-3 ${
                  isPrimary ? "border-ace ring-1 ring-ace/40" : "border-border"
                }`}
              >
                <div className="flex items-center justify-between">
                  <p className="text-[13px] font-semibold text-navy">
                    {US_STATES[code] ?? code}
                  </p>
                  {isPrimary ? (
                    <span className="rounded-full bg-ace-bg px-2 py-0.5 text-[9px] font-semibold text-ace-dark">
                      Primary
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
      )}
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
