# Admin "Delete Account" (Test-Reset) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give AADB admins a guarded "Delete account" action on `/admin/users/[id]` that permanently removes an account from both Prisma and Supabase Auth, freeing its email for re-signup during testing.

**Architecture:** A pure decision function (`evaluateDeletable`) unit-tested in isolation, fed by a server-only fact-gatherer (`gatherDeletionFacts`) that runs the guard queries. The `deleteAccount` server action deletes the Supabase Auth user first (idempotent), then removes the row + dependent workflow rows + writes an audit entry in one Prisma transaction. The user-detail page renders a Danger zone whose enabled/disabled state comes from the same decision function, so the guard reason is always legible.

**Tech Stack:** Next.js 16 App Router (server actions, no middleware), Prisma 6, Supabase Auth (service-role admin client), Zod, Vitest, Tailwind v4 + native `<dialog>`.

**Spec:** [`docs/superpowers/specs/2026-07-01-admin-account-delete-design.md`](../specs/2026-07-01-admin-account-delete-design.md)

## Global Constraints

- **Package manager: pnpm.** Never `npm install`. Commands: `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm test`, `pnpm exec prisma migrate dev`.
- **`pnpm typecheck` (tsc --noEmit) must be clean before any commit.** TypeScript strict mode.
- **No `middleware.ts`, no Pages Router.** Route protection is in `layout.tsx`; this feature lives entirely under existing App Router routes.
- **Zod validation on every server-action boundary that accepts client input.**
- **Money/data-isolation rules unchanged.** This action uses the existing Prisma admin path; no new RLS.
- **Brand copy rules:** no em dashes (`—`) in any user-facing string; no emojis; product names spelled `DentalACE`, `ProTrack`, `Verify`. Use commas or restructure instead of em dashes.
- **Testing reality:** this codebase unit-tests **pure functions only** (see `lib/admin/override-rules.test.ts`); no test mocks Prisma/Supabase server actions. Task 1 is true TDD. Tasks 2 to 5 are verified by `pnpm typecheck` + `pnpm build` + `pnpm lint`; behavior is verified by the manual e2e in Task 6. Do not invent a brittle Prisma/Supabase mock.
- **Commits:** the repo owner (Jay) reviews and commits. Each task ends with a stage + a proposed commit message; stage the files and surface the message, and do **not** `git push`.

---

## File Structure

- **`lib/admin/deletion-rules.ts`** (create) — pure `evaluateDeletable(facts)`; no imports from Prisma/Supabase/`server-only`. Single responsibility: the block/allow decision + user-facing reason string.
- **`lib/admin/deletion-rules.test.ts`** (create) — Vitest coverage of every branch of `evaluateDeletable`.
- **`lib/admin/deletion.ts`** (create) — server-only `gatherDeletionFacts(userId, actingAdminId)`; runs the guard queries via Prisma and returns a `DeletionFacts` object. Single responsibility: turn a user id into the facts the rule needs.
- **`prisma/schema.prisma`** (modify) — add `ACCOUNT_DELETED` to the `AdminAuditAction` enum.
- **`prisma/migrations/<generated>/migration.sql`** (create, via `prisma migrate dev`) — `ALTER TYPE "AdminAuditAction" ADD VALUE 'ACCOUNT_DELETED'`.
- **`lib/admin/users.ts`** (modify) — add the `deleteAccount` server action, reusing the file's existing helpers (`field`, `resolveSchema`, `fail`, `loadTarget`, `recordAdminAction`, `createServiceRoleClient`, `prisma`).
- **`components/admin/confirm-delete-user.tsx`** (create) — client type-the-email confirmation dialog, mirroring `components/admin/confirm-suspend-user.tsx`.
- **`app/admin/users/[id]/page.tsx`** (modify) — capture the acting admin, compute deletability, render a Danger zone.
- **`app/admin/users/page.tsx`** (modify) — add the `deleted` success message (deletion redirects to this list page).

---

### Task 1: Pure deletion-decision rule + tests

