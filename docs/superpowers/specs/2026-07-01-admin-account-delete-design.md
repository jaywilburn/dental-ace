# Admin "Delete Account" (Test-Reset) — Design

- **Date:** 2026-07-01
- **Status:** Approved for planning
- **Author:** Jay + Claude (brainstorm)
- **Related:** [`2026-06-04-dentalace-m3-admin-tooling-hardening-design.md`](./2026-06-04-dentalace-m3-admin-tooling-hardening-design.md) (admin user-management surface), [`2026-06-13-role-approval-access-design.md`](./2026-06-13-role-approval-access-design.md) (access-request flow whose rows this action must clear).

---

## Goal

Give AADB admins a **Delete account** action in `/admin/users/[id]` so they can permanently remove an account and free its email address in **both** systems that hold it (Prisma `users.email` and Supabase Auth), allowing the same email to be re-used at `/signup`.

The driving use case is **testing**: during the pre-launch phase, admins repeatedly sign up, exercise a flow, and want to "start over" with the same email rather than burning a fresh address each time. Suspend (`disabledAt`) cannot do this — it keeps both the row and the auth user, so the email stays taken. A secondary use case is offboarding personnel who need their data removed.

This is an addition to the existing admin user-management surface (`lib/admin/users.ts` + `app/admin/users/[id]`), which today tops out at suspend/unsuspend under an explicit "we never hard-delete" policy. This design carves a **narrow, guarded exception** to that policy rather than overturning it.

---

## Decisions (locked during brainstorming)

1. **Hard delete, not in-place reset.** The email must be released so re-signup runs as a genuinely new user (and so the signup path itself is exercised). An in-place "wipe the row's data but keep it" reset was rejected — it doesn't free the email and doesn't test signup.
2. **Two-system release.** Delete the Supabase Auth user **and** the Prisma `users` row. Freeing only one leaves the email taken by the other.
3. **Hard-block guard, suspend-instead.** Accounts carrying real, irreversible records cannot be deleted; the action refuses with a "suspend it instead" message. This preserves the existing no-hard-delete compliance floor for real data while letting clean/test accounts delete freely. During testing the guard never fires (test accounts are clean).
4. **CE certificates block.** A ProTrack `CeCertificate` counts as real compliance history → suspend instead. (Implication: a ProTrack test account that has uploaded a CE cert can no longer be one-click reset; reset it by re-seeding or removing the cert first. Accepted.)
5. **Type-the-email confirm.** The action is fronted by a dialog requiring the admin to type the account's email to arm the button. This is UX friction for an irreversible action, distinct from (and on top of) the guard.
6. **Audit everything.** Deletion writes an `AdminAuditLog` row with `targetUserId = null` (target is gone) and the deleted identity preserved in `details`, matching how the log already handles vanished targets.

### Non-goals

- **No company deletion.** Deleting the last member of a company leaves an orphaned empty `companies` row. Company cleanup is out of scope; the primary use case is ProTrack Free accounts. (Noted as a known limitation.)
- **No schema change to referential actions.** We do not make `AdminAuditLog.actorUserId` nullable; instead the guard blocks deleting accounts that have *performed* admin actions (they suspend instead). The only DB change is one additive enum value.
- **No bulk delete, no self-serve account deletion.** Admin-only, one account at a time.
- **No change to suspend/unsuspend** or any other existing admin action.

---

## The action: `deleteAccount`

New server action in `lib/admin/users.ts`, following the file's established contract: `requireStaff("ADMIN")` → Zod-validate → guard → mutate (+ `recordAdminAction`) → `revalidatePath` → redirect with `?ok=`/`?error=`.

```
deleteAccount(formData)  // { userId }
```

**Order of operations (retry-safe):**

1. `requireStaff("ADMIN")`; Zod-parse `userId` (`resolveSchema`).
2. Load the target (email, name, entitlement snapshot for the audit record). 404 → fail.
3. Run all guards (below). Any hit → `fail(userId, "<reason>. Suspend it instead.")`, which redirects back to the detail page with the message.
4. **Delete the Supabase Auth user first** via `createServiceRoleClient().auth.admin.deleteUser(userId)`, treating "user not found" as success (idempotent). Auth-first makes the whole action retry-safe: if step 5 throws, a retry re-runs guards (row still present), the auth delete no-ops, and the Prisma txn completes.
5. **Prisma transaction:**
   - `tx.accessRequest.deleteMany({ where: { userId } })` — required FK with `ON DELETE RESTRICT`; must clear before the user row. Access requests are workflow ephemera, safe to drop with the account.
   - `tx.user.delete({ where: { id: userId } })` — cascades owned ProTrack children, SetNulls optional attribution refs (see below).
   - `recordAdminAction(tx, { actorUserId: admin.id, targetUserId: null, action: "ACCOUNT_DELETED", summary: \`Deleted <email>\`, details: { email, firstName, lastName, staffRole, companyId, protrackTier, verifyAccess, boardId } })`.
6. `revalidatePath("/admin/users")`; redirect to `/admin/users?ok=deleted` (no detail page remains).

**Partial-failure note:** if step 5 throws after step 4 succeeded, the account can no longer sign in (auth gone) but the row lingers; the thrown error surfaces on the detail page and a retry cleans it up. This mirrors the cross-system tradeoff already present in `createUserAccount` (auth-create → prisma-create → roll back auth on failure).

---

