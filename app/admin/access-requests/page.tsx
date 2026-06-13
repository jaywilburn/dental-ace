import { PageHeader } from "@/components/portal-shell";
import { requireStaff } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { roleLabelFor } from "@/lib/auth/access-requests";
import { approveAction, denyAction } from "./actions";

export default async function AdminAccessRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ done?: string; error?: string }>;
}) {
  await requireStaff("ADMIN");
  const { done, error } = await searchParams;

  const requests = await prisma.accessRequest.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    include: { user: { select: { email: true, firstName: true, lastName: true } } },
  });

  const fmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });

  return (
    <>
      <PageHeader
        title="Access Requests"
        subtitle={`${requests.length} pending`}
      />

      {done === "approved" ? (
        <div className="mb-4 rounded-md border border-emerald-400 bg-emerald-50 px-4 py-2.5 text-[13px] text-emerald-700">
          Request approved.
        </div>
      ) : done === "denied" ? (
        <div className="mb-4 rounded-md border border-border bg-surface px-4 py-2.5 text-[13px] text-text-mid">
          Request denied.
        </div>
      ) : null}

      {error ? (
        <div className="mb-4 rounded-md border border-red-400 bg-red-50 px-4 py-2.5 text-[13px] text-red-700">
          {error}
        </div>
      ) : null}

      {requests.length === 0 ? (
        <div className="overflow-hidden rounded-lg border border-border bg-white">
          <p className="px-4 py-10 text-center text-[12px] text-text-muted">No pending access requests.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {requests.map((r) => {
            const name =
              [r.user.firstName, r.user.lastName].filter(Boolean).join(" ") || r.user.email;

            return (
              <div
                key={r.id}
                className="rounded-lg border border-border bg-white px-5 py-4"
              >
                {/* Header row */}
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-[13px] font-semibold text-navy">{name}</p>
                    <p className="text-[12px] text-text-muted">{r.user.email}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center rounded-full border border-border bg-surface px-2.5 py-0.5 text-[11px] font-semibold text-text-mid">
                      {roleLabelFor(r.kind)}
                    </span>
                    <span className="text-[11px] text-text-muted tabular-nums">
                      {fmt.format(r.createdAt)}
                    </span>
                  </div>
                </div>

                {/* Details */}
                <div className="mt-2.5 space-y-1">
                  <p className="text-[12px] text-text-mid">
                    <span className="font-medium text-navy">Organization:</span>{" "}
                    {r.label}
                  </p>
                  {r.note ? (
                    <p className="text-[12px] text-text-mid">
                      <span className="font-medium text-navy">Note:</span>{" "}
                      {r.note}
                    </p>
                  ) : null}
                </div>

                {/* Actions */}
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  {/* Approve */}
                  <form action={approveAction}>
                    <input type="hidden" name="id" value={r.id} />
                    <button
                      type="submit"
                      className="rounded-md bg-emerald-600 px-3.5 py-1.5 text-[12px] font-semibold text-white hover:bg-emerald-700 active:scale-[0.98]"
                    >
                      Approve
                    </button>
                  </form>

                  {/* Deny */}
                  <form action={denyAction} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={r.id} />
                    <input
                      type="text"
                      name="reason"
                      placeholder="Reason (optional)"
                      className="rounded-md border border-border px-3 py-1.5 text-[12px] text-text-mid placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-border"
                    />
                    <button
                      type="submit"
                      className="rounded-md border border-red-300 bg-red-50 px-3.5 py-1.5 text-[12px] font-semibold text-red-700 hover:bg-red-100 active:scale-[0.98]"
                    >
                      Deny
                    </button>
                  </form>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