**Files:**
- Create: `lib/admin/deletion-rules.ts`
- Test: `lib/admin/deletion-rules.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type DeletionFacts = { isSelf: boolean; isLastActiveAdmin: boolean; hasPerformedAdminActions: boolean; hasInitiatedAudits: boolean; isUnderAudit: boolean; hasProSubscription: boolean; hasCeCertificates: boolean; companyHasActivity: boolean }`
  - `type DeletionDecision = { deletable: true } | { deletable: false; reason: string }`
  - `function evaluateDeletable(facts: DeletionFacts): DeletionDecision`

- [ ] **Step 1: Write the failing test**

Create `lib/admin/deletion-rules.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { evaluateDeletable, type DeletionFacts } from "@/lib/admin/deletion-rules";

const CLEAN: DeletionFacts = {
  isSelf: false,
  isLastActiveAdmin: false,
  hasPerformedAdminActions: false,
  hasInitiatedAudits: false,
  isUnderAudit: false,
  hasProSubscription: false,
  hasCeCertificates: false,
  companyHasActivity: false,
};

describe("evaluateDeletable", () => {
  it("allows a clean account", () => {
    expect(evaluateDeletable(CLEAN)).toEqual({ deletable: true });
  });

  it("blocks self-deletion first", () => {
    const r = evaluateDeletable({ ...CLEAN, isSelf: true, hasCeCertificates: true });
    expect(r).toEqual({ deletable: false, reason: "You can't delete your own account." });
  });

  it("blocks the last active admin", () => {
    const r = evaluateDeletable({ ...CLEAN, isLastActiveAdmin: true });
    expect(r.deletable).toBe(false);
    if (!r.deletable) expect(r.reason).toContain("last active admin");
  });

  it("blocks an account that performed admin actions, suggesting suspend", () => {
    const r = evaluateDeletable({ ...CLEAN, hasPerformedAdminActions: true });
    expect(r).toEqual({
      deletable: false,
      reason: "This account has performed admin actions. Suspend it instead.",
    });
  });

  it("blocks on initiated audits", () => {
    expect(evaluateDeletable({ ...CLEAN, hasInitiatedAudits: true })).toEqual({
      deletable: false,
      reason: "This account has initiated audits. Suspend it instead.",
    });
  });

  it("blocks an account under audit", () => {
    expect(evaluateDeletable({ ...CLEAN, isUnderAudit: true })).toEqual({
      deletable: false,
      reason: "This account appears in an audit. Suspend it instead.",
    });
  });

  it("blocks an account with an active subscription", () => {
    expect(evaluateDeletable({ ...CLEAN, hasProSubscription: true })).toEqual({
      deletable: false,
      reason: "This account has an active subscription. Suspend it instead.",
    });
  });

  it("blocks an account with CE records", () => {
    expect(evaluateDeletable({ ...CLEAN, hasCeCertificates: true })).toEqual({
      deletable: false,
      reason: "This account has CE records. Suspend it instead.",
    });
  });

  it("blocks an account whose company has activity", () => {
    expect(evaluateDeletable({ ...CLEAN, companyHasActivity: true })).toEqual({
      deletable: false,
      reason: "This company has accreditation or billing activity. Suspend it instead.",
    });
  });

  it("prefers the self reason over compliance reasons", () => {
    const r = evaluateDeletable({ ...CLEAN, isSelf: true, hasProSubscription: true });
    if (!r.deletable) expect(r.reason).toBe("You can't delete your own account.");
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `pnpm test lib/admin/deletion-rules.test.ts`
Expected: FAIL — cannot resolve `@/lib/admin/deletion-rules` (module does not exist yet).

- [ ] **Step 3: Write the minimal implementation**

Create `lib/admin/deletion-rules.ts`:

```ts
/*
  Pure block/allow decision for hard-deleting a user account. No DB, no
  server-only — unit-tested directly (see deletion-rules.test.ts). The server
  action and the user-detail page both feed it facts from gatherDeletionFacts()
  in lib/admin/deletion.ts.

  Policy: we hard-delete ONLY "clean" accounts (frees the email for re-signup
  during testing). Any account carrying real, irreversible records is blocked
  and must be suspended instead. See the design spec dated 2026-07-01.
*/

