import Link from "next/link";
import { Prisma, ComplianceStatus, LicenseType } from "@prisma/client";
import { PageHeader } from "@/components/portal-shell";
import { requireBoard } from "@/lib/board/scope";
import { prisma } from "@/lib/prisma";
import { computeLicenseeComplianceBatch } from "@/lib/board/licensee/compliance";
import { licenseTypeShort } from "@/lib/protrack/reference";

/*
  /board/licensees — every licensee in the board's state.

  Filters (all via querystring so they survive bookmarking):
    ?type=ALL|DDS_DMD|RDH|DA
    ?status=ALL|COMPLIANT|IN_PROGRESS|DEFICIENT|NO_UPLOAD
    ?q=<free text, matches license number / first name / last name / email>
    ?page=<1-based>

  Compliance is computed per page-view: we filter the SQL set down with the
  cheap criteria first (type, state, search), then load + classify those rows
  in memory. For seed/state sizes (≤ a few hundred per state) this is fine.
  When a state grows past ~1k licensees, materialize a `licensee_compliance`
  snapshot column and filter by that instead.
*/

const PAGE_SIZE = 25;

const STATUS_META: Record<
  ComplianceStatus,
  { label: string; className: string }
> = {
  COMPLIANT: { label: "Compliant", className: "bg-green-50 text-green-700" },
  IN_PROGRESS: { label: "In progress", className: "bg-ace-bg text-ace-dark" },
  DEFICIENT: { label: "Deficient", className: "bg-red-50 text-red-700" },
  NO_UPLOAD: { label: "No upload", className: "bg-surface text-text-muted" },
};

const TYPE_FILTERS: Array<{ value: string; label: string }> = [
  { value: "ALL", label: "All types" },
  { value: LicenseType.DDS_DMD, label: "Dentist (DDS)" },
  { value: LicenseType.RDH, label: "Hygienist (RDH)" },
  { value: LicenseType.DA, label: "Assistant (DA)" },
];

const STATUS_FILTERS: Array<{ value: string; label: string }> = [
  { value: "ALL", label: "All statuses" },
  { value: ComplianceStatus.COMPLIANT, label: "Compliant" },
  { value: ComplianceStatus.IN_PROGRESS, label: "In progress" },
  { value: ComplianceStatus.DEFICIENT, label: "Deficient" },
  { value: ComplianceStatus.NO_UPLOAD, label: "No upload" },
];

function isLicenseType(value: string | undefined): value is LicenseType {
  return (
    value === LicenseType.DDS_DMD ||
    value === LicenseType.RDH ||
    value === LicenseType.DA
  );
}

function isComplianceStatus(value: string | undefined): value is ComplianceStatus {
  return (
    value === ComplianceStatus.COMPLIANT ||
    value === ComplianceStatus.IN_PROGRESS ||
    value === ComplianceStatus.DEFICIENT ||
    value === ComplianceStatus.NO_UPLOAD
  );
}

