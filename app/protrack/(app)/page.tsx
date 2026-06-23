import Link from "next/link";
import { PageHeader } from "@/components/portal-shell";
import { ProgressBar } from "@/components/protrack/progress-bar";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import {
  licenseTypeLong,
  stateName,
} from "@/lib/protrack/reference";
import {
  categoryIcon,
  computeRequirementProgress,
  formatHours,
  formatLabel,
  monthsUntil,
  parseCategories,
  type CategoryProgress,
} from "@/lib/protrack/progress";

const dateFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

/*
  ProTrack CE Dashboard. Computes progress toward the licensee's primary-state CE
  requirement from their certificates. Mirrors logic/protrack-dev-mockup-suite.html
  #dashboard (free variant).
*/
export default async function ProtrackDashboard() {
  const user = await requireUser();

  const account = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      licenses: {
        where: { isPrimary: true },
        take: 1,
        select: {
          state: true,
          licenseType: true,
          licenseNumber: true,
          renewalDate: true,
        },
      },
      certificates: {
        orderBy: { completedAt: "desc" },
        select: {
          id: true,
          courseTitle: true,
          provider: true,
          source: true,
          category: true,
          hours: true,
          deliveryFormat: true,
          completedAt: true,
        },
      },
    },
  });

  const primary = account?.licenses[0];

  if (!account || !primary) {
    return (
      <>
        <PageHeader title="CE Dashboard" />
        <EmptyState
          title="No license on file"
          body="Add your license to start tracking continuing education against your state's requirements."
          ctaHref="/protrack/states"
          ctaLabel="Browse state requirements"
        />
      </>
    );
  }

  const requirement = await prisma.stateRequirement.findUnique({
    where: {
      state_licenseType: {
        state: primary.state,
        licenseType: primary.licenseType,
      },
    },
  });

  const uploadAction = (
    <Link
      href="/protrack/upload"
      className="rounded-md bg-navy px-3.5 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-navy/90"
    >
      ↑ Upload Certificate
    </Link>
  );

  const cycleYears = requirement
    ? `${primary.renewalDate.getFullYear() - Math.round(requirement.cycleMonths / 12)}-${primary.renewalDate.getFullYear()}`
    : null;

  const subtitle = `${stateName(primary.state)} · ${licenseTypeLong(primary.licenseType)}${
    cycleYears ? ` · ${cycleYears} renewal cycle` : ""
  } · Renews ${dateFmt.format(primary.renewalDate)}`;

  const aceCert = account.certificates.find((c) => c.source === "ACE");

  if (!requirement) {
    return (
      <>
        <PageHeader title="CE Dashboard" subtitle={subtitle} action={uploadAction} />
        <EmptyState
          title={`No CE requirements on file for ${stateName(primary.state)} yet`}
          body="We have not loaded continuing-education requirements for this license type and state. Your uploaded certificates are still saved."
          ctaHref="/protrack/certificates"
          ctaLabel="View my certificates"
        />
      </>
    );
  }

  const certs = account.certificates.map((c) => ({
    category: c.category,
    hours: Number(c.hours),
    deliveryFormat: c.deliveryFormat,
  }));
  const progress = computeRequirementProgress(
    { totalHours: Number(requirement.totalHours), categories: parseCategories(requirement.categories) },
    certs,
  );
  const monthsLeft = monthsUntil(new Date(), primary.renewalDate);
  const isComplete = progress.status === "complete";

  return (
    <>
      <PageHeader title="CE Dashboard" subtitle={subtitle} action={uploadAction} />

      {requirement.status === "PROVISIONAL" ? (
        <p className="mb-4 rounded-md border border-ace/40 bg-ace-bg px-3 py-2 text-[11px] text-ace-dark text-pretty">
          Requirements shown are provisional and pending confirmation from the{" "}
          {stateName(primary.state)} board. ProTrack tracks your hours; it does not
          certify compliance.
        </p>
      ) : null}

      {aceCert ? (
        <div className="mb-4 flex items-center justify-between gap-4 rounded-lg bg-navy px-4 py-3 text-white">
          <div className="flex items-center gap-3">
            <span aria-hidden className="text-lg">
              ⭐
            </span>
            <div>
              <p className="text-[12px] font-semibold">
                ACE certificate synced from DentalACE
              </p>
              <p className="text-[11px] text-white/60 text-pretty">
                {aceCert.courseTitle} · {aceCert.provider} ·{" "}
                {formatHours(Number(aceCert.hours))} hrs · added automatically
              </p>
            </div>
          </div>
          <span className="shrink-0 rounded-full bg-green-600/90 px-2.5 py-1 text-[10px] font-semibold">
            ✓ Auto-synced
          </span>
        </div>
      ) : null}

      {/* Active requirement hero */}
      <section className="rounded-lg bg-navy px-5 py-4 text-white">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[2px] text-white/40">
              Active Requirement
            </p>
            <h2 className="mt-1 font-serif text-2xl font-bold text-balance">
              {stateName(primary.state)}, {licenseTypeLong(primary.licenseType)}
            </h2>
            <p className="mt-0.5 text-[11px] text-white/55">
              {requirement.cycleMonths}-month renewal cycle · {monthsLeft} month
              {monthsLeft === 1 ? "" : "s"} remaining
            </p>
          </div>
          <dl className="flex gap-6 tabular-nums">
            <HeroStat label="Completed" value={formatHours(progress.totalCompleted)} />
            <HeroStat label="Remaining" value={formatHours(progress.remaining)} />
            <HeroStat label="Required" value={formatHours(progress.totalRequired)} />
          </dl>
        </div>
      </section>

      {/* Overall progress */}
      <section className="mt-4 rounded-lg border border-border bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[12px] font-semibold text-navy">
            Overall Progress · {formatHours(progress.totalRequired)} hours required
          </p>
          <span
            className={
              isComplete
                ? "rounded-full bg-green-100 px-2.5 py-0.5 text-[10px] font-semibold text-green-700"
                : "rounded-full bg-ace-bg px-2.5 py-0.5 text-[10px] font-semibold text-ace-dark"
            }
          >
            {isComplete ? "Complete" : "In Progress"}
          </span>
        </div>
        <ProgressBar
          className="mt-3"
          value={progress.pct}
          tone={isComplete ? "green" : "ace"}
          label="Overall CE progress"
        />
        <div className="mt-2 flex items-center justify-between text-[11px] text-text-muted tabular-nums">
          <span>
            {formatHours(progress.totalCompleted)} of{" "}
            {formatHours(progress.totalRequired)} hours completed ({progress.pct}%)
          </span>
          <span>
            {progress.remaining > 0
              ? `${formatHours(progress.remaining)} hours needed · ${monthsLeft} months left`
              : "Requirement met"}
          </span>
        </div>
      </section>

      {/* Category grid */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {progress.categories.map((cat) => (
          <CategoryCard key={cat.name} cat={cat} />
        ))}
        <Link
          href="/protrack/upload"
          className="flex min-h-[140px] flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border bg-white text-text-muted transition-colors hover:border-ace hover:text-ace-dark"
        >
          <span aria-hidden className="text-xl">
            +
          </span>
          <span className="text-[12px] font-semibold">
            Upload another certificate
          </span>
        </Link>
      </div>

      {user.protrackTier !== "PRO" ? (
        <Link
          href="/protrack/upgrade?gate=pro"
          className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-ace/40 bg-ace-bg px-4 py-3 text-pretty transition-colors hover:bg-ace-bg/70"
        >
          <span className="text-[12px] text-ace-dark">
            🔔 Never miss a renewal. Get deadline reminders and a downloadable
            PDF for your dental board with ProTrack Pro.
          </span>
          <span className="shrink-0 text-[12px] font-semibold text-ace-dark">
            Upgrade →
          </span>
        </Link>
      ) : null}
    </>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-right">
      <dd className="font-serif text-3xl font-bold leading-none">{value}</dd>
      <dt className="mt-1 text-[10px] uppercase tracking-wide text-white/45">
        {label}
      </dt>
    </div>
  );
}

