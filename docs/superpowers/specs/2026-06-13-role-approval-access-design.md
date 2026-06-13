# Role-Declared, Approval-Gated Access — Design

- **Date:** 2026-06-13
- **Status:** Approved for planning
- **Author:** Jay + Claude (brainstorm)
- **Supersedes:** the earlier "derive landing from entitlements only, no schema change" decision (an approval gate requires persisting the request, so a table is now in scope).

---

## Goal

When a user signs up, capture what they are here to do, and make sure that once they have access they land on the right area on login. Privileged identities (acting for a CE provider, a state board, or as AADB staff) are **self-declared but admin-approved** before any access is granted, so self-declaration can never be a privilege-escalation path. Personal CE tracking (ProTrack) stays instant self-serve.

This is two independently shippable parts:

- **Part 1 — Entitlement-based login redirect.** Small. Makes login land in the right area once entitlements exist.
- **Part 2 — Approval-gated role requests.** Larger. Self-declared role → pending request → admin approval → entitlement granted.

---

## Decisions (locked during brainstorming)

1. **Trust-tiered approval.** Individual / ProTrack is instant (nothing to verify). `COMPANY`, `BOARD`, `REVIEWER`, `ADMIN` require admin approval before the entitlement is granted.
2. **Account creation is always instant** at the ProTrack floor. The privileged grant is a separate `AccessRequest`.
3. **Login redirect is entitlement-derived** (Part 1), falling back to `/home` when no privileged entitlement exists.
4. **Role stays a starting point, not exclusive.** No `Role` enum; the per-user entitlement columns remain the source of truth. An account can hold more than one entitlement over time.
5. **Minimal churn to existing pages.** Keep `/signup`, `/signup/board`, and `/company/register` where they are; change their *outcome* from instant-grant to pending-request. Add one small staff-request form.
6. **Pending UX = blur + popup.** A user with a pending request who enters their gated area sees the area blurred behind an "under review" popup, instead of a silent redirect to `/home`.
7. **Approver = any AADB `ADMIN`**, via a new `/admin/access-requests` queue.

### Non-goals

- No `Role` enum, no exclusive single-role model, no changes to RLS access semantics for existing areas, no JWT/access-token-hook changes (the hook already mirrors `staff_role`/`company_id`/`verify_access` when the grant updates the `users` row).
- No "join an existing company by invite" — `COMPANY` approval creates a **new** org from the submitted name. Org-member invites are a future feature.
- No board-admin delegation — only AADB admins approve. (Existing `/signup/board` note about "subsequent admins join via invite" is unchanged and still a follow-up.)
- No auto-sign-in changes; the verify-email flow still redirects to `/login`.

---

## Part 1 — Entitlement-based login redirect

Today `homePathFor()` returns `/home` unconditionally, and `app/api/auth/signin/route.ts` selects only `{ id, emailVerifiedAt, disabledAt }`.

**Changes:**

- Add `landingPathFor(e: { staffRole, companyId, verifyAccess })` to `lib/auth/session.ts`, priority order:
  1. `staffRole === "ADMIN"` → `/admin`
  2. `staffRole === "REVIEWER"` → `/reviewer`
  3. `companyId` → `/company`
  4. `verifyAccess` → `/board`
  5. else → `/home` (hub: ProTrack + request entry points + any pending status)
- `signin/route.ts`: widen the post-auth Prisma select to include `staffRole, companyId, verifyAccess`; redirect to `landingPathFor(row)` instead of `homePathFor()`. Keep the existing `emailVerifiedAt`/`disabledAt` guards exactly as they are (recently added — suspended + unverified blocks stay).
- `/home` remains a real, always-reachable page — no auto-bounce. The redirect happens only at sign-in.
- `homePathFor()` may be retired or kept as a thin alias for the `/home` literal; not load-bearing after this change.

Part 1 alone delivers the core ask for every account that already has an entitlement (existing customers → `/company`, boards → `/board`, staff → `/admin`/`/reviewer`).

---

## Part 2 — Approval-gated role requests

### Data model

New Prisma model `AccessRequest` (+ `@@map("access_requests")`), plus an `AccessRequestKind` and `AccessRequestStatus` enum:

```
enum AccessRequestKind   { COMPANY  BOARD  REVIEWER  ADMIN }
enum AccessRequestStatus { PENDING  APPROVED  DENIED }

model AccessRequest {
  id              String              @id @default(uuid()) @db.Uuid
  userId          String              @map("user_id") @db.Uuid
  user            User                @relation("AccessRequester", fields: [userId], references: [id])
  kind            AccessRequestKind
  status          AccessRequestStatus @default(PENDING)

  // Role-specific payload (nullable; only the field(s) relevant to `kind` are set)
  companyName     String?             @map("company_name")   // COMPANY
  state           String?                                    // BOARD (2-letter)
  note            String?                                    // optional justification (any kind)

  decidedByUserId String?             @map("decided_by_user_id") @db.Uuid
  decidedBy       User?               @relation("AccessDecider", fields: [decidedByUserId], references: [id])
  decidedAt       DateTime?           @map("decided_at")
  denyReason      String?             @map("deny_reason")
  createdAt       DateTime            @default(now()) @map("created_at")

  @@index([status, createdAt])     // the admin queue
  @@index([userId, status])        // "do I have a pending request?"
  @@map("access_requests")
}
```

