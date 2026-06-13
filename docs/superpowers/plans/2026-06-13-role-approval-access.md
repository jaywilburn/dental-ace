# Role-Declared, Approval-Gated Access — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users self-declare a role at signup; grant personal ProTrack instantly but hold every privileged entitlement (CE Company, State Board, AADB staff) behind an admin-approved request, and redirect each user to their area on login.

**Architecture:** Account creation stays instant at the ProTrack floor. A new `AccessRequest` row captures a self-declared privileged role; an AADB admin approves it, which applies the entitlement to the `users` row (the existing access-token hook then mirrors it). Login computes its destination from entitlements (`landingPathFor`). Pending users see their gated area blurred behind an "under review" popup instead of being redirected.

**Tech Stack:** Next.js 16 (App Router, server components + server actions + route handlers), Prisma + Postgres, Supabase Auth (service-role admin API), Resend (React Email), Vitest, Tailwind v4. Money/locks unchanged.

**Spec:** `docs/superpowers/specs/2026-06-13-role-approval-access-design.md`

**Deviations from spec (deliberate):**
- `AccessRequest` carries a `payload Json` (kind-specific data) + a denormalized `label` for the queue, instead of discrete `companyName`/`state` columns — so the full company registration form survives to approval.
- Board state-claim race + `.gov` gate: `.gov` gate stays at request time; the authoritative board claim (advisory lock + uniqueness) moves to approval.

---

## File Structure

**Create:**
- `lib/auth/grants.ts` — `applyCompanyGrant`, `applyBoardGrant`, `applyStaffGrant` (transaction-scoped entitlement appliers, reused by approval).
- `lib/auth/access-requests.ts` — `createRequest`, `pendingKindsFor`, `approveRequest`, `denyRequest`, plus the pure `validateRequestPayload`.
- `lib/auth/access-requests.test.ts`, `lib/auth/landing-path.test.ts`, `lib/auth/grants.test.ts` — unit tests.
- `components/access/access-pending-gate.tsx` — blurred "under review" overlay.
- `app/admin/access-requests/page.tsx` + `app/admin/access-requests/actions.ts` — approval queue.
- `app/request-access/staff/page.tsx` + `app/request-access/staff/actions.ts` — staff self-request form.
- `emails/access-request-received.tsx`, `emails/access-request-new-admin.tsx`, `emails/access-request-approved.tsx`, `emails/access-request-denied.tsx`.
- `sql-migrations/0012_access_requests_rls.sql`.

**Modify:**
- `lib/auth/session.ts` — add `landingPathFor`.
- `app/api/auth/signin/route.ts` — widen select, use `landingPathFor`.
- `prisma/schema.prisma` — `AccessRequest` model, 2 enums, 2 `AdminAuditAction` values, `User` relations.
- `lib/company/register-actions.ts` — create request instead of granting.
- `app/(onboarding)/company/register/page.tsx` — submitted/under-review state.
- `app/api/auth/register-board/route.ts` — create request instead of granting.
- `app/signup/page.tsx` — role picker (step 0).
- `app/home/page.tsx` — request hub + pending status.
- `app/company/layout.tsx`, `app/board/layout.tsx`, `app/reviewer/layout.tsx`, `app/admin/layout.tsx` — pending branch.
- `lib/nav/portal-nav.ts` — admin nav item.

---

## PHASE 1 — Login redirect (independent, shippable on its own)

### Task 1: `landingPathFor` helper

**Files:**
- Modify: `lib/auth/session.ts`
- Test: `lib/auth/landing-path.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/auth/landing-path.test.ts
import { describe, it, expect } from "vitest";
import { landingPathFor } from "@/lib/auth/session";

const base = { staffRole: "NONE" as const, companyId: null as string | null, verifyAccess: false };

describe("landingPathFor", () => {
  it("sends an admin to /admin (highest priority)", () => {
    expect(landingPathFor({ ...base, staffRole: "ADMIN", companyId: "c1", verifyAccess: true })).toBe("/admin");
  });
  it("sends a reviewer to /reviewer", () => {
    expect(landingPathFor({ ...base, staffRole: "REVIEWER" })).toBe("/reviewer");
  });
  it("sends a company member to /company", () => {
    expect(landingPathFor({ ...base, companyId: "c1" })).toBe("/company");
  });
  it("sends a verify user to /board", () => {
    expect(landingPathFor({ ...base, verifyAccess: true })).toBe("/board");
  });
  it("falls back to /home for a plain ProTrack account", () => {
    expect(landingPathFor(base)).toBe("/home");
  });
  it("prefers company over board when both present", () => {
    expect(landingPathFor({ ...base, companyId: "c1", verifyAccess: true })).toBe("/company");
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `pnpm test landing-path`
Expected: FAIL — `landingPathFor` is not exported.

- [ ] **Step 3: Implement `landingPathFor`** in `lib/auth/session.ts` (add below `homePathFor`):

```ts
/**
 * Post-login destination derived from entitlements. Priority: staff areas,
 * then DentalACE, then Verify, then the /home hub (ProTrack floor + request
 * entry points). Pure + synchronous so it's unit-testable.
 */
