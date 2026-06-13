import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/portal-shell";
import { EntitlementBadges } from "@/components/admin/entitlement-badges";
import { ConfirmSuspendUser } from "@/components/admin/confirm-suspend-user";
import { requireStaff } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import {
  updateProfile,
  setStaffRole,
  linkCompany,
  unlinkCompany,
  setProtrackTier,
  setVerifyAccess,
  unsuspendAccount,
  markEmailVerified,
  resendVerification,
  sendSetPasswordLink,
} from "@/lib/admin/users";

const OK_MESSAGES: Record<string, string> = {
  profile: "Profile updated.",
  role: "Staff role updated.",
  company: "DentalACE access updated.",
  protrack: "ProTrack tier updated.",
  verify: "Verify access updated.",
  suspended: "Account suspended.",
  unsuspended: "Account reinstated.",
  verified: "Email marked verified.",
  resent: "Verification email sent.",
  setpw: "Set-password link sent.",
};

const FIELD = "w-full rounded-md border border-border px-3 py-2 text-[13px]";
const CARD = "rounded-lg border border-border bg-white p-4";
const CARD_TITLE = "mb-3 text-[12px] font-semibold text-navy";
const SAVE = "rounded-md bg-navy px-3 py-1.5 text-[12px] font-semibold text-white";
const NOTE = "mt-2 text-[11px] text-text-muted";