## Referential handling (verified against `prisma/schema.prisma`)

Every FK into `User` was traced. The schema already does most of the work:

**Auto-cascades (owned, `onDelete: Cascade` already declared) — deleted with the user:**
- `UserLicense` (and, transitively, nothing — see guard; audited licenses block)
- `CeCertificate`
- `ProSubscription`

**Auto-nulls (optional refs, Prisma default `SetNull`) — attribution preserved as unassigned:**
- `CourseApplication.reviewedById`
- `Event.reviewedById`
- `AdminAuditLog.targetUserId`
- `AccessRequest.decidedByUserId`
- `NoticeSent.sentById`
- `BillingTransaction.performedById`

**Cleared explicitly in the transaction:**
- `AccessRequest.userId` — **required**, `ON DELETE RESTRICT` (schema comment calls this out). `deleteMany` before `user.delete()`.

**Covered by the guard (so their `RESTRICT` FKs never block a delete):**
- `AdminAuditLog.actorUserId` (required) → blocked by "has performed admin actions".
- `AuditBatch.initiatedById` (required) → blocked by "initiated audit batches".
- `AuditSelection.userLicenseId` / `Deficiency.userLicenseId` (required, ref `UserLicense`) → blocked by "under audit".

**Schema change:** exactly one, additive — a new `ACCOUNT_DELETED` value on the `AdminAuditAction` enum. Prisma migration + the raw-SQL `ALTER TYPE "AdminAuditAction" ADD VALUE 'ACCOUNT_DELETED'`. No referential-action changes, no nullability changes.

---

## The guard (`isDeletable` predicate)

Deletion is **blocked** — with a specific suspend-instead message — if *any* of the following is true. The same predicate drives the UI's enable/disable state, so an admin always sees *why* an account is protected.

| Block condition | Query | Reason string |
|---|---|---|
| Target is the acting admin | `userId === admin.id` | "You can't delete your own account." |
| Last active admin | `isLastEnabledAdmin(userId)` (existing helper) | "This is the last active admin." |
| Has performed admin actions | `adminActionsPerformed` count > 0 | "This account has performed admin actions." |
| Initiated audit batches | `initiatedAuditBatches` count > 0 | "This account has initiated audits." |
| Under audit | any `AuditSelection`/`Deficiency` on the user's licenses | "This account appears in an audit." |
| Has ProTrack billing | `ProSubscription` exists | "This account has an active subscription." |
| Has CE history | `CeCertificate` count > 0 | "This account has CE records." |
| Company has real activity | linked company has any non-DRAFT `CourseApplication`, any `AccreditedCourse`, any `IssuedCertificate`, or any `BillingTransaction` | "This company has accreditation or billing activity." |

Bare `UserLicense` rows do **not** block (profile data, no external side effect, cascade cleanly). A fresh `/signup` ProTrack account (no certs, no sub, no company) is always deletable — the target case.

Implementation: a single `isDeletable(userId)` helper returning `{ deletable: boolean, reason?: string }`, run both in the action (authoritative) and on the detail page (for UI state). Counts are batched.

---

## UI

`app/admin/users/[id]/page.tsx` gains a **Danger zone** section at the bottom (visually distinct, red-accented), rendered under the existing suspend controls.

- The page calls `isDeletable(user.id)`.
- **Deletable:** render `<ConfirmDeleteUser userId email />` — a client dialog mirroring the existing `components/admin/confirm-suspend-user.tsx`. The confirm button stays disabled until the admin types the exact account email; on submit it posts to the `deleteAccount` action.
- **Blocked:** render a disabled button with the `reason` inline (e.g. "This account has CE records. Suspend it instead."), so the protection is legible.
- Copy is em-dash-free and follows brand rules.

The `/admin/users` list and `/admin/audit` need no structural change; `ACCOUNT_DELETED` rows render through the existing audit list (which already tolerates a null target).

---

## Testing / verification

- `pnpm typecheck` and `pnpm build` clean.
- **Happy path (manual e2e, dev):** sign up a throwaway ProTrack account → `/admin/users/[id]` → Danger zone → type email → delete → confirm redirect to `/admin/users?ok=deleted` → re-run `/signup` with the **same email** and confirm it succeeds → confirm an `ACCOUNT_DELETED` entry with the preserved email shows in `/admin/audit`.
- **Blocked path:** open the seeded DentalACE customer (Texas Dental Association has applications + billing) and confirm the Danger zone shows the button disabled with the company-activity reason; open a ProTrack account with a CE cert (seeded Sarah) and confirm the CE-records reason.
- **Guard/self:** confirm an admin cannot delete themselves or the last active admin.
- **Idempotent retry:** (spot check) deleting an account whose Supabase auth user is already gone still completes.

---

## Files touched (anticipated)

- `prisma/schema.prisma` — add `ACCOUNT_DELETED` to `AdminAuditAction`.
- `prisma/migrations/**` + a raw-SQL enum `ADD VALUE` (applied per project convention).
- `lib/admin/users.ts` — `deleteAccount` action + `isDeletable` helper (or a small `lib/admin/deletion.ts` if the helper grows).
- `components/admin/confirm-delete-user.tsx` — new type-the-email dialog.
- `app/admin/users/[id]/page.tsx` — Danger zone section + `isDeletable` call.
- No RLS migration: the action runs through the existing Prisma admin path, same as every other action in `lib/admin/users.ts`.