function CategoryCard({ cat }: { cat: CategoryProgress }) {
  const pct = cat.required > 0 ? (cat.completed / cat.required) * 100 : 0;
  const tone =
    cat.status === "complete" ? "green" : cat.status === "in_progress" ? "ace" : "red";

  const statusLine =
    cat.status === "complete"
      ? `✓ ${formatHours(cat.completed)}/${formatHours(cat.required)} hrs · Complete`
      : cat.status === "in_progress"
        ? `⚠ ${formatHours(cat.earned)}/${formatHours(cat.required)} hrs · ${formatHours(cat.needed)} needed`
        : `✗ 0/${formatHours(cat.required)} hrs · Not started`;

  const statusColor =
    cat.status === "complete"
      ? "text-green-700"
      : cat.status === "in_progress"
        ? "text-ace-dark"
        : "text-red-600";

  return (
    <div className="flex flex-col rounded-lg border border-border bg-white p-4">
      <span aria-hidden className="text-xl">
        {categoryIcon(cat.name)}
      </span>
      <p className="mt-2 text-[13px] font-semibold text-navy">{cat.name}</p>
      <p className="text-[11px] text-text-muted">
        {formatHours(cat.required)} hrs · {formatLabel(cat.format)}
      </p>
      <ProgressBar
        className="mt-3"
        value={pct}
        tone={tone}
        label={`${cat.name} progress`}
      />
      <p className={`mt-2 text-[11px] font-medium tabular-nums ${statusColor}`}>
        {statusLine}
      </p>
    </div>
  );
}

function EmptyState({
  title,
  body,
  ctaHref,
  ctaLabel,
}: {
  title: string;
  body: string;
  ctaHref: string;
  ctaLabel: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-white p-8 text-center">
      <p className="font-serif text-lg font-semibold text-navy text-balance">
        {title}
      </p>
      <p className="mx-auto mt-1 max-w-md text-[12px] text-text-muted text-pretty">
        {body}
      </p>
      <Link
        href={ctaHref}
        className="mt-4 inline-block rounded-md bg-navy px-4 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-navy/90"
      >
        {ctaLabel}
      </Link>
    </div>
  );
}