function fmtDate(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default async function AdminUserDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await requireStaff("ADMIN");
  const { id } = await params;
  const { ok, error } = await searchParams;

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true, email: true, firstName: true, lastName: true,
      staffRole: true, companyId: true, protrackTier: true, proExpiresAt: true,
      verifyAccess: true, boardId: true, emailVerifiedAt: true, disabledAt: true,
      createdAt: true, lastLogin: true,
      company: { select: { id: true, name: true } },
      board: { select: { id: true, state: true, name: true } },
      subscription: { select: { status: true, currentPeriodEnd: true } },
      _count: {
        select: {
          licenses: true, certificates: true, reviewedApplications: true,
          initiatedAuditBatches: true, sentNotices: true,
        },
      },
    },
  });
  if (!user) notFound();

  const [companies, boards] = await Promise.all([
    prisma.company.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.board.findMany({ orderBy: { state: "asc" }, select: { id: true, state: true, name: true } }),
  ]);

  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;
  const proExpiresValue = user.proExpiresAt ? user.proExpiresAt.toISOString().slice(0, 10) : "";

  // Ownership summary for the suspend dialog (reassign-first reminder).
  const owned: string[] = [];
  if (user._count.reviewedApplications) owned.push(`${user._count.reviewedApplications} reviewed application(s)`);
  if (user._count.initiatedAuditBatches) owned.push(`${user._count.initiatedAuditBatches} audit batch(es)`);
  if (user._count.sentNotices) owned.push(`${user._count.sentNotices} sent notice(s)`);
  const ownershipSummary = owned.join(", ");

  return (
    <>
      <PageHeader
        title={fullName}
        subtitle={user.email}
        action={
          <Link href="/admin/users" className="text-[12px] text-ace underline">
            ← All users
          </Link>
        }
      />

      <div className="mb-4 flex items-center gap-2">
        <EntitlementBadges user={user} />
        {user.disabledAt ? (
          <span className="inline-flex items-center rounded-full bg-red-bg px-2 py-0.5 text-[10px] font-semibold text-red">
            Suspended {fmtDate(user.disabledAt)}
          </span>
        ) : null}
      </div>

      {ok ? (
        <div className="mb-4 rounded-md border border-emerald-400 bg-emerald-50 px-4 py-2.5 text-[13px] text-emerald-700">
          {OK_MESSAGES[ok] ?? "Done."}
        </div>
      ) : null}
      {error ? (
        <div className="mb-4 rounded-md border border-red-400 bg-red-50 px-4 py-2.5 text-[13px] text-red-700">{error}</div>
      ) : null}

      {user.disabledAt ? (
        <div className="mb-5 flex items-center justify-between gap-4 rounded-lg border border-red bg-red-bg px-4 py-3">
          <p className="text-[13px] text-red">This account is suspended and cannot sign in.</p>
          <form action={unsuspendAccount}>
            <input type="hidden" name="userId" value={user.id} />
            <button type="submit" className="rounded-md bg-navy px-3 py-1.5 text-[12px] font-semibold text-white">
              Reinstate
            </button>
          </form>
        </div>
      ) : null}

      {/* Profile */}
      <form action={updateProfile} className={`${CARD} mb-5`}>
        <input type="hidden" name="userId" value={user.id} />
        <p className={CARD_TITLE}>Profile</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-[11px] font-medium text-text-mid">First name</label>
            <input name="firstName" defaultValue={user.firstName ?? ""} required className={FIELD} />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-text-mid">Last name</label>
            <input name="lastName" defaultValue={user.lastName ?? ""} required className={FIELD} />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-[11px] font-medium text-text-mid">Email (login)</label>
            <input name="email" type="email" defaultValue={user.email} required className={FIELD} />
          </div>
        </div>
        <div className="mt-3">
          <button type="submit" className={SAVE}>Save profile</button>
        </div>
      </form>

      {/* Entitlements */}
      <h2 className="mb-3 text-[13px] font-semibold text-navy">Entitlements (visibility)</h2>
      <p className="mb-3 text-[11px] text-text-muted">
        These control which features the account sees on its home hub. Access changes apply on the user&apos;s next sign-in.
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Staff role */}
        <form action={setStaffRole} className={CARD}>
          <input type="hidden" name="userId" value={user.id} />
          <p className={CARD_TITLE}>Staff role</p>
          <select name="staffRole" defaultValue={user.staffRole} className={FIELD}>
            <option value="NONE">None (no staff access)</option>
            <option value="REVIEWER">Reviewer</option>
            <option value="ADMIN">Admin</option>
          </select>
          <p className={NOTE}>Admin unlocks /admin + /reviewer. Reviewer unlocks /reviewer.</p>
          <div className="mt-3"><button type="submit" className={SAVE}>Save role</button></div>
        </form>

        {/* DentalACE company */}
        <div className={CARD}>
          <p className={CARD_TITLE}>DentalACE company</p>
          {user.company ? (
            <form action={unlinkCompany} className="flex items-center justify-between gap-3">
              <input type="hidden" name="userId" value={user.id} />
              <div className="text-[13px] text-navy">
                Linked to <span className="font-semibold">{user.company.name}</span>
              </div>
              <button type="submit" className="rounded-md border border-border px-3 py-1.5 text-[12px] font-semibold text-text-mid hover:bg-surface">
                Unlink
              </button>
            </form>
          ) : (
            <form action={linkCompany} className="space-y-3">
              <input type="hidden" name="userId" value={user.id} />
              <select name="companyId" required defaultValue="" className={FIELD}>
                <option value="" disabled>Select a company…</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <button type="submit" className={SAVE}>Link company</button>
            </form>
          )}
          <p className={NOTE}>The company holds prepaid credits and billing.</p>
        </div>

        {/* ProTrack */}
        <form action={setProtrackTier} className={CARD}>
          <input type="hidden" name="userId" value={user.id} />
          <p className={CARD_TITLE}>ProTrack tier</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <select name="protrackTier" defaultValue={user.protrackTier} className={FIELD}>
              <option value="FREE">Free</option>
              <option value="PRO">Pro</option>
            </select>
            <div>
              <input type="date" name="proExpiresAt" defaultValue={proExpiresValue} className={FIELD} />
            </div>
          </div>
          <p className={NOTE}>
            Manual grant for comps/support. It does not create a Stripe subscription, the two can diverge.
            {user.subscription ? ` Stripe: ${user.subscription.status}.` : ""}
          </p>
          <div className="mt-3"><button type="submit" className={SAVE}>Save ProTrack</button></div>
        </form>

        {/* Verify */}
        <form action={setVerifyAccess} className={CARD}>
          <input type="hidden" name="userId" value={user.id} />
          <p className={CARD_TITLE}>Verify access</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <select name="verifyAccess" defaultValue={user.verifyAccess ? "true" : "false"} className={FIELD}>
              <option value="false">No access</option>
              <option value="true">Granted</option>
            </select>
            <select name="boardId" defaultValue={user.boardId ?? ""} className={FIELD}>
              <option value="">No board</option>
              {boards.map((b) => (
                <option key={b.id} value={b.id}>{b.state} — {b.name}</option>
              ))}
            </select>
          </div>
          <p className={NOTE}>Grants the /board portal for a state board.</p>
          <div className="mt-3"><button type="submit" className={SAVE}>Save Verify</button></div>
        </form>
      </div>

      {/* Account actions */}
      <h2 className="mt-8 mb-3 text-[13px] font-semibold text-navy">Account actions</h2>
      <div className={`${CARD} flex flex-wrap items-center gap-2`}>
        {!user.emailVerifiedAt ? (
          <>
            <form action={markEmailVerified}>
              <input type="hidden" name="userId" value={user.id} />
              <button type="submit" className="rounded-md border border-border px-3 py-1.5 text-[12px] font-semibold text-navy hover:bg-surface">
                Mark email verified
              </button>
            </form>
            <form action={resendVerification}>
              <input type="hidden" name="userId" value={user.id} />
              <button type="submit" className="rounded-md border border-border px-3 py-1.5 text-[12px] font-semibold text-navy hover:bg-surface">
                Resend verification
              </button>
            </form>
          </>
        ) : (
          <span className="rounded-md bg-green-bg px-3 py-1.5 text-[12px] font-semibold text-green">
            Email verified {fmtDate(user.emailVerifiedAt)}
          </span>
        )}
        <form action={sendSetPasswordLink}>
          <input type="hidden" name="userId" value={user.id} />
          <button type="submit" className="rounded-md border border-border px-3 py-1.5 text-[12px] font-semibold text-navy hover:bg-surface">
            Send set-password link
          </button>
        </form>
        {!user.disabledAt ? (
          <ConfirmSuspendUser userId={user.id} email={user.email} ownershipSummary={ownershipSummary} />
        ) : null}
      </div>

      {/* Ownership & activity */}
      <h2 className="mt-8 mb-3 text-[13px] font-semibold text-navy">Ownership &amp; activity</h2>
      <div className={CARD}>
        <dl className="grid gap-x-6 gap-y-3 text-[12px] sm:grid-cols-2 lg:grid-cols-3">
          <Row label="DentalACE company" value={user.company?.name ?? "—"} />
          <Row label="Verify board" value={user.board ? `${user.board.state} — ${user.board.name}` : "—"} />
          <Row label="ProTrack licenses" value={String(user._count.licenses)} />
          <Row label="CE certificates" value={String(user._count.certificates)} />
          <Row label="Reviewed applications" value={String(user._count.reviewedApplications)} />
          <Row label="Initiated audit batches" value={String(user._count.initiatedAuditBatches)} />
          <Row label="Sent notices" value={String(user._count.sentNotices)} />
          <Row label="Last login" value={fmtDate(user.lastLogin)} />
          <Row label="Created" value={fmtDate(user.createdAt)} />
          <Row label="Email verified" value={fmtDate(user.emailVerifiedAt)} />
          <Row label="Suspended" value={fmtDate(user.disabledAt)} />
        </dl>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-text-muted">{label}</dt>
      <dd className="mt-0.5 text-navy">{value}</dd>
    </div>
  );
}