- **One open request per kind per user:** enforce with a partial unique index (`UNIQUE (user_id, kind) WHERE status = 'PENDING'`) via a raw-SQL migration (Prisma can't express partial uniques).
- Add the two back-relations to `User` (`AccessRequester`, `AccessDecider`).
- **RLS** (new file under `sql-migrations/`): a user may `SELECT` their own rows; `ADMIN` (per `current_user_role()`) may `SELECT`/`UPDATE` all; no client `INSERT` (writes go through server routes/actions using Prisma over the service path). Follows the existing Phase-1 RLS pattern.

### Helper module — `lib/auth/access-requests.ts`

Single home for request logic so the four entry points and the admin queue don't duplicate it:

- `createRequest(userId, kind, payload)` — validates payload per kind, enforces the one-pending-per-kind rule, inserts `PENDING`, fires the "request received" + "new request" emails.
- `pendingKindsFor(userId)` — returns the set of kinds with a `PENDING` row (used by gated layouts and `/home`).
- `approveRequest(requestId, adminId)` — in one transaction: load+lock the request, apply the entitlement (below), set `status=APPROVED`/`decidedBy`/`decidedAt`, record an admin-audit entry via `recordAdminAction` (`lib/admin/audit.ts`; add `ACCESS_REQUEST_APPROVED`/`ACCESS_REQUEST_DENIED` to `AdminAuditAction` if absent), then email "approved".
- `denyRequest(requestId, adminId, reason)` — set `DENIED` + reason + decision fields, audit, email the reason. A denied user may submit a fresh request.

**Entitlement application on approval:**

| kind | action |
|------|--------|
| `COMPANY` | Create the company from `companyName` (reuse the company-creation core in `lib/company/register-core.ts`), set `users.company_id`. Starts with zero credits, same as today. |
| `BOARD` | Reuse the board find-or-create + state-claim logic from `register-board` (extracted into a shared function), set `users.verify_access = true` + `board_id`. |
| `REVIEWER` | `users.staff_role = "REVIEWER"`. |
| `ADMIN` | `users.staff_role = "ADMIN"`. |

Because approval writes the `users` row, the existing access-token hook picks up the new entitlement; the user's next sign-in lands in their area via Part 1.

### Request entry points (keep existing pages, change outcomes)

1. **`/signup`** — add a lightweight role picker (step 0) ahead of the existing account form. **Important constraint:** signup mints no session (the account stays unverified until the email link is confirmed, which redirects to `/login`). So only flows that are either public-pre-account or post-login can carry a request — the picker cannot drop a freshly-signed-up user into a session-gated page. Concretely:
   - **Track my CE (individual)** → existing inline account form → instant ProTrack account.
   - **State board** → `/signup/board` (public, pre-account; creates account + pending `BOARD` request in one shot).
   - **CE provider** and **AADB Reviewer / Admin** → the standard account form, with copy setting the expectation: "Confirm your email and sign in; you'll request {CE Company / staff} access from your home screen." The actual request is made **post-login from `/home`** (the request hub), because `/company/register` and the staff-request form both require a session. The picker choice here is expectation-setting only.
   - The `as` param only tailors copy; it is **never** read server-side to grant anything.

2. **`/signup/board`** (`app/api/auth/register-board/route.ts`) — keep the form and the **`.gov` first-claim pre-check** and the "state already claimed" rejection as up-front filters, but the successful outcome becomes: create the (unverified) account + a `PENDING BOARD` request carrying `state`. The board row + `verify_access` are **not** created until approval. Split the existing board find-or-create into a shared function called by `approveRequest`.

3. **`/company/register`** (`lib/company/register-actions.ts` → `registerCompany`) — same form; outcome becomes a `PENDING COMPANY` request carrying `companyName` (+ any org fields we keep), instead of creating the company and setting `company_id`. The page's "instant access by design" comment is replaced.

4. **Staff request** — a new small form (reached from `/home`) with kind = REVIEWER or ADMIN and an optional justification `note` → `PENDING` request. Posts to a new route/action that calls `createRequest`.

5. **`/home`** becomes the request hub: ProTrack card (always) + "Request CE Company access / State Board access / staff access" entry points for kinds the user hasn't requested, and a **status card** for each `PENDING` request ("Under review") linking into the relevant gated area.

### Pending UX — `AccessPendingGate`

A shared server component: a blurred, non-interactive decorative skeleton of an area behind a centered popup — "Your {area} access is under review. You'll get in as soon as an AADB admin approves it." No real data is queried (the user has no entitlement yet).

Gated **layouts** change from "require → redirect" to a three-way branch:

```
// app/company/layout.tsx (and board / reviewer / admin analogues)
const user = await requireUser();
if (user.companyId) return <PortalShell …>{children}</PortalShell>;       // entitled
if ((await pendingKindsFor(user.id)).has("COMPANY"))
  return <AccessPendingGate area="DentalACE" />;                          // pending → blur+popup
redirect("/home");                                                        // neither
```

- `/board` ↔ `BOARD`, `/reviewer` ↔ `REVIEWER`, `/admin` ↔ `ADMIN`. (ADMIN is a superset of REVIEWER for *entitlement* checks; the pending gate keys off the specific requested kind.)
- The `require*` guards in `lib/auth/session.ts` keep their redirect behavior for callers that don't opt into the pending gate; only the gated layouts adopt the branch.

### Admin approval queue — `/admin/access-requests`

- New page under `app/admin/` (ADMIN-only; the admin layout already enforces `requireStaff("ADMIN")`). Add a nav item via `navFor("admin")` in `lib/nav/portal-nav.ts`, with a pending-count badge.
- Lists `PENDING` requests: requester name/email, kind, payload (company name / state / note), submitted date.
- **Approve** and **Deny (with reason)** server actions call `approveRequest` / `denyRequest`. Optimistic-safe: actions re-load and lock the row, and no-op if already decided.
- Decisions are written to `AdminAuditLog` in the same transaction.

### Emails (Resend, existing `lib/email/send.ts` + `appBaseUrl`)

Four React Email templates in `emails/`:
1. **Request received** → requester ("we'll review and email you").
2. **New access request** → AADB admins (digest-free, one per request for v1).
3. **Approved** → requester (with a link into their area).
4. **Denied** → requester (with `denyReason`).

> Dependency/risk: per the current project state, `dentalace.org` is not yet verified in Resend, so all sends fail in prod until the client verifies the domain. The code is correct; this feature does not unblock that. In dev, links are logged like the existing `[verify-email:DEV_LINK]` pattern.

---

## Security considerations

- **No self-grant.** Every privileged entitlement is written only by `approveRequest`, executed by an authenticated `ADMIN`. The `as`/role values submitted at signup are display-only.
- **Board `.gov` gate preserved** as a request-time pre-filter; the actual board claim still happens server-side at approval with the state advisory lock, closing the claim race.
- **Pending users are exactly ProTrack-floor** everywhere except the blur+popup overlay; the overlay queries no entitlement-protected data.
- **One pending request per kind** prevents queue spam; denied requests can be re-submitted.
- Suspended (`disabledAt`) accounts remain blocked at sign-in and session load (unchanged).

---

## Files touched

- `prisma/schema.prisma` — `AccessRequest` model + 2 enums + `User` back-relations; new Prisma migration.
- `sql-migrations/NNNN_access_requests_rls.sql` — partial unique index + RLS policies.
- `lib/auth/session.ts` — `landingPathFor`.
- `app/api/auth/signin/route.ts` — widen select + use `landingPathFor`.
- `lib/auth/access-requests.ts` — new helper module (create/pending/approve/deny).
- `app/signup/page.tsx` — role picker (step 0), `as`-aware copy.
- `app/api/auth/register-board/route.ts` — grant → pending `BOARD` request; extract shared board find-or-create.
- `lib/company/register-actions.ts` + `lib/company/register-core.ts` — grant → pending `COMPANY` request; extract shared company-create.
- New staff-request form + route/action.
- `app/home/page.tsx` — request hub + pending status cards.
- `components/access/access-pending-gate.tsx` — new.
- `app/company/layout.tsx`, `app/board/layout.tsx`, `app/reviewer/layout.tsx`, `app/admin/layout.tsx` — pending branch.
- `app/admin/access-requests/page.tsx` + actions; `lib/nav/portal-nav.ts` nav item + badge.
- `lib/admin/audit.ts` / `AdminAuditAction` enum — approval/denial actions.
- `emails/` — 4 templates.

---

## Testing strategy

- **Unit:** `landingPathFor` priority table; `createRequest` one-pending-per-kind enforcement; `approve/deny` state transitions + entitlement application per kind; board `.gov` pre-check.
- **Integration (the seams that bite):** signup → pending request → admin approve → entitlement set → next login lands in area; deny → re-request; pending user hitting a gated route renders the overlay (not a redirect) and renders no protected data.
- **Manual (verify skill, real browser):** each of the four request kinds end-to-end, plus the blur+popup, signed in as the seeded admin.

---

## Sequencing

1. **Part 1** (redirect) — independently shippable; do first.
2. **Part 2** — schema + helper → request entry points → pending UX → admin queue → emails.

---

## Open items / future

- Org-member invites (join an existing company) and board-admin delegation (approve later board members) are explicitly deferred.
- Admin notification could move to a digest if request volume warrants.
- Re-request throttling if denied users spam (out of scope for v1; one-pending-per-kind already bounds it).