export type DeletionFacts = {
  /** Target is the acting admin. */
  isSelf: boolean;
  /** Target is an enabled ADMIN and the only one left. */
  isLastActiveAdmin: boolean;
  /** Target has authored admin-audit-log entries (blocks the required actor FK). */
  hasPerformedAdminActions: boolean;
  /** Target initiated any Verify audit batch. */
  hasInitiatedAudits: boolean;
  /** Target's licenses appear in any audit selection or deficiency. */
  isUnderAudit: boolean;
  /** Target has a ProTrack Pro (Stripe) subscription row. */
  hasProSubscription: boolean;
  /** Target has any ProTrack CE certificate. */
  hasCeCertificates: boolean;
  /** Target's linked company has non-DRAFT applications, courses, issued certs, or billing. */
  companyHasActivity: boolean;
};

export type DeletionDecision = { deletable: true } | { deletable: false; reason: string };

export function evaluateDeletable(facts: DeletionFacts): DeletionDecision {
  if (facts.isSelf) {
    return { deletable: false, reason: "You can't delete your own account." };
  }
  if (facts.isLastActiveAdmin) {
    return { deletable: false, reason: "This is the last active admin, so it can't be deleted." };
  }
  if (facts.hasPerformedAdminActions) {
    return { deletable: false, reason: "This account has performed admin actions. Suspend it instead." };
  }
  if (facts.hasInitiatedAudits) {
    return { deletable: false, reason: "This account has initiated audits. Suspend it instead." };
  }
  if (facts.isUnderAudit) {
    return { deletable: false, reason: "This account appears in an audit. Suspend it instead." };
  }
  if (facts.hasProSubscription) {
    return { deletable: false, reason: "This account has an active subscription. Suspend it instead." };
  }
  if (facts.hasCeCertificates) {
    return { deletable: false, reason: "This account has CE records. Suspend it instead." };
  }
  if (facts.companyHasActivity) {
    return { deletable: false, reason: "This company has accreditation or billing activity. Suspend it instead." };
  }
  return { deletable: true };
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `pnpm test lib/admin/deletion-rules.test.ts`
Expected: PASS (all cases green).

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 6: Stage + propose commit**

```bash
git add lib/admin/deletion-rules.ts lib/admin/deletion-rules.test.ts
```
Proposed message: `feat(admin): pure evaluateDeletable rule for account deletion guard`

---

### Task 2: Add `ACCOUNT_DELETED` audit action (schema + migration)

**Files:**
- Modify: `prisma/schema.prisma` (enum `AdminAuditAction`, around lines 198-214)
- Create: `prisma/migrations/<generated>/migration.sql` (via `prisma migrate dev`)

**Interfaces:**
- Consumes: nothing.
- Produces: the `"ACCOUNT_DELETED"` value on the generated `AdminAuditAction` type, usable in `recordAdminAction({ action: "ACCOUNT_DELETED" })`.

- [ ] **Step 1: Add the enum value**

In `prisma/schema.prisma`, add `ACCOUNT_DELETED` to the `AdminAuditAction` enum, after `STAFF_ACCOUNT_CREATED` and before `ACCESS_REQUEST_APPROVED`:

```prisma
enum AdminAuditAction {
  PROFILE_UPDATED
  STAFF_ROLE_CHANGED
  COMPANY_LINKED
  COMPANY_UNLINKED
  PROTRACK_TIER_CHANGED
  VERIFY_ACCESS_CHANGED
  ACCOUNT_SUSPENDED
  ACCOUNT_UNSUSPENDED
  WORK_REASSIGNED
  EMAIL_VERIFIED_MANUALLY
  VERIFICATION_RESENT
  SET_PASSWORD_LINK_SENT
  STAFF_ACCOUNT_CREATED
  ACCOUNT_DELETED
  ACCESS_REQUEST_APPROVED
  ACCESS_REQUEST_DENIED
}
```

- [ ] **Step 2: Generate + apply the migration**

Run: `pnpm exec prisma migrate dev --name add_account_deleted_audit_action`
Expected: a new migration folder whose `migration.sql` contains exactly:
```sql
-- AlterEnum
ALTER TYPE "AdminAuditAction" ADD VALUE 'ACCOUNT_DELETED';
```
Prisma auto-runs `prisma generate` afterward. (This matches the prior enum-addition migration `20260613065529_access_requests`, which added `ACCESS_REQUEST_APPROVED`/`ACCESS_REQUEST_DENIED` the same way.)

If `migrate dev` cannot reach a shadow database in this environment, apply the single `ALTER TYPE ... ADD VALUE` statement above via the Supabase MCP `apply_migration` tool, hand-author the identical `migration.sql` folder, run `pnpm exec prisma migrate resolve --applied <folder>`, then `pnpm exec prisma generate`.

- [ ] **Step 3: Typecheck against the regenerated client**

Run: `pnpm typecheck`
Expected: no errors (the enum literal is now known to the client).

- [ ] **Step 4: Stage + propose commit**

```bash
git add prisma/schema.prisma prisma/migrations
```
Proposed message: `feat(db): add ACCOUNT_DELETED admin audit action`

---

### Task 3: `gatherDeletionFacts` + `deleteAccount` server action

**Files:**
- Create: `lib/admin/deletion.ts`
- Modify: `lib/admin/users.ts` (add one exported action + one import)

**Interfaces:**
- Consumes: `evaluateDeletable`, `DeletionFacts` (Task 1); `"ACCOUNT_DELETED"` (Task 2); existing `lib/admin/users.ts` helpers `field`, `resolveSchema`, `fail`, `loadTarget`, `recordAdminAction`, `createServiceRoleClient`, and the `prisma` import.
- Produces:
  - `async function gatherDeletionFacts(userId: string, actingAdminId: string): Promise<DeletionFacts>` (in `lib/admin/deletion.ts`)
  - `async function deleteAccount(formData: FormData): Promise<void>` (server action in `lib/admin/users.ts`; redirects, so it never returns normally)

- [ ] **Step 1: Write the fact-gatherer**

Create `lib/admin/deletion.ts`:

```ts
import "server-only";
import { prisma } from "@/lib/prisma";
import type { DeletionFacts } from "@/lib/admin/deletion-rules";

/*
  Server-only. Turns a user id into the facts evaluateDeletable() needs. Runs
  its own focused queries so both the deleteAccount action and the user-detail
  page can call it without threading a pre-loaded user object. Each block below
  maps to one guard in the design spec dated 2026-07-01.
*/
export async function gatherDeletionFacts(
  userId: string,
  actingAdminId: string,
): Promise<DeletionFacts> {
  const [
    target,
    enabledAdmins,
    adminActions,
    initiatedAudits,
    auditSelections,
    deficiencies,
    proSubs,
    ceCerts,
  ] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { staffRole: true, disabledAt: true, companyId: true },
    }),
    prisma.user.count({ where: { staffRole: "ADMIN", disabledAt: null } }),
    prisma.adminAuditLog.count({ where: { actorUserId: userId } }),
    prisma.auditBatch.count({ where: { initiatedById: userId } }),
    prisma.auditSelection.count({ where: { userLicense: { licenseeId: userId } } }),
    prisma.deficiency.count({ where: { userLicense: { licenseeId: userId } } }),
    prisma.proSubscription.count({ where: { licenseeId: userId } }),
    prisma.ceCertificate.count({ where: { licenseeId: userId } }),
  ]);

  const companyId = target?.companyId ?? null;
  let companyHasActivity = false;
  if (companyId) {
    const [apps, courses, issued, billing] = await Promise.all([
      prisma.courseApplication.count({ where: { companyId, status: { not: "DRAFT" } } }),
      prisma.accreditedCourse.count({ where: { companyId } }),
      prisma.issuedCertificate.count({ where: { companyId } }),
      prisma.billingTransaction.count({ where: { companyId } }),
    ]);
    companyHasActivity = apps + courses + issued + billing > 0;
  }

  const isLastActiveAdmin =
    !!target && target.staffRole === "ADMIN" && !target.disabledAt && enabledAdmins <= 1;

  return {
    isSelf: userId === actingAdminId,
    isLastActiveAdmin,
    hasPerformedAdminActions: adminActions > 0,
    hasInitiatedAudits: initiatedAudits > 0,
    isUnderAudit: auditSelections + deficiencies > 0,
    hasProSubscription: proSubs > 0,
    hasCeCertificates: ceCerts > 0,
    companyHasActivity,
  };
}
```

- [ ] **Step 2: Add imports to `lib/admin/users.ts`**

At the top of `lib/admin/users.ts`, alongside the existing imports, add:

```ts
import { evaluateDeletable } from "@/lib/admin/deletion-rules";
import { gatherDeletionFacts } from "@/lib/admin/deletion";
```

- [ ] **Step 3: Add the `deleteAccount` action**

Append to `lib/admin/users.ts` (after `unsuspendAccount`, in the lifecycle section):

```ts
// ── lifecycle: hard delete (test-reset) ──────────────────────────────────────
//
// Permanently removes the account from BOTH Prisma and Supabase Auth so the
// email can be re-used at /signup. Guarded to "clean" accounts only (see
// evaluateDeletable); anything with real records is blocked and must be
// suspended. Auth is deleted first so the whole op is retry-safe. See the
// design spec dated 2026-07-01.
export async function deleteAccount(formData: FormData) {
  const admin = await requireStaff("ADMIN");
  const parsed = resolveSchema.safeParse({ userId: field(formData, "userId") });
  if (!parsed.success) fail(field(formData, "userId"), "Invalid request.");
  const { userId } = parsed.data;

  const before = await loadTarget(userId);
  if (!before) fail(userId, "Account not found.");

  const decision = evaluateDeletable(await gatherDeletionFacts(userId, admin.id));
  if (!decision.deletable) fail(userId, decision.reason);

  // 1. Free the email in Supabase Auth first. Treat "already gone" (404) as
  //    success so a retry after a mid-op failure still converges.
  const sb = createServiceRoleClient();
  const { error: authErr } = await sb.auth.admin.deleteUser(userId);
  if (authErr && authErr.status !== 404) {
    console.error("[deleteAccount] Supabase auth deletion failed", authErr);
    fail(userId, "Could not remove the login. Please try again.");
  }

  // 2. Remove the row + dependent workflow rows + write the audit entry
  //    atomically. Owned ProTrack children cascade; optional attribution refs
  //    (reviewedById, audit-log targetUserId, etc.) SET NULL automatically.
  //    Access requests are a required FK (ON DELETE RESTRICT), so clear them first.
  try {
    await prisma.$transaction(async (tx) => {
      await tx.accessRequest.deleteMany({ where: { userId } });
      await tx.user.delete({ where: { id: userId } });
      await recordAdminAction(tx, {
        actorUserId: admin.id,
        targetUserId: null,
        action: "ACCOUNT_DELETED",
        summary: `Deleted ${before.email}`,
        details: {
          email: before.email,
          firstName: before.firstName,
          lastName: before.lastName,
          staffRole: before.staffRole,
          companyId: before.companyId,
          protrackTier: before.protrackTier,
          verifyAccess: before.verifyAccess,
          boardId: before.boardId,
        },
      });
    });
  } catch (err) {
    console.error("[deleteAccount] row deletion failed after auth removal", err);
    fail(userId, "Could not finish deleting the account. Please retry.");
  }

  revalidatePath("/admin/users");
  redirect("/admin/users?ok=deleted");
}
```

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: no errors. (Confirms the `details` object, the `"ACCOUNT_DELETED"` literal, and the `tx` argument to `recordAdminAction` all type-check — the audit helper accepts `Prisma.TransactionClient | typeof prisma` and a nullable `targetUserId`.)

- [ ] **Step 5: Lint**

Run: `pnpm lint`
Expected: no new errors.

- [ ] **Step 6: Stage + propose commit**

```bash
git add lib/admin/deletion.ts lib/admin/users.ts
```
Proposed message: `feat(admin): deleteAccount server action with clean-account guard`

---

### Task 4: Type-the-email confirmation dialog

**Files:**
- Create: `components/admin/confirm-delete-user.tsx`

**Interfaces:**
- Consumes: `deleteAccount` (Task 3).
- Produces: `function ConfirmDeleteUser({ userId, email }: { userId: string; email: string })` — default-styled danger button that opens a modal requiring the exact email before the submit arms.

- [ ] **Step 1: Create the component**

Create `components/admin/confirm-delete-user.tsx`:

```tsx
"use client";

import { useRef, useState } from "react";
import { deleteAccount } from "@/lib/admin/users";

/*
  Hard-delete confirmation. Mirrors ConfirmSuspendUser (native <dialog> via
  showModal for focus-trap + ESC + top-layer backdrop). Because deletion is
  irreversible and frees the email for re-signup, the submit stays disabled
  until the admin types the exact account email. The guard in evaluateDeletable
  already ensures only clean accounts reach this dialog; the typing is friction,
  not a second guard. Copy is em-dash-free per brand rules.
*/
export function ConfirmDeleteUser({ userId, email }: { userId: string; email: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [confirmText, setConfirmText] = useState("");
  const armed = confirmText.trim().toLowerCase() === email.toLowerCase();

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="rounded-md border border-red bg-red-bg px-3 py-1.5 text-[12px] font-semibold text-red transition-colors hover:bg-red hover:text-white"
      >
        Delete account
      </button>

      <dialog
        ref={dialogRef}
        onClose={() => setConfirmText("")}
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
        className="m-auto w-[min(92vw,480px)] rounded-xl border border-border bg-white p-0 shadow-lg backdrop:bg-navy/60"
      >
        <div className="border-b border-border px-5 py-3.5">
          <h2 className="text-balance font-serif text-lg font-bold text-navy">
            Delete this account permanently?
          </h2>
        </div>
        <div className="space-y-3 px-5 py-4">
          <p className="text-pretty text-[13px] leading-relaxed text-text-mid">
            <span className="font-semibold text-navy">{email}</span> and its
            profile, licenses, and CE records will be permanently removed, and
            the login will be deleted so the same email can sign up again. This
            cannot be undone.
          </p>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-text-mid">
              Type the account email to confirm
            </label>
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={email}
              autoComplete="off"
              className="w-full rounded-md border border-border px-3 py-2 text-[13px]"
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            className="rounded-md border border-border px-3 py-1.5 text-[12px] font-semibold text-text-mid hover:bg-surface"
          >
            Cancel
          </button>
          <form action={deleteAccount}>
            <input type="hidden" name="userId" value={userId} />
            <button
              type="submit"
              disabled={!armed}
              className="rounded-md bg-red px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-red/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Delete permanently
            </button>
          </form>
        </div>
      </dialog>
    </>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 3: Stage + propose commit**

```bash
git add components/admin/confirm-delete-user.tsx
```
Proposed message: `feat(admin): type-the-email delete confirmation dialog`

---

### Task 5: Danger zone on the user-detail page + list success message

**Files:**
- Modify: `app/admin/users/[id]/page.tsx`
- Modify: `app/admin/users/page.tsx`

**Interfaces:**
- Consumes: `ConfirmDeleteUser` (Task 4); `evaluateDeletable` (Task 1); `gatherDeletionFacts` (Task 3).
- Produces: nothing consumed downstream.

- [ ] **Step 1: Import the pieces in the detail page**

In `app/admin/users/[id]/page.tsx`, add to the imports:

```ts
import { ConfirmDeleteUser } from "@/components/admin/confirm-delete-user";
import { evaluateDeletable } from "@/lib/admin/deletion-rules";
import { gatherDeletionFacts } from "@/lib/admin/deletion";
```

- [ ] **Step 2: Capture the acting admin**

In `app/admin/users/[id]/page.tsx`, change the guard line so the admin id is available:

```ts
// was: await requireStaff("ADMIN");
const admin = await requireStaff("ADMIN");
```

- [ ] **Step 3: Compute deletability after `user` is loaded**

In `app/admin/users/[id]/page.tsx`, after the `ownershipSummary` block (just before the `return (`), add:

```ts
// Danger-zone eligibility: same rule the deleteAccount action enforces.
const deletion = evaluateDeletable(await gatherDeletionFacts(user.id, admin.id));
```

- [ ] **Step 4: Render the Danger zone**

In `app/admin/users/[id]/page.tsx`, immediately after the closing `</div>` of the "Ownership & activity" card (after line ~294, before the final `</>`), add:

```tsx
      {/* Danger zone */}
      <h2 className="mt-8 mb-3 text-[13px] font-semibold text-red">Danger zone</h2>
      <div className="rounded-lg border border-red/40 bg-red-bg/40 p-4">
        <p className="mb-3 text-[12px] text-text-mid">
          Permanently delete this account and free its email for re-signup. Use
          this to reset test accounts. Accounts with real records are protected,
          suspend those instead.
        </p>
        {deletion.deletable ? (
          <ConfirmDeleteUser userId={user.id} email={user.email} />
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled
              className="rounded-md border border-border px-3 py-1.5 text-[12px] font-semibold text-text-muted opacity-60"
            >
              Delete account
            </button>
            <span className="text-[12px] text-text-mid">{deletion.reason}</span>
          </div>
        )}
      </div>
```

- [ ] **Step 5: Add the `deleted` success message to the list page**

In `app/admin/users/page.tsx`, extend `OK_MESSAGES` (lines 21-23):

```ts
const OK_MESSAGES: Record<string, string> = {
  created: "Account created and a set-password invite was sent.",
  deleted: "Account deleted.",
};
```

- [ ] **Step 6: Typecheck + build + lint**

Run: `pnpm typecheck`
Expected: no errors.
Run: `pnpm build`
Expected: build completes with no errors.
Run: `pnpm lint`
Expected: no new errors.

- [ ] **Step 7: Stage + propose commit**

```bash
git add "app/admin/users/[id]/page.tsx" app/admin/users/page.tsx
```
Proposed message: `feat(admin): danger zone with guarded delete on user detail`

---

### Task 6: Manual end-to-end verification

**Files:** none (verification only).

No unit test can exercise the Prisma + Supabase + redirect wiring in this codebase's style, so verify by hand in dev. Requires `pnpm dev` running and the seed data from `pnpm seed` / `pnpm seed:verify`. Sign in as an admin (`jay@wilburncreative.com` or `john@dentalace.org`).

- [ ] **Step 1: Happy path (clean ProTrack account)**

  1. Go to `/signup`, create a throwaway ProTrack account (e.g. `reset-test@example.com`), and verify its email via the dev `[verify-email:DEV_LINK]` console link.
  2. As admin, open `/admin/users`, find the account, open its detail page.
  3. Confirm the **Danger zone** shows an enabled "Delete account" button.
  4. Click it, confirm the submit is **disabled** until you type the exact email, then delete.
  5. Confirm redirect to `/admin/users` with the green "Account deleted." banner and the account gone from the list.

- [ ] **Step 2: Email is actually freed**

  1. Go to `/signup` and register **the same email again**.
  2. Expected: signup succeeds (no "email already in use" from Prisma or Supabase Auth), proving both systems released it.

- [ ] **Step 3: Audit entry recorded**

  1. Open `/admin/audit`.
  2. Expected: an `ACCOUNT_DELETED` row for the deleted email (target shows as gone; the email is preserved in the entry).

- [ ] **Step 4: Blocked, company activity**

  1. Open the seeded DentalACE customer (`customer@dentalace.org`, linked to Texas Dental Association, which has applications/billing).
  2. Expected: Danger zone shows a **disabled** button with "This company has accreditation or billing activity. Suspend it instead."

- [ ] **Step 5: Blocked, CE records**

  1. Open the seeded ProTrack user (`sarah.mitchell@example.com`, six CE certificates).
  2. Expected: disabled button with "This account has CE records. Suspend it instead."

- [ ] **Step 6: Blocked, self and last admin**

  1. Open your own admin detail page. Expected: disabled with "You can't delete your own account."
  2. (If a second admin exists) confirm a non-last admin who has performed admin actions shows "This account has performed admin actions. Suspend it instead."

- [ ] **Step 7: Final green check**

Run: `pnpm typecheck && pnpm test && pnpm build`
Expected: all clean.

- [ ] **Step 8: Report**

Summarize the e2e results (pass/fail per step) back to the user for the commit decision. Do not push.

---

## Self-Review notes (author)

- **Spec coverage:** two-system delete (Task 3 steps 3), guard predicate all 8 conditions (Task 1 + Task 3 gatherer), AccessRequest RESTRICT handling (Task 3 txn), enum + audit row (Task 2, Task 3), type-the-email dialog (Task 4), danger-zone with legible reason (Task 5), redirect-to-list success message (Task 5 step 5), verification incl. blocked paths + retry idempotency (Task 6). Orphaned-company limitation is a documented non-goal, no task needed.
- **Placeholder scan:** every code step contains full code; no TBD/TODO.
- **Type consistency:** `DeletionFacts`/`DeletionDecision`/`evaluateDeletable` names and the eight fact fields are identical across Tasks 1, 3, and 5; `gatherDeletionFacts(userId, actingAdminId)` signature matches its two call sites; `ConfirmDeleteUser({ userId, email })` matches its usage.