function buildQuery(
  current: { type: string; status: string; q: string; page: number },
  patch: Partial<{ type: string; status: string; q: string; page: number }>,
): string {
  const next = { ...current, ...patch };
  const params = new URLSearchParams();
  if (next.type !== "ALL") params.set("type", next.type);
  if (next.status !== "ALL") params.set("status", next.status);
  if (next.q) params.set("q", next.q);
  if (next.page > 1) params.set("page", String(next.page));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export default async function LicenseesPage({
  searchParams,
}: {
  searchParams: Promise<{
    type?: string;
    status?: string;
    q?: string;
    page?: string;
  }>;
}) {
  const { board } = await requireBoard();
  const sp = await searchParams;

  const typeParam = (sp.type ?? "ALL").toUpperCase();
  const statusParam = (sp.status ?? "ALL").toUpperCase();
  const q = (sp.q ?? "").trim();
  const pageRaw = Number.parseInt(sp.page ?? "1", 10);
  const requestedPage = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;

  const typeFilter = isLicenseType(typeParam) ? typeParam : null;
  const statusFilter = isComplianceStatus(statusParam) ? statusParam : null;

  const searchClause: Prisma.UserLicenseWhereInput | undefined =
    q.length > 0
      ? {
          OR: [
            { licenseNumber: { contains: q, mode: "insensitive" } },
            { user: { firstName: { contains: q, mode: "insensitive" } } },
            { user: { lastName: { contains: q, mode: "insensitive" } } },
            { user: { email: { contains: q, mode: "insensitive" } } },
          ],
        }
      : undefined;

  const baseWhere: Prisma.UserLicenseWhereInput = {
    state: board.state,
    ...(typeFilter ? { licenseType: typeFilter } : {}),
    ...(searchClause ?? {}),
  };

  // Pull the entire eligible set, classify, then filter+paginate in memory.
  // Cheap enough at current scale (TX seed ≤ 500 rows / state); revisit when
  // a single state passes ~1k rows.
  const allLicenses = await prisma.userLicense.findMany({
    where: baseWhere,
    orderBy: [{ user: { lastName: "asc" } }, { user: { firstName: "asc" } }],
    select: {
      id: true,
      licenseeId: true,
      licenseType: true,
      licenseNumber: true,
      renewalDate: true,
      user: {
        select: { firstName: true, lastName: true, email: true },
      },
    },
  });

  const totalInState = await prisma.userLicense.count({
    where: { state: board.state },
  });

  const enriched = await computeLicenseeComplianceBatch(
    board.state,
    allLicenses,
  );

  const filteredByStatus = statusFilter
    ? enriched.filter((r) => r.complianceStatus === statusFilter)
    : enriched;

  const totalFiltered = filteredByStatus.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);
  const start = (page - 1) * PAGE_SIZE;
  const rows = filteredByStatus.slice(start, start + PAGE_SIZE);

  const currentParams = {
    type: typeFilter ?? "ALL",
    status: statusFilter ?? "ALL",
    q,
    page,
  };

  return (
    <>
      <PageHeader
        title="Licensees"
        subtitle={`${totalInState} licensee${totalInState === 1 ? "" : "s"} in your state · filter, search, drill in.`}
      />

      <form
        method="get"
        className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-white p-3"
      >
        <label className="flex flex-1 items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
            Search
          </span>
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="License #, name, or email"
            className="flex-1 rounded-md border border-border bg-surface px-3 py-1.5 text-[12px] text-navy outline-none focus:border-ver"
          />
        </label>
        {typeFilter ? (
          <input type="hidden" name="type" value={typeFilter} />
        ) : null}
        {statusFilter ? (
          <input type="hidden" name="status" value={statusFilter} />
        ) : null}
        <button
          type="submit"
          className="rounded-md bg-ver px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-ver/90"
        >
          Search
        </button>
        {q ? (
          <Link
            href={buildQuery(currentParams, { q: "", page: 1 })}
            className="rounded-md border border-border bg-white px-3 py-1.5 text-[11px] font-semibold text-text-mid hover:border-ver"
          >
            Clear
          </Link>
        ) : null}
      </form>

      <div className="mb-2 flex flex-wrap gap-1">
        {TYPE_FILTERS.map((f) => (
          <Link
            key={f.value}
            href={buildQuery(currentParams, { type: f.value, page: 1 })}
            className={
              "rounded-full px-3 py-1 text-[11px] font-semibold transition " +
              ((typeFilter ?? "ALL") === f.value
                ? "bg-ver text-white"
                : "border border-border bg-white text-text-mid hover:border-ver hover:text-navy")
            }
          >
            {f.label}
          </Link>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap gap-1">
        {STATUS_FILTERS.map((f) => (
          <Link
            key={f.value}
            href={buildQuery(currentParams, { status: f.value, page: 1 })}
            className={
              "rounded-full px-3 py-1 text-[11px] font-semibold transition " +
              ((statusFilter ?? "ALL") === f.value
                ? "bg-navy text-white"
                : "border border-border bg-white text-text-mid hover:border-navy hover:text-navy")
            }
          >
            {f.label}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-white p-8 text-center">
          <p className="font-serif text-base font-semibold text-navy">
            No licensees match
          </p>
          <p className="mt-1 text-[12px] text-text-muted">
            {q || typeFilter || statusFilter
              ? "Try clearing a filter or broadening your search."
              : "No licensees in your state yet."}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead className="border-b border-border bg-surface text-left text-[10px] uppercase tracking-wide text-text-muted">
                <tr>
                  <th className="px-4 py-2 font-semibold">License #</th>
                  <th className="px-4 py-2 font-semibold">Name</th>
                  <th className="px-4 py-2 font-semibold">Type</th>
                  <th className="px-4 py-2 text-right font-semibold">CE hrs</th>
                  <th className="px-4 py-2 font-semibold">Status</th>
                  <th className="px-4 py-2 font-semibold">Renewal</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const meta = STATUS_META[r.complianceStatus];
                  const name = r.firstName
                    ? `${r.firstName} ${r.lastName ?? ""}`.trim()
                    : r.email;
                  return (
                    <tr
                      key={r.userLicenseId}
                      className="border-b border-border last:border-0"
                    >
                      <td className="px-4 py-2 font-mono text-[11px] text-navy">
                        <Link
                          href={`/board/licensees/${encodeURIComponent(r.licenseNumber)}`}
                          className="hover:underline"
                        >
                          {r.licenseNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-text-mid">
                        <Link
                          href={`/board/licensees/${encodeURIComponent(r.licenseNumber)}`}
                          className="hover:text-navy hover:underline"
                        >
                          {name}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-text-muted">
                        {licenseTypeShort(r.licenseType)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-text-mid">
                        {r.ceHoursCompleted.toFixed(1)}
                        <span className="text-text-muted"> / {r.ceHoursRequired.toFixed(1)}</span>
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${meta.className}`}
                        >
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-text-muted">
                        {r.renewalDate.toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {totalPages > 1 ? (
            <div className="flex items-center justify-between border-t border-border bg-surface px-4 py-2 text-[11px] text-text-muted">
              <span>
                Showing {start + 1}–{Math.min(start + PAGE_SIZE, totalFiltered)} of {totalFiltered}
              </span>
              <div className="flex gap-1">
                {page > 1 ? (
                  <Link
                    href={buildQuery(currentParams, { page: page - 1 })}
                    className="rounded-md border border-border bg-white px-2 py-1 text-text-mid hover:border-ver"
                  >
                    ← Prev
                  </Link>
                ) : null}
                <span className="rounded-md bg-white px-2 py-1 text-navy">
                  Page {page} / {totalPages}
                </span>
                {page < totalPages ? (
                  <Link
                    href={buildQuery(currentParams, { page: page + 1 })}
                    className="rounded-md border border-border bg-white px-2 py-1 text-text-mid hover:border-ver"
                  >
                    Next →
                  </Link>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </>
  );
}