export function landingPathFor(e: {
  staffRole: StaffRole;
  companyId: string | null;
  verifyAccess: boolean;
}): string {
  if (e.staffRole === "ADMIN") return "/admin";
  if (e.staffRole === "REVIEWER") return "/reviewer";
  if (e.companyId) return "/company";
  if (e.verifyAccess) return "/board";
  return "/home";
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `pnpm test landing-path`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/auth/session.ts lib/auth/landing-path.test.ts
git commit -m "feat(auth): landingPathFor — entitlement-derived login destination"
```

### Task 2: Use `landingPathFor` in signin

**Files:**
- Modify: `app/api/auth/signin/route.ts:60-70`

- [ ] **Step 1: Widen the post-auth select and use the helper.** Replace the `prisma.user.findUnique` block + the `redirectTo(homePathFor())` line:

```ts
const row = await prisma.user.findUnique({
  where: { id: data.user.id },
  select: {
    id: true,
    emailVerifiedAt: true,
    disabledAt: true,
    staffRole: true,
    companyId: true,
    verifyAccess: true,
  },
});
if (!row) return redirectTo("/login?error=noaccount");
if (!row.emailVerifiedAt) return redirectTo("/login?error=unverified");
if (row.disabledAt) return redirectTo("/login?error=suspended");

const response = redirectTo(landingPathFor(row));
```

- [ ] **Step 2: Fix the import** in `app/api/auth/signin/route.ts`:

```ts
import { landingPathFor } from "@/lib/auth/session";
```
(remove the now-unused `homePathFor` import.)

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 4: Manual verify (real browser, verify skill).** Start `pnpm dev`. Sign in as `customer@dentalace.org` → lands on `/company`. Sign in as `board@dentalace.org` → `/board`. Sign in as `reviewer@dentalace.org` → `/reviewer`. Sign in as `sarah.mitchell@example.com` (ProTrack Free) → `/home`.

- [ ] **Step 5: Commit**

```bash
git add app/api/auth/signin/route.ts
git commit -m "feat(auth): redirect login to the user's primary area"
```

> **Phase 1 is independently shippable here.** Everything below is Part 2.

---

## PHASE 2 — Data model + email templates

### Task 3: `AccessRequest` schema + migration + RLS

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `sql-migrations/0012_access_requests_rls.sql`

- [ ] **Step 1: Add the enums** to `prisma/schema.prisma` (near the other enums, before `model User`):

```prisma
enum AccessRequestKind   { COMPANY  BOARD  REVIEWER  ADMIN }
enum AccessRequestStatus { PENDING  APPROVED  DENIED }
```

- [ ] **Step 2: Add two `AdminAuditAction` values** (inside the existing enum, after `STAFF_ACCOUNT_CREATED`):

```prisma
  ACCESS_REQUEST_APPROVED
  ACCESS_REQUEST_DENIED
```

- [ ] **Step 3: Add the model** to `prisma/schema.prisma`:

```prisma
model AccessRequest {
  id              String              @id @default(uuid()) @db.Uuid
  userId          String              @map("user_id") @db.Uuid
  user            User                @relation("AccessRequester", fields: [userId], references: [id])
  kind            AccessRequestKind
  status          AccessRequestStatus @default(PENDING)
  // Kind-specific data. COMPANY -> full company-register form; BOARD -> {state, boardName}; staff -> {}.
  payload         Json                @default("{}")
  // Optional free-text justification (any kind).
  note            String?
  // Denormalized one-line description for the admin queue (no JSON parse needed).
  label           String

  decidedByUserId String?             @map("decided_by_user_id") @db.Uuid
  decidedBy       User?               @relation("AccessDecider", fields: [decidedByUserId], references: [id])
  decidedAt       DateTime?           @map("decided_at")
  denyReason      String?             @map("deny_reason")
  createdAt       DateTime            @default(now()) @map("created_at")

  @@index([status, createdAt])
  @@index([userId, status])
  @@map("access_requests")
}
```

- [ ] **Step 4: Add the two back-relations to `model User`** (in the relations block):

```prisma
  accessRequests        AccessRequest[]     @relation("AccessRequester")
  accessRequestsDecided AccessRequest[]     @relation("AccessDecider")
```

- [ ] **Step 5: Create the Prisma migration**

Run: `pnpm exec prisma migrate dev --name access_requests`
Expected: migration created + applied; `pnpm exec prisma generate` runs.

- [ ] **Step 6: Write the RLS + partial-unique migration** `sql-migrations/0012_access_requests_rls.sql`:

```sql
-- One open request per kind per user (Prisma can't express partial uniques).
create unique index if not exists access_requests_one_pending_per_kind
  on access_requests (user_id, kind)
  where status = 'PENDING';

alter table access_requests enable row level security;

-- A user can read their own requests.
create policy access_requests_select_own on access_requests
  for select using (user_id = auth.uid());

-- AADB admins can read every request.
create policy access_requests_select_admin on access_requests
  for select using (current_user_role() = 'ADMIN');

-- AADB admins can update (approve/deny). No client INSERT/DELETE: writes go
-- through server routes/actions over the Prisma (service) connection.
create policy access_requests_update_admin on access_requests
  for update using (current_user_role() = 'ADMIN');
```

- [ ] **Step 7: Apply the RLS migration** via the Supabase MCP `apply_migration` tool (name: `0012_access_requests_rls`, body: the SQL above).

- [ ] **Step 8: Typecheck + commit**

Run: `pnpm typecheck` → clean.

```bash
git add prisma/schema.prisma prisma/migrations sql-migrations/0012_access_requests_rls.sql
git commit -m "feat(db): AccessRequest model, enums, partial-unique + RLS"
```

### Task 4: Email templates

**Files:**
- Create: `emails/access-request-received.tsx`, `emails/access-request-new-admin.tsx`, `emails/access-request-approved.tsx`, `emails/access-request-denied.tsx`

- [ ] **Step 1: Create `emails/access-request-received.tsx`** (follow the `emails/company-registered.tsx` pattern — `BrandEmail` wrapper from `./_brand`):

```tsx
import { Text } from "@react-email/components";
import { BrandEmail, emailColors } from "./_brand";

export type AccessRequestReceivedProps = { firstName: string; roleLabel: string };

export default function AccessRequestReceivedEmail({ firstName, roleLabel }: AccessRequestReceivedProps) {
  return (
    <BrandEmail preview={`We received your ${roleLabel} access request`} subject="Access request received">
      <Text style={{ margin: "0 0 14px 0", fontSize: 14, lineHeight: 1.65, color: emailColors.textMid }}>
        Hi {firstName}, we received your request for {roleLabel} access on DentalACE One. An AADB
        administrator will review it shortly. You can keep using ProTrack in the meantime, and we will
        email you as soon as your access is approved.
      </Text>
    </BrandEmail>
  );
}
```

- [ ] **Step 2: Create `emails/access-request-new-admin.tsx`** (notifies AADB; includes a CTA to the queue — use `CtaButton` from `./_brand` like `company-registered.tsx`):

```tsx
import { Text } from "@react-email/components";
import { BrandEmail, CtaButton, emailColors } from "./_brand";

export type AccessRequestNewAdminProps = {
  roleLabel: string;
  requestLabel: string;
  requesterName: string;
  requesterEmail: string;
  queueUrl: string;
};

export default function AccessRequestNewAdminEmail({
  roleLabel, requestLabel, requesterName, requesterEmail, queueUrl,
}: AccessRequestNewAdminProps) {
  return (
    <BrandEmail preview={`New ${roleLabel} access request`} subject="New access request">
      <Text style={{ margin: "0 0 14px 0", fontSize: 14, lineHeight: 1.65, color: emailColors.textMid }}>
        {requesterName} ({requesterEmail}) requested {roleLabel} access: {requestLabel}. Review it in
        the access-request queue.
      </Text>
      <CtaButton href={queueUrl}>Open the queue</CtaButton>
    </BrandEmail>
  );
}
```

- [ ] **Step 3: Create `emails/access-request-approved.tsx`**:

```tsx
import { Text } from "@react-email/components";
import { BrandEmail, CtaButton, emailColors } from "./_brand";

export type AccessRequestApprovedProps = { firstName: string; roleLabel: string; areaUrl: string };

export default function AccessRequestApprovedEmail({ firstName, roleLabel, areaUrl }: AccessRequestApprovedProps) {
  return (
    <BrandEmail preview={`Your ${roleLabel} access is approved`} subject="Access approved">
      <Text style={{ margin: "0 0 14px 0", fontSize: 14, lineHeight: 1.65, color: emailColors.textMid }}>
        Good news, {firstName}. Your {roleLabel} access on DentalACE One has been approved. Sign in and
        you will land in your new area.
      </Text>
      <CtaButton href={areaUrl}>Sign in</CtaButton>
    </BrandEmail>
  );
}
```

- [ ] **Step 4: Create `emails/access-request-denied.tsx`**:

```tsx
import { Text } from "@react-email/components";
import { BrandEmail, emailColors } from "./_brand";

export type AccessRequestDeniedProps = { firstName: string; roleLabel: string; reason: string };

export default function AccessRequestDeniedEmail({ firstName, roleLabel, reason }: AccessRequestDeniedProps) {
  return (
    <BrandEmail preview={`Update on your ${roleLabel} access request`} subject="Access request update">
      <Text style={{ margin: "0 0 14px 0", fontSize: 14, lineHeight: 1.65, color: emailColors.textMid }}>
        Hi {firstName}, we were unable to approve your {roleLabel} access request at this time. Reason:
        {" "}{reason}. If you believe this is a mistake, contact info@dentalace.org or submit a new
        request with more detail.
      </Text>
    </BrandEmail>
  );
}
```

- [ ] **Step 5: Verify `_brand` exports.** Confirm `BrandEmail`, `CtaButton`, `emailColors` are exported from `emails/_brand` (grep). If `CtaButton` is named differently, match the existing name used in `emails/company-registered.tsx`.

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add emails/access-request-*.tsx
git commit -m "feat(email): access-request lifecycle templates"
```

---

## PHASE 3 — Entitlement appliers (`lib/auth/grants.ts`)

These move the company/board create logic out of the signup paths so approval can reuse it.

### Task 5: `applyCompanyGrant` + `applyBoardGrant` + `applyStaffGrant`

**Files:**
- Create: `lib/auth/grants.ts`
- Test: `lib/auth/grants.test.ts`

- [ ] **Step 1: Implement `lib/auth/grants.ts`** (transaction-scoped; throws known sentinels the caller maps to messages):

```ts
import "server-only";
import type { Prisma, StaffRole } from "@prisma/client";
import { companyNameLockKey, isUniqueNameViolation } from "@/lib/company/register-core";
import type { CompanyRegisterInput } from "@/lib/company/register-schema";
import { createHash } from "node:crypto";

export const DUPLICATE_COMPANY = "DUPLICATE_COMPANY";
export const STATE_ALREADY_CLAIMED = "STATE_ALREADY_CLAIMED";

function stateLockKey(state: string): bigint {
  const buf = createHash("sha256").update(state).digest();
  return buf.readBigInt64BE(0);
}

/** Create the company from a stored COMPANY payload + link the user. Returns companyId. */
export async function applyCompanyGrant(
  tx: Prisma.TransactionClient,
  userId: string,
  data: CompanyRegisterInput,
): Promise<string> {
  await tx.$executeRaw`select pg_advisory_xact_lock(${companyNameLockKey(data.name)})`;
  const taken = await tx.company.findFirst({
    where: { name: { equals: data.name, mode: "insensitive" } },
    select: { id: true },
  });
  if (taken) throw new Error(DUPLICATE_COMPANY);
  let company: { id: string };
  try {
    company = await tx.company.create({
      data: {
        name: data.name,
        contactEmail: data.contactEmail,
        contactPhone: data.contactPhone ?? null,
        addressLine1: data.addressLine1,
        addressLine2: data.addressLine2 ?? null,
        city: data.city,
        state: data.state,
        zip: data.zip,
      },
      select: { id: true },
    });
  } catch (err) {
    if (isUniqueNameViolation(err)) throw new Error(DUPLICATE_COMPANY);
    throw err;
  }
  await tx.user.update({ where: { id: userId }, data: { companyId: company.id } });
  return company.id;
}

/** Find-or-fail the board for a state (first-claim), grant verify_access + board_id. Returns boardId. */
export async function applyBoardGrant(
  tx: Prisma.TransactionClient,
  userId: string,
  data: { state: string; boardName: string },
): Promise<string> {
  await tx.$executeRaw`select pg_advisory_xact_lock(${stateLockKey(data.state)})`;
  const existing = await tx.board.findUnique({ where: { state: data.state }, select: { id: true } });
  if (existing) throw new Error(STATE_ALREADY_CLAIMED);
  const board = await tx.board.create({
    data: { state: data.state, name: data.boardName },
    select: { id: true },
  });
  await tx.user.update({ where: { id: userId }, data: { verifyAccess: true, boardId: board.id } });
  return board.id;
}

/** Set the staff role for a REVIEWER/ADMIN grant. */
export async function applyStaffGrant(
  tx: Prisma.TransactionClient,
  userId: string,
  role: Extract<StaffRole, "REVIEWER" | "ADMIN">,
): Promise<void> {
  await tx.user.update({ where: { id: userId }, data: { staffRole: role } });
}
```

- [ ] **Step 2: Write tests** `lib/auth/grants.test.ts` for the pure helpers that don't need a DB — the lock-key determinism and that `stateLockKey` is stable:

```ts
import { describe, it, expect } from "vitest";
import { companyNameLockKey } from "@/lib/company/register-core";

describe("grant lock keys", () => {
  it("company name lock key is case/space-insensitive", () => {
    expect(companyNameLockKey("Texas Dental")).toBe(companyNameLockKey("  texas dental "));
  });
  it("different names produce different keys", () => {
    expect(companyNameLockKey("Alpha")).not.toBe(companyNameLockKey("Beta"));
  });
});
```

(Transaction behavior of `applyCompanyGrant`/`applyBoardGrant` is covered by the integration verify in Task 13, against the real DB.)

- [ ] **Step 3: Run tests + typecheck**

Run: `pnpm test grants && pnpm typecheck`
Expected: PASS + clean.

- [ ] **Step 4: Commit**

```bash
git add lib/auth/grants.ts lib/auth/grants.test.ts
git commit -m "feat(auth): transaction-scoped entitlement appliers"
```

---

## PHASE 4 — Request lifecycle (`lib/auth/access-requests.ts`)

### Task 6: `validateRequestPayload` + `createRequest` + `pendingKindsFor`

**Files:**
- Create: `lib/auth/access-requests.ts`
- Test: `lib/auth/access-requests.test.ts`

- [ ] **Step 1: Write failing tests for the pure validator**:

```ts
// lib/auth/access-requests.test.ts
import { describe, it, expect } from "vitest";
import { validateRequestPayload, roleLabelFor } from "@/lib/auth/access-requests";

describe("validateRequestPayload", () => {
  it("accepts a COMPANY payload and returns a label", () => {
    const r = validateRequestPayload("COMPANY", {
      name: "Bright Smiles", contactEmail: "a@b.com", addressLine1: "1 St",
      city: "Austin", state: "TX", zip: "78701",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.label).toBe("Bright Smiles");
  });
  it("rejects a COMPANY payload with a bad zip", () => {
    const r = validateRequestPayload("COMPANY", { name: "X", contactEmail: "a@b.com", addressLine1: "1", city: "Y", state: "TX", zip: "bad" });
    expect(r.ok).toBe(false);
  });
  it("accepts a BOARD payload", () => {
    const r = validateRequestPayload("BOARD", { state: "TX", boardName: "Texas Board of Dental Examiners" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.label).toContain("Texas");
  });
  it("accepts a REVIEWER payload (empty)", () => {
    const r = validateRequestPayload("REVIEWER", {});
    expect(r.ok).toBe(true);
  });
  it("roleLabelFor is human-readable", () => {
    expect(roleLabelFor("COMPANY")).toBe("CE Company");
    expect(roleLabelFor("BOARD")).toBe("State Board");
    expect(roleLabelFor("REVIEWER")).toBe("AADB Reviewer");
    expect(roleLabelFor("ADMIN")).toBe("AADB Admin");
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm test access-requests`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/auth/access-requests.ts`** (validator + create + pending query):

```ts
import "server-only";
import type { AccessRequestKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { companyRegisterSchema } from "@/lib/company/register-schema";
import { boardSignupSchema } from "@/lib/board/signup-schema";
import { US_STATES } from "@/lib/protrack/reference";
import { sendEmail } from "@/lib/email/send";
import { appBaseUrl } from "@/lib/app-url";
import AccessRequestReceivedEmail from "@/emails/access-request-received";
import AccessRequestNewAdminEmail from "@/emails/access-request-new-admin";

export function roleLabelFor(kind: AccessRequestKind): string {
  return kind === "COMPANY" ? "CE Company"
    : kind === "BOARD" ? "State Board"
    : kind === "REVIEWER" ? "AADB Reviewer"
    : "AADB Admin";
}

const boardPayloadSchema = boardSignupSchema.pick({ state: true, boardName: true });

export type ValidatedPayload =
  | { ok: true; payload: Record<string, unknown>; label: string }
  | { ok: false; message: string };

/** Validate + normalize a request payload by kind, and derive the queue label. */
export function validateRequestPayload(kind: AccessRequestKind, raw: unknown): ValidatedPayload {
  if (kind === "COMPANY") {
    const p = companyRegisterSchema.safeParse(raw);
    if (!p.success) return { ok: false, message: p.error.issues[0]?.message ?? "Check the form." };
    return { ok: true, payload: p.data, label: p.data.name };
  }
  if (kind === "BOARD") {
    const p = boardPayloadSchema.safeParse(raw);
    if (!p.success) return { ok: false, message: p.error.issues[0]?.message ?? "Check the form." };
    if (!US_STATES[p.data.state]) return { ok: false, message: "Pick a valid US state." };
    return { ok: true, payload: p.data, label: `${US_STATES[p.data.state]} — ${p.data.boardName}` };
  }
  return { ok: true, payload: {}, label: roleLabelFor(kind) };
}

/** Kinds the user currently has a PENDING request for. */
export async function pendingKindsFor(userId: string): Promise<Set<AccessRequestKind>> {
  const rows = await prisma.accessRequest.findMany({
    where: { userId, status: "PENDING" },
    select: { kind: true },
  });
  return new Set(rows.map((r) => r.kind));
}

export type CreateRequestResult = { ok: true } | { ok: false; message: string };

/** Create a PENDING request (idempotent on the one-pending-per-kind index) + emails. */
export async function createRequest(
  user: { id: string; email: string; firstName: string | null },
  kind: AccessRequestKind,
  rawPayload: unknown,
  note: string | undefined,
  origin: string,
): Promise<CreateRequestResult> {
  const v = validateRequestPayload(kind, rawPayload);
  if (!v.ok) return { ok: false, message: v.message };

  try {
    await prisma.accessRequest.create({
      data: { userId: user.id, kind, payload: v.payload as object, label: v.label, note: note ?? null },
    });
  } catch (err) {
    // Partial-unique violation -> already have an open request of this kind.
    if (err && typeof err === "object" && "code" in err && (err as { code?: string }).code === "P2002") {
      return { ok: false, message: "You already have a pending request for this access." };
    }
    throw err;
  }

  const roleLabel = roleLabelFor(kind);
  const firstName = user.firstName ?? user.email;
  // Fire-and-forget emails; never block the request on a send failure.
  void sendEmail({
    to: user.email,
    subject: "Access request received",
    react: AccessRequestReceivedEmail({ firstName, roleLabel }),
  }).catch(() => {});
  const adminEmail = process.env.AADB_ADMIN_EMAIL;
  if (adminEmail) {
    void sendEmail({
      to: adminEmail,
      subject: "New access request",
      react: AccessRequestNewAdminEmail({
        roleLabel, requestLabel: v.label,
        requesterName: [user.firstName].filter(Boolean).join(" ") || user.email,
        requesterEmail: user.email,
        queueUrl: `${appBaseUrl(origin)}/admin/access-requests`,
      }),
    }).catch(() => {});
  }
  return { ok: true };
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm test access-requests && pnpm typecheck`
Expected: PASS + clean.

- [ ] **Step 5: Commit**

```bash
git add lib/auth/access-requests.ts lib/auth/access-requests.test.ts
git commit -m "feat(auth): access-request validation + createRequest + pendingKindsFor"
```

### Task 7: `approveRequest` + `denyRequest`

**Files:**
- Modify: `lib/auth/access-requests.ts`

- [ ] **Step 1: Add approve/deny** to `lib/auth/access-requests.ts`:

```ts
// add imports at top:
import { applyCompanyGrant, applyBoardGrant, applyStaffGrant, DUPLICATE_COMPANY, STATE_ALREADY_CLAIMED } from "@/lib/auth/grants";
import { recordAdminAction } from "@/lib/admin/audit";
import type { CompanyRegisterInput } from "@/lib/company/register-schema";
import AccessRequestApprovedEmail from "@/emails/access-request-approved";
import AccessRequestDeniedEmail from "@/emails/access-request-denied";
import { landingPathFor } from "@/lib/auth/session";

export type DecisionResult = { ok: true } | { ok: false; message: string };

export async function approveRequest(requestId: string, adminId: string, origin: string): Promise<DecisionResult> {
  let approved: { userId: string; kind: AccessRequestKind; email: string; firstName: string | null } | null = null;
  try {
    approved = await prisma.$transaction(async (tx) => {
      const req = await tx.accessRequest.findUnique({ where: { id: requestId } });
      if (!req || req.status !== "PENDING") throw new Error("NOT_PENDING");

      if (req.kind === "COMPANY") {
        await applyCompanyGrant(tx, req.userId, req.payload as unknown as CompanyRegisterInput);
      } else if (req.kind === "BOARD") {
        const p = req.payload as { state: string; boardName: string };
        await applyBoardGrant(tx, req.userId, p);
      } else {
        await applyStaffGrant(tx, req.userId, req.kind === "ADMIN" ? "ADMIN" : "REVIEWER");
      }

      await tx.accessRequest.update({
        where: { id: requestId },
        data: { status: "APPROVED", decidedByUserId: adminId, decidedAt: new Date() },
      });
      await recordAdminAction(tx, {
        actorUserId: adminId,
        targetUserId: req.userId,
        action: "ACCESS_REQUEST_APPROVED",
        summary: `Approved ${roleLabelFor(req.kind)} access: ${req.label}`,
        details: { requestId, kind: req.kind },
      });
      const u = await tx.user.findUnique({ where: { id: req.userId }, select: { email: true, firstName: true } });
      return { userId: req.userId, kind: req.kind, email: u!.email, firstName: u!.firstName };
    });
  } catch (err) {
    if (err instanceof Error && err.message === DUPLICATE_COMPANY)
      return { ok: false, message: "That organization name is already registered. Deny this request and ask them to contact AADB." };
    if (err instanceof Error && err.message === STATE_ALREADY_CLAIMED)
      return { ok: false, message: "That state board is already claimed. Deny this request." };
    if (err instanceof Error && err.message === "NOT_PENDING")
      return { ok: false, message: "That request was already decided." };
    throw err;
  }

  const areaUrl = `${appBaseUrl(origin)}${landingPathFor({
    staffRole: approved.kind === "ADMIN" ? "ADMIN" : approved.kind === "REVIEWER" ? "REVIEWER" : "NONE",
    companyId: approved.kind === "COMPANY" ? "x" : null,
    verifyAccess: approved.kind === "BOARD",
  })}`;
  void sendEmail({
    to: approved.email,
    subject: "Access approved",
    react: AccessRequestApprovedEmail({ firstName: approved.firstName ?? approved.email, roleLabel: roleLabelFor(approved.kind), areaUrl }),
  }).catch(() => {});
  return { ok: true };
}

export async function denyRequest(requestId: string, adminId: string, reason: string): Promise<DecisionResult> {
  const trimmed = reason.trim().slice(0, 500) || "Not approved.";
  const decided = await prisma.$transaction(async (tx) => {
    const req = await tx.accessRequest.findUnique({ where: { id: requestId } });
    if (!req || req.status !== "PENDING") return null;
    await tx.accessRequest.update({
      where: { id: requestId },
      data: { status: "DENIED", decidedByUserId: adminId, decidedAt: new Date(), denyReason: trimmed },
    });
    await recordAdminAction(tx, {
      actorUserId: adminId, targetUserId: req.userId, action: "ACCESS_REQUEST_DENIED",
      summary: `Denied ${roleLabelFor(req.kind)} access: ${req.label}`, details: { requestId, kind: req.kind, reason: trimmed },
    });
    const u = await tx.user.findUnique({ where: { id: req.userId }, select: { email: true, firstName: true } });
    return { kind: req.kind, email: u!.email, firstName: u!.firstName };
  });
  if (!decided) return { ok: false, message: "That request was already decided." };
  void sendEmail({
    to: decided.email, subject: "Access request update",
    react: AccessRequestDeniedEmail({ firstName: decided.firstName ?? decided.email, roleLabel: roleLabelFor(decided.kind), reason: trimmed }),
  }).catch(() => {});
  return { ok: true };
}
```

- [ ] **Step 2: Guard against an import cycle.** `access-requests.ts` now imports `landingPathFor` from `session.ts`. Confirm `session.ts` does not import `access-requests.ts` (it must not). If a cycle appears, inline the 5-line area mapping here instead of importing.

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add lib/auth/access-requests.ts
git commit -m "feat(auth): approveRequest + denyRequest with audit + emails"
```

---

## PHASE 5 — Request entry points

### Task 8: Company register → pending request

**Files:**
- Modify: `lib/company/register-actions.ts`
- Modify: `app/(onboarding)/company/register/page.tsx`

- [ ] **Step 1: Rewrite `registerCompany`** in `lib/company/register-actions.ts` so the success path creates a COMPANY request instead of creating the company. Replace the transaction + notify block (everything after the Zod parse) with:

```ts
  const created = await createRequest(
    { id: user.id, email: user.email, firstName: user.firstName },
    "COMPANY",
    {
      name: data.name, contactEmail: data.contactEmail, contactPhone: data.contactPhone,
      addressLine1: data.addressLine1, addressLine2: data.addressLine2, city: data.city,
      state: data.state, zip: data.zip,
    },
    undefined,
    (await headers()).get("origin") ?? "https://dentalace.org",
  );
  if (!created.ok) {
    redirect(`${REGISTER_ROUTE}?error=validation&detail=${encodeURIComponent(created.message)}`);
  }
  redirect(`${REGISTER_ROUTE}?submitted=1`);
```

Update imports: add `import { createRequest, pendingKindsFor } from "@/lib/auth/access-requests";`. Remove every import now made unused by deleting the create+notify block — `companyNameLockKey`, `isUniqueNameViolation`, `sendEmail`, `appBaseUrl`, `CompanyRegisteredEmail`, the `companyRegisterSchema` stays (still parses the form), and the `DUPLICATE_SENTINEL`/`ALREADY_LINKED_SENTINEL` consts. Run `pnpm lint` to catch any leftover. Keep the `requireUser()` + `user.companyId` redirect (an already-approved company member skips this) and the rate limit.

- [ ] **Step 2: Add a guard** at the top of `registerCompany`, after the `companyId` check: if the user already has a PENDING COMPANY request, send them to the submitted state:

```ts
  if ((await pendingKindsFor(user.id)).has("COMPANY")) redirect(`${REGISTER_ROUTE}?submitted=1`);
```

(add `pendingKindsFor` to the `createRequest` import line.)

- [ ] **Step 3: Update the register page** `app/(onboarding)/company/register/page.tsx` to render a "request submitted, under review" panel when `?submitted=1`, before the form. Read `submitted` from `searchParams` and, when set, return a card: heading "Request submitted", body "Your CE Company access is under review. We'll email you when an AADB admin approves it. You can keep using ProTrack from your home screen.", and a `Link` back to `/home`. Reuse the page's existing `<main>/<header>` shell.

- [ ] **Step 4: Typecheck + manual verify.** `pnpm typecheck` clean. With `pnpm dev`, as a ProTrack-only account, visit `/company/register`, submit the form → see the "Request submitted" panel; confirm via `pnpm exec prisma studio` that an `access_requests` row (kind COMPANY, status PENDING, label = org name) exists and the user has **no** `company_id`.

- [ ] **Step 5: Commit**

```bash
git add lib/company/register-actions.ts "app/(onboarding)/company/register/page.tsx"
git commit -m "feat(company): register creates a pending access request, not instant access"
```

### Task 9: Board signup → pending request

**Files:**
- Modify: `app/api/auth/register-board/route.ts`

- [ ] **Step 1: Replace the board+user transaction** with account creation + a pending BOARD request. Keep the Zod parse, the `US_STATES` check, the **state-already-claimed pre-check**, and the **`.gov` gate** exactly as they are. After `const userId = created.user.id;`, replace the `prisma.$transaction(...)` board/user-create block and the `alreadyClaimed` handling with:

```ts
  try {
    await prisma.$transaction(async (tx) => {
      await tx.user.create({
        data: { id: userId, email: data.email, firstName: data.firstName, lastName: data.lastName },
      });
      await tx.accessRequest.create({
        data: {
          userId, kind: "BOARD",
          payload: { state: data.state, boardName: data.boardName },
          label: `${US_STATES[data.state]} — ${data.boardName}`,
        },
      });
    });
  } catch (err) {
    await admin.auth.admin.deleteUser(userId).catch(() => {});
    return back("Something went wrong creating your account. Please try again.");
  }
```

The board row and `verify_access` are NOT set here — `applyBoardGrant` does that at approval. Keep the verification-email send + the `?sent=` redirect unchanged.

- [ ] **Step 2: Fire the admin/notify emails.** After the verification email, best-effort notify AADB of the new request (mirror `createRequest`'s admin email). Simplest: leave the verification email as-is; the "new request" admin email is optional pre-verification, so skip it here (the request is already persisted and visible in the queue). Add a code comment noting the request is created unverified and only actionable after the user confirms their email (an admin can approve earlier, but the user can't sign in until verified anyway).

- [ ] **Step 3: Typecheck + manual verify.** `pnpm typecheck` clean. Submit `/signup/board` with a `.gov` email for an unclaimed state → "check your email"; confirm an `access_requests` row (kind BOARD, PENDING, payload has state+boardName) exists and the user has `verify_access=false`, `board_id=null`. Re-confirm the non-.gov and already-claimed rejections still fire.

- [ ] **Step 4: Commit**

```bash
git add app/api/auth/register-board/route.ts
git commit -m "feat(verify): board signup creates a pending request, granted on approval"
```

### Task 10: Staff self-request form

**Files:**
- Create: `app/request-access/staff/page.tsx`, `app/request-access/staff/actions.ts`

- [ ] **Step 1: Create the server action** `app/request-access/staff/actions.ts`:

```ts
"use server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { requireUser } from "@/lib/auth/session";
import { createRequest } from "@/lib/auth/access-requests";

export async function requestStaffAccess(formData: FormData): Promise<void> {
  const user = await requireUser();
  const kindRaw = String(formData.get("kind") ?? "");
  const kind = kindRaw === "ADMIN" ? "ADMIN" : "REVIEWER"; // never trust beyond these two
  const note = String(formData.get("note") ?? "").trim().slice(0, 500) || undefined;
  const origin = (await headers()).get("origin") ?? "https://dentalace.org";
  const result = await createRequest(
    { id: user.id, email: user.email, firstName: user.firstName },
    kind, {}, note, origin,
  );
  redirect(result.ok ? "/home?requested=staff" : `/request-access/staff?error=${encodeURIComponent(result.message)}`);
}
```

- [ ] **Step 2: Create the page** `app/request-access/staff/page.tsx` — server component, `requireUser()` floor, a small form posting to `requestStaffAccess`: a `kind` select (Reviewer/Admin), an optional `note` textarea, submit. Show `?error=` as a banner. Reuse the navy/white shell from `app/(onboarding)/company/register/page.tsx`. If the user already has a PENDING REVIEWER or ADMIN request (`pendingKindsFor`), render an "under review" panel instead of the form.

- [ ] **Step 3: Typecheck + manual verify.** As a ProTrack-only account, visit `/request-access/staff`, submit Reviewer → redirected to `/home?requested=staff`; confirm a PENDING REVIEWER `access_requests` row exists and `staff_role` is still `NONE`.

- [ ] **Step 4: Commit**

```bash
git add app/request-access/staff
git commit -m "feat(staff): self-request form for reviewer/admin access"
```

### Task 11: Signup role picker

**Files:**
- Modify: `app/signup/page.tsx`

- [ ] **Step 1: Add a step-0 role chooser.** Read `as` from `searchParams`. When `as` is unset, render four cards before the form: **Track my CE** (`/signup?as=individual`), **CE provider** (`/signup?as=company`), **State board** (links to `/signup/board`), and a non-clickable note "AADB Reviewer/Admin: request access from your home screen after signing in." When `as` is `individual` or `company`, render the existing account form with tailored heading/subcopy and a "← Change" link back to `/signup`. `state board` routes away entirely. The `as` value is **not** posted to `/api/auth/register` (it stays display-only).

- [ ] **Step 2: Tailor copy only.** For `as=company`, the subcopy reads: "Create your account first. After you confirm your email and sign in, you'll request CE Company access from your home screen." The form fields and POST target are unchanged.

- [ ] **Step 3: Typecheck + manual verify.** `/signup` shows the chooser; `/signup?as=individual` shows the form; `/signup?as=company` shows the form with company copy; the State board card navigates to `/signup/board`. Submitting still creates an instant ProTrack account (unchanged register route).

- [ ] **Step 4: Commit**

```bash
git add app/signup/page.tsx
git commit -m "feat(signup): role picker routing to the right starting flow"
```

---

## PHASE 6 — Pending UX

### Task 12: `AccessPendingGate` component

**Files:**
- Create: `components/access/access-pending-gate.tsx`

- [ ] **Step 1: Implement the overlay** (decorative blurred skeleton + centered popup; no data):

```tsx
import Link from "next/link";

/*
  Shown by a gated layout when the user has a PENDING request for that area but
  no entitlement yet. A blurred, inert skeleton sits behind a centered popup.
  No entitlement-protected data is queried.
*/
export function AccessPendingGate({ area }: { area: string }) {
  return (
    <div className="relative min-h-dvh bg-surface">
      <div aria-hidden className="pointer-events-none select-none blur-sm opacity-60 p-6">
        <div className="h-8 w-56 rounded bg-border" />
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 rounded-lg border border-border bg-white" />
          ))}
        </div>
        <div className="mt-5 h-48 rounded-lg border border-border bg-white" />
      </div>
      <div className="absolute inset-0 grid place-items-center px-4">
        <div className="w-full max-w-md rounded-xl border border-border bg-white p-7 text-center shadow-lg">
          <span aria-hidden className="text-3xl">⏳</span>
          <h1 className="mt-2 font-serif text-xl font-bold text-navy text-balance">
            Your {area} access is under review
          </h1>
          <p className="mx-auto mt-2 max-w-sm text-[12px] text-text-muted text-pretty">
            An AADB administrator is reviewing your request. You'll get in as soon as it's approved,
            and we'll email you. In the meantime you can keep using ProTrack.
          </p>
          <Link
            href="/home"
            className="mt-5 inline-block rounded-md bg-navy px-4 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-navy/90"
          >
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm typecheck` → clean.

```bash
git add components/access/access-pending-gate.tsx
git commit -m "feat(access): AccessPendingGate under-review overlay"
```

### Task 13: Wire the pending branch into gated layouts

**Files:**
- Modify: `app/company/layout.tsx`, `app/board/layout.tsx`, `app/reviewer/layout.tsx`, `app/admin/layout.tsx`

- [ ] **Step 1: `app/company/layout.tsx`** — replace `requireDentalAce()` with the three-way branch:

```tsx
import { requireUser } from "@/lib/auth/session";
import { pendingKindsFor } from "@/lib/auth/access-requests";
import { AccessPendingGate } from "@/components/access/access-pending-gate";
import { redirect } from "next/navigation";
// ...
const user = await requireUser();
if (!user.companyId) {
  if ((await pendingKindsFor(user.id)).has("COMPANY")) return <AccessPendingGate area="DentalACE" />;
  redirect("/home");
}
// ...render the existing PortalShell with `user` as before
```

- [ ] **Step 2: `app/board/layout.tsx`** — same shape, keyed on `verifyAccess` / `BOARD` / `area="Verify"`. Preserve the existing `staffRole === "ADMIN"` bypass that `requireVerify` had (admins still pass without a pending check).

- [ ] **Step 3: `app/reviewer/layout.tsx`** — keyed on staff: entitled when `staffRole` is `REVIEWER` or `ADMIN`; else if pending `REVIEWER` → `<AccessPendingGate area="the review queue" />`; else redirect `/home`.

- [ ] **Step 4: `app/admin/layout.tsx`** — entitled when `staffRole === "ADMIN"`; else if pending `ADMIN` → `<AccessPendingGate area="AADB admin" />`; else redirect `/home`.

- [ ] **Step 5: Typecheck + manual verify (the key integration test).**
  - `pnpm typecheck` clean.
  - As a ProTrack-only account **with** a PENDING COMPANY request, navigate to `/company` → see the blurred under-review overlay (no crash, no company data).
  - As the same account with **no** request, navigate to `/company` → redirected to `/home`.
  - As the seeded `customer@dentalace.org` (has `company_id`), `/company` renders normally.

- [ ] **Step 6: Commit**

```bash
git add app/company/layout.tsx app/board/layout.tsx app/reviewer/layout.tsx app/admin/layout.tsx
git commit -m "feat(access): gated layouts show under-review overlay for pending users"
```

---

## PHASE 7 — Admin approval queue

### Task 14: `/admin/access-requests` queue + actions + nav

**Files:**
- Create: `app/admin/access-requests/page.tsx`, `app/admin/access-requests/actions.ts`
- Modify: `lib/nav/portal-nav.ts`

- [ ] **Step 1: Create the actions** `app/admin/access-requests/actions.ts`:

```ts
"use server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { requireStaff } from "@/lib/auth/session";
import { approveRequest, denyRequest } from "@/lib/auth/access-requests";

export async function approveAction(formData: FormData): Promise<void> {
  const admin = await requireStaff("ADMIN");
  const id = String(formData.get("id") ?? "");
  const origin = (await headers()).get("origin") ?? "https://dentalace.org";
  const r = await approveRequest(id, admin.id, origin);
  redirect(r.ok ? "/admin/access-requests?done=approved" : `/admin/access-requests?error=${encodeURIComponent(r.message)}`);
}

export async function denyAction(formData: FormData): Promise<void> {
  const admin = await requireStaff("ADMIN");
  const id = String(formData.get("id") ?? "");
  const reason = String(formData.get("reason") ?? "");
  const r = await denyRequest(id, admin.id, reason);
  redirect(r.ok ? "/admin/access-requests?done=denied" : `/admin/access-requests?error=${encodeURIComponent(r.message)}`);
}
```

- [ ] **Step 2: Create the page** `app/admin/access-requests/page.tsx` — `requireStaff("ADMIN")`, list `prisma.accessRequest.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" }, include: { user: { select: { email, firstName, lastName } } } })`. For each: show kind (`roleLabelFor`), `label`, requester, `note`, submitted date, and two forms — Approve (posts `id` to `approveAction`) and Deny (a `reason` input + posts to `denyAction`). Show `?error=`/`?done=` banners. Use the same table/card styling as `app/admin/users/page.tsx`. Empty state: "No pending access requests."

- [ ] **Step 3: Add the nav item** in `lib/nav/portal-nav.ts` under the admin `Governance` group:

```ts
{ label: "Access Requests", href: "/admin/access-requests", icon: "🔑" },
```

- [ ] **Step 4: Typecheck + manual verify (full loop).**
  - `pnpm typecheck` clean.
  - Sign in as `john@dentalace.org` (ADMIN) → `/admin/access-requests` lists the pending COMPANY/BOARD/REVIEWER rows created in earlier tasks.
  - **Approve** the COMPANY request → banner "approved"; in Prisma Studio the requester now has a `company_id` and the request is `APPROVED`; an `admin_audit_log` row exists. Sign in as that requester → lands on `/company`.
  - **Deny** a request with a reason → request `DENIED` with the reason stored; requester can resubmit.

- [ ] **Step 5: Commit**

```bash
git add app/admin/access-requests lib/nav/portal-nav.ts
git commit -m "feat(admin): access-request approval queue"
```

---

## PHASE 8 — `/home` request hub

### Task 15: `/home` request entry points + pending status

**Files:**
- Modify: `app/home/page.tsx`

- [ ] **Step 1: Load pending kinds** in `HomeHub`:

```ts
import { pendingKindsFor } from "@/lib/auth/access-requests";
// after requireUser():
const pending = await pendingKindsFor(user.id);
```

- [ ] **Step 2: Replace the inline "register your org" CTA** (the `else` branch that pushes `/company/register`) with logic that respects pending state:
  - If `user.companyId` → existing "DentalACE → /company" card.
  - Else if `pending.has("COMPANY")` → a card "DentalACE — under review" linking to `/company` (which now shows the overlay).
  - Else → "Request CE Company access" card → `/company/register`.

- [ ] **Step 3: Add request entry points** for Verify and staff when not entitled/pending:
  - Verify: if `user.verifyAccess` → existing card; else if `pending.has("BOARD")` → "Verify — under review"; else → "Register a state board" → `/signup/board` is public/pre-account, so for a logged-in user link to a short explainer or omit. (Logged-in board requests are rare; show "Contact AADB to add a state board" text rather than a broken pre-account link.)
  - Staff: if `staffRole` is staff → existing Review/Admin cards; else if `pending.has("REVIEWER") || pending.has("ADMIN")` → "Staff access — under review"; else → "Request staff access" → `/request-access/staff`.

- [ ] **Step 4: Show a `?requested=staff` confirmation banner** at the top when present.

- [ ] **Step 5: Typecheck + manual verify.** As a ProTrack-only account with a pending COMPANY request, `/home` shows "DentalACE — under review"; with none, shows "Request CE Company access". Staff request card appears and links to `/request-access/staff`.

- [ ] **Step 6: Commit**

```bash
git add app/home/page.tsx
git commit -m "feat(home): request hub with pending-status cards"
```

---

## PHASE 9 — Full verification + cleanup

### Task 16: End-to-end verification and suite run

- [ ] **Step 1: Run the unit suite**

Run: `pnpm test`
Expected: all pass (landing-path, grants, access-requests + existing).

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 3: Manual end-to-end (verify skill, real browser)** for each kind:
  - **Company:** signup (`as=company`) → verify email (DEV_LINK) → login → `/home` shows "Request CE Company access" → `/company/register` submit → "under review" → `/company` shows overlay → admin approves → requester re-login lands `/company`.
  - **Board:** `/signup/board` (.gov) → verify → request visible in queue → admin approves → board user lands `/board`.
  - **Staff:** `/request-access/staff` Reviewer → queue → approve → `/reviewer` accessible.
  - **Deny path:** deny one request with a reason → requester sees no access + can resubmit.

- [ ] **Step 4: Final commit (if any tidy-ups)**

```bash
git add -A
git commit -m "chore: role-approval access end-to-end verification tidy-ups"
```

---

## Notes for the implementer

- **`pnpm`, not `npm`.** RLS migrations apply via the Supabase MCP `apply_migration` tool, not Prisma.
- **Money/locks unchanged.** The advisory-lock patterns in `grants.ts` are lifted verbatim from the existing signup paths — don't "simplify" them away; they close registration races.
- **Email sends may log-only.** `dentalace.org` is unverified in Resend, so in prod sends currently fail silently; locally they print to the server log. The code is correct regardless. Don't block flows on email.
- **No `middleware.ts`.** Route protection stays in layouts (this plan modifies layouts directly).
- **Brand copy:** no em dashes in user-facing strings; "DentalACE" one word; "ProTrack" one word.
