# Dental ACE M3 — Admin Tooling + Launch Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the AADB super-admin surface (`/admin`): platform stats, company management, append-only billing overrides, staff account provisioning (with a set-password sub-flow), plus login/application-submit rate limiting and a per-course ACE marketing badge PNG.

**Architecture:** Pure, unit-tested helpers (`override-rules`, `set-password-token`) back `"use server"` actions guarded by `requireStaff("ADMIN")`. Overrides mutate balances under a `SELECT … FOR UPDATE` company-row lock and write append-only `ADMIN_OVERRIDE` `billing_transactions`. Staff provisioning reuses the existing service-role `auth.admin.createUser` + `users`-row pattern and emails a signed set-password link. The badge reuses the protrack-export Puppeteer launch to screenshot branded HTML to PNG. No schema changes.

**Tech Stack:** Next.js 16 App Router (server components + server actions + route handlers), Prisma 7, Supabase Auth (service-role), Resend + React Email, `puppeteer-core` + `@sparticuz/chromium`, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-04-dentalace-m3-admin-tooling-hardening-design.md`.

---

## File Structure

**New — pure logic + tests:**
- `lib/admin/override-rules.ts` (+ `.test.ts`) — `validateAppCreditGrant`, `validateCertBalanceAdjustment`.
- `lib/auth/set-password-token.ts` (+ `.test.ts`) — signed `setpw:` token (mirrors `verification-token.ts`).

**New — server actions:**
- `lib/admin/billing-overrides.ts` — `grantAppCredits`, `adjustCertBalance`.
- `lib/admin/provision.ts` — `createStaffAccount`, `setStaffRole`.

**New — admin UI:**
- `app/admin/companies/page.tsx`, `app/admin/companies/[id]/page.tsx`, `app/admin/users/page.tsx`.
- (Modify) `app/admin/page.tsx` (real stats), `lib/nav/portal-nav.ts` (wire hrefs).

**New — set-password sub-flow + badge:**
- `app/set-password/page.tsx`, `app/api/auth/set-password/route.ts`, `emails/staff-invite.tsx`.
- `lib/badge/render.ts`, `app/api/courses/[id]/badge/route.ts`.

**Modified — hardening:**
- `app/api/auth/signin/route.ts`, `lib/forms/application/actions.ts` (rate limiting).
- `app/company/courses/page.tsx` (badge link).

---

## Task 1: Override validation rules (pure)

**Files:** Create `lib/admin/override-rules.ts`, `lib/admin/override-rules.test.ts`.

- [ ] **Step 1: Write the failing test**

`lib/admin/override-rules.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { validateAppCreditGrant, validateCertBalanceAdjustment } from "@/lib/admin/override-rules";

describe("validateAppCreditGrant", () => {
  it("accepts a positive whole quantity", () => {
    expect(validateAppCreditGrant(5)).toEqual({ ok: true });
  });
  it("rejects zero, negative, and non-integer", () => {
    expect(validateAppCreditGrant(0).ok).toBe(false);
    expect(validateAppCreditGrant(-3).ok).toBe(false);
    expect(validateAppCreditGrant(1.5).ok).toBe(false);
  });
  it("rejects absurdly large quantities", () => {
    expect(validateAppCreditGrant(10001).ok).toBe(false);
  });
});

describe("validateCertBalanceAdjustment", () => {
  it("accepts a positive increase", () => {
    expect(validateCertBalanceAdjustment(50, 0)).toEqual({ ok: true });
  });
  it("accepts a decrease that stays non-negative", () => {
    expect(validateCertBalanceAdjustment(-10, 25)).toEqual({ ok: true });
    expect(validateCertBalanceAdjustment(-25, 25)).toEqual({ ok: true });
  });
  it("rejects a decrease that would go negative", () => {
    expect(validateCertBalanceAdjustment(-26, 25).ok).toBe(false);
  });
  it("rejects zero and non-integer deltas", () => {
    expect(validateCertBalanceAdjustment(0, 25).ok).toBe(false);
    expect(validateCertBalanceAdjustment(2.5, 25).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test lib/admin/override-rules.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Implement**

`lib/admin/override-rules.ts`:
```ts
/*
  Pure validation for admin billing overrides. No DB, no server-only —
  unit-tested directly. The server actions call these (the cert-balance check
  runs under the company row lock with the locked balance).
*/

export type OverrideValidation = { ok: true } | { ok: false; error: string };

export function validateAppCreditGrant(quantity: number): OverrideValidation {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return { ok: false, error: "Quantity must be a positive whole number." };
  }
  if (quantity > 10000) {
    return { ok: false, error: "Quantity is too large." };
  }
  return { ok: true };
}

export function validateCertBalanceAdjustment(
  delta: number,
  currentBalance: number,
): OverrideValidation {
  if (!Number.isInteger(delta) || delta === 0) {
    return { ok: false, error: "Adjustment must be a non-zero whole number." };
  }
  if (Math.abs(delta) > 100000) {
    return { ok: false, error: "Adjustment is too large." };
  }
  if (currentBalance + delta < 0) {
    return { ok: false, error: "Adjustment would make the balance negative." };
  }
  return { ok: true };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test lib/admin/override-rules.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/admin/override-rules.ts lib/admin/override-rules.test.ts
git commit -m "feat(admin): pure billing-override validation rules"
```

---

## Task 2: Set-password token (signed, `setpw:`)

**Files:** Create `lib/auth/set-password-token.ts`, `lib/auth/set-password-token.test.ts`.

Context: mirrors `lib/auth/verification-token.ts` exactly (same HMAC/base64url construction, `SESSION_SECRET`) but with a `setpw:` domain-separation prefix and an injectable clock for testing. `server-only` is aliased to a stub under Vitest.

- [ ] **Step 1: Write the failing test**

`lib/auth/set-password-token.test.ts`:
```ts
import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => {
  process.env.SESSION_SECRET = "test-secret-test-secret-test-secret-1234"; // >=32 chars
});

describe("set-password-token", () => {
  it("round-trips a userId", async () => {
    const { signSetPasswordToken, verifySetPasswordToken } = await import("@/lib/auth/set-password-token");
    const token = signSetPasswordToken("user-123");
    expect(verifySetPasswordToken(token)).toBe("user-123");
  });

  it("rejects a tampered token", async () => {
    const { signSetPasswordToken, verifySetPasswordToken } = await import("@/lib/auth/set-password-token");
    const token = signSetPasswordToken("user-123");
    const tampered = token.slice(0, -2) + (token.endsWith("a") ? "bb" : "aa");
    expect(verifySetPasswordToken(tampered)).toBe(null);
  });

  it("rejects an expired token", async () => {
    const { signSetPasswordToken, verifySetPasswordToken } = await import("@/lib/auth/set-password-token");
    const issuedAt = 1_000_000; // seconds
    const token = signSetPasswordToken("user-123", issuedAt);
    const wayLater = issuedAt + 60 * 60 * 24 * 2; // 2 days later
    expect(verifySetPasswordToken(token, wayLater)).toBe(null);
    expect(verifySetPasswordToken(token, issuedAt + 10)).toBe("user-123");
  });

  it("does not accept an email-verification token (prefix isolation)", async () => {
    const { verifySetPasswordToken } = await import("@/lib/auth/set-password-token");
    const { signEmailVerificationToken } = await import("@/lib/auth/verification-token");
    const verifyToken = signEmailVerificationToken("user-123");
    expect(verifySetPasswordToken(verifyToken)).toBe(null);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test lib/auth/set-password-token.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Implement**

`lib/auth/set-password-token.ts`:
```ts
import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/*
  Stateless, HMAC-signed set-password token. Same construction as
  verification-token.ts but with a "setpw:" domain-separation prefix and a 24h
  lifetime. Emitted when an admin provisions a staff account; consumed by
  /api/auth/set-password to let the staffer choose their own password. The
  clock is injectable (nowSeconds) for deterministic tests.
*/

export const SET_PASSWORD_MAX_AGE_SECONDS = 60 * 60 * 24; // 24 hours

type Payload = { userId: string; exp: number };

function getSecret(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "SESSION_SECRET must be set to a string of at least 32 characters in .env.local",
    );
  }
  return Buffer.from(secret, "utf8");
}

function b64UrlEncode(buf: Buffer): string {
  return buf.toString("base64").replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function b64UrlDecode(s: string): Buffer {
  const padded = s + "=".repeat((4 - (s.length % 4)) % 4);
  return Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function hmac(payload: string): string {
  return b64UrlEncode(createHmac("sha256", getSecret()).update(`setpw:${payload}`).digest());
}

export function signSetPasswordToken(
  userId: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): string {
  const payload: Payload = { userId, exp: nowSeconds + SET_PASSWORD_MAX_AGE_SECONDS };
  const encoded = b64UrlEncode(Buffer.from(JSON.stringify(payload), "utf8"));
  return `${encoded}.${hmac(encoded)}`;
}

/** Returns the userId if valid + unexpired, else null. */
export function verifySetPasswordToken(
  token: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): string | null {
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const encoded = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  const expected = hmac(encoded);
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!timingSafeEqual(sigBuf, expectedBuf)) return null;

  try {
    const payload = JSON.parse(b64UrlDecode(encoded).toString("utf8")) as Payload;
    if (!payload.userId || !payload.exp) return null;
    if (payload.exp < nowSeconds) return null;
    return payload.userId;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test lib/auth/set-password-token.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/auth/set-password-token.ts lib/auth/set-password-token.test.ts
git commit -m "feat(auth): signed set-password token (setpw-prefixed HMAC)"
```

---

## Task 3: Billing-override server actions

**Files:** Create `lib/admin/billing-overrides.ts`.

- [ ] **Step 1: Implement**

`lib/admin/billing-overrides.ts`:
```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import {
  validateAppCreditGrant,
  validateCertBalanceAdjustment,
} from "@/lib/admin/override-rules";

/*
  Admin billing overrides (PRD Flow F). Each grant runs in a transaction with a
  SELECT ... FOR UPDATE lock on the company row, mutates the balance, and writes
  an append-only ADMIN_OVERRIDE billing_transactions row (amountCents 0,
  stripeEventId null, performedById = admin). No edit/delete path.
*/

class OverrideError extends Error {}

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || user.staffRole !== "ADMIN") redirect("/login");
  return user;
}

function oneYearFromNow(): Date {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d;
}

export async function grantAppCredits(formData: FormData) {
  const admin = await requireAdmin();
  const companyId = String(formData.get("companyId") ?? "");
  const quantity = Number(formData.get("quantity") ?? 0);
  const expedited = formData.get("expedited") === "true";
  if (!companyId) throw new Error("companyId required");

  const v = validateAppCreditGrant(quantity);
  if (!v.ok) redirect(`/admin/companies/${companyId}?error=${encodeURIComponent(v.error)}`);

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`select id from public.companies where id = ${companyId}::uuid for update`;
    await tx.company.update({
      where: { id: companyId },
      data: expedited
        ? { expeditedCredits: { increment: quantity }, applicationCreditsExpiresAt: oneYearFromNow() }
        : { applicationCredits: { increment: quantity }, applicationCreditsExpiresAt: oneYearFromNow() },
    });
    await tx.billingTransaction.create({
      data: {
        companyId,
        type: "ADMIN_OVERRIDE",
        quantity,
        amountCents: 0,
        isExpedited: expedited,
        performedById: admin.id,
      },
    });
  });

  revalidatePath(`/admin/companies/${companyId}`);
  redirect(`/admin/companies/${companyId}?ok=credits`);
}

export async function adjustCertBalance(formData: FormData) {
  const admin = await requireAdmin();
  const companyId = String(formData.get("companyId") ?? "");
  const delta = Number(formData.get("delta") ?? 0);
  if (!companyId) throw new Error("companyId required");

  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`select id from public.companies where id = ${companyId}::uuid for update`;
      const company = await tx.company.findUniqueOrThrow({
        where: { id: companyId },
        select: { certBalance: true },
      });
      const v = validateCertBalanceAdjustment(delta, company.certBalance);
      if (!v.ok) throw new OverrideError(v.error);
      await tx.company.update({
        where: { id: companyId },
        data: { certBalance: { increment: delta } },
      });
      await tx.billingTransaction.create({
        data: {
          companyId,
          type: "ADMIN_OVERRIDE",
          quantity: delta,
          amountCents: 0,
          performedById: admin.id,
        },
      });
    });
  } catch (err) {
    if (err instanceof OverrideError) {
      redirect(`/admin/companies/${companyId}?error=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }

  revalidatePath(`/admin/companies/${companyId}`);
  redirect(`/admin/companies/${companyId}?ok=balance`);
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: zero errors. (`redirect()` throws, so the `OverrideError` catch path that calls `redirect` is fine; the generic `redirect` NEXT_REDIRECT error thrown inside the tx callback is not used — we only `redirect` outside the tx.)

- [ ] **Step 3: Commit**

```bash
git add lib/admin/billing-overrides.ts
git commit -m "feat(admin): grant app credits + adjust cert balance (ADMIN_OVERRIDE)"
```

---

## Task 4: Admin dashboard, company list + detail, nav wiring

**Files:** Modify `app/admin/page.tsx`, `lib/nav/portal-nav.ts`; Create `app/admin/companies/page.tsx`, `app/admin/companies/[id]/page.tsx`.

- [ ] **Step 1: Wire the admin nav**

In `lib/nav/portal-nav.ts`, replace the entire `admin:` entry with:
```ts
  admin: [
    {
      label: "Operations",
      items: [
        { label: "Dashboard", href: "/admin", icon: "📊" },
        { label: "Companies", href: "/admin/companies", icon: "🏢" },
        { label: "Staff Users", href: "/admin/users", icon: "👥" },
      ],
    },
  ],
```

- [ ] **Step 2: Replace the admin dashboard with real stats**

`app/admin/page.tsx`:
```tsx
import Link from "next/link";
import { PageHeader } from "@/components/portal-shell";
import { PortalStatCard } from "@/components/portal-stat-card";
import { requireStaff } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

/*
  AADB super-admin dashboard. Read-only platform stats. Company management and
  overrides live under /admin/companies; staff provisioning under /admin/users.
*/

export default async function AdminDashboard() {
  await requireStaff("ADMIN");

  const [companyCount, pendingApplications, certAgg, lowBalanceCount] = await Promise.all([
    prisma.company.count(),
    prisma.courseApplication.count({ where: { status: "PENDING" } }),
    prisma.company.aggregate({ _sum: { totalCertsIssued: true } }),
    prisma.$queryRaw<{ count: bigint }[]>`
      select count(*)::bigint as count from public.companies
      where cert_balance <= cert_alert_threshold`,
  ]);

  const totalCerts = certAgg._sum.totalCertsIssued ?? 0;
  const lowBalance = Number(lowBalanceCount[0]?.count ?? 0);

  return (
    <>
      <PageHeader title="Admin Dashboard" subtitle="AADB platform operations" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <PortalStatCard label="Companies" tone="blue" value={companyCount} meta="Provider accounts" />
        <PortalStatCard label="Certs Issued" tone="purple" value={totalCerts.toLocaleString()} meta="All time" />
        <PortalStatCard label="Pending Review" tone="gold" value={pendingApplications} meta="Applications" />
        <PortalStatCard label="Low Balance" tone="green" value={lowBalance} meta="At or under threshold" />
      </div>
      <div className="mt-5 rounded-lg border border-border bg-white p-4">
        <p className="text-[13px] text-text-mid">
          Manage providers under{" "}
          <Link href="/admin/companies" className="text-ace underline">Companies</Link>{" "}
          and provision reviewers or admins under{" "}
          <Link href="/admin/users" className="text-ace underline">Staff Users</Link>.
        </p>
      </div>
    </>
  );
}
```

- [ ] **Step 3: Company list**

`app/admin/companies/page.tsx`:
```tsx
import Link from "next/link";
import { PageHeader } from "@/components/portal-shell";
import { requireStaff } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

const PAGE_SIZE = 25;

export default async function AdminCompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  await requireStaff("ADMIN");
  const { q, page } = await searchParams;
  const pageNum = Math.max(1, Number(page ?? "1") || 1);
  const query = (q ?? "").trim();

  const where: Prisma.CompanyWhereInput = query
    ? { name: { contains: query, mode: "insensitive" } }
    : {};

  const [total, companies] = await Promise.all([
    prisma.company.count({ where }),
    prisma.company.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (pageNum - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true, name: true, applicationCredits: true, expeditedCredits: true,
        certBalance: true, totalCertsIssued: true,
      },
    }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <PageHeader title="Companies" subtitle={`${total} provider account${total === 1 ? "" : "s"}`} />
      <form className="mb-4" action="/admin/companies" method="get">
        <input type="search" name="q" defaultValue={query} placeholder="Search company name"
          className="w-full max-w-sm rounded-md border border-border px-3 py-2 text-[13px]" />
      </form>
      <div className="overflow-hidden rounded-lg border border-border bg-white">
        {companies.length === 0 ? (
          <p className="px-4 py-10 text-center text-[12px] text-text-muted">No companies found.</p>
        ) : (
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-border bg-surface text-left text-[10px] uppercase tracking-wide text-text-muted">
                <th className="px-4 py-2 font-semibold">Company</th>
                <th className="px-4 py-2 font-semibold">App Credits</th>
                <th className="px-4 py-2 font-semibold">Cert Balance</th>
                <th className="px-4 py-2 font-semibold">Certs Issued</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-b-0">
                  <td className="px-4 py-2 font-medium text-navy">
                    <Link href={`/admin/companies/${c.id}`} className="text-ace underline">{c.name}</Link>
                  </td>
                  <td className="px-4 py-2 text-text-mid tabular-nums">
                    {c.applicationCredits}{c.expeditedCredits > 0 ? ` (+${c.expeditedCredits} exp)` : ""}
                  </td>
                  <td className="px-4 py-2 text-text-mid tabular-nums">{c.certBalance}</td>
                  <td className="px-4 py-2 text-text-muted tabular-nums">{c.totalCertsIssued}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-[12px] text-text-muted">
          <span>Page {pageNum} of {totalPages}</span>
          <div className="flex gap-2">
            {pageNum > 1 && (
              <Link className="rounded-md border border-border px-3 py-1"
                href={`/admin/companies?${new URLSearchParams({ ...(query ? { q: query } : {}), page: String(pageNum - 1) })}`}>Previous</Link>
            )}
            {pageNum < totalPages && (
              <Link className="rounded-md border border-border px-3 py-1"
                href={`/admin/companies?${new URLSearchParams({ ...(query ? { q: query } : {}), page: String(pageNum + 1) })}`}>Next</Link>
            )}
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 4: Company detail with override forms**

`app/admin/companies/[id]/page.tsx`:
```tsx
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/portal-shell";
import { requireStaff } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { grantAppCredits, adjustCertBalance } from "@/lib/admin/billing-overrides";

export default async function AdminCompanyDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await requireStaff("ADMIN");
  const { id } = await params;
  const { ok, error } = await searchParams;

  const company = await prisma.company.findUnique({
    where: { id },
    select: {
      id: true, name: true, applicationCredits: true, expeditedCredits: true,
      certBalance: true, certAlertThreshold: true, totalCertsIssued: true,
      billingTransactions: { orderBy: { createdAt: "desc" }, take: 15 },
    },
  });
  if (!company) notFound();

  return (
    <>
      <PageHeader title={company.name} subtitle="Company overrides (append-only)" />
      {ok ? (
        <div className="mb-4 rounded-md border border-emerald-400 bg-emerald-50 px-4 py-2.5 text-[13px] text-emerald-700">
          ✓ Override applied.
        </div>
      ) : null}
      {error ? (
        <div className="mb-4 rounded-md border border-red-400 bg-red-50 px-4 py-2.5 text-[13px] text-red-700">
          {error}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-white p-4">
          <p className="text-[10px] uppercase tracking-wide text-text-muted">App Credits</p>
          <p className="font-serif text-2xl font-bold text-navy tabular-nums">{company.applicationCredits}</p>
          <p className="text-[11px] text-text-muted">{company.expeditedCredits} expedited</p>
        </div>
        <div className="rounded-lg border border-border bg-white p-4">
          <p className="text-[10px] uppercase tracking-wide text-text-muted">Cert Balance</p>
          <p className="font-serif text-2xl font-bold text-navy tabular-nums">{company.certBalance}</p>
          <p className="text-[11px] text-text-muted">threshold {company.certAlertThreshold}</p>
        </div>
        <div className="rounded-lg border border-border bg-white p-4">
          <p className="text-[10px] uppercase tracking-wide text-text-muted">Total Certs Issued</p>
          <p className="font-serif text-2xl font-bold text-navy tabular-nums">{company.totalCertsIssued}</p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <form action={grantAppCredits} className="rounded-lg border border-border bg-white p-4 space-y-3">
          <input type="hidden" name="companyId" value={company.id} />
          <p className="text-[12px] font-semibold text-navy">Grant application credits</p>
          <input type="number" name="quantity" min={1} step={1} required placeholder="Quantity"
            className="w-full rounded-md border border-border px-3 py-2 text-[13px]" />
          <label className="flex items-center gap-2 text-[12px] text-text-mid">
            <input type="checkbox" name="expedited" value="true" /> Expedited credits
          </label>
          <button type="submit" className="rounded-md bg-navy px-3 py-1.5 text-[12px] font-semibold text-white">Grant</button>
        </form>

        <form action={adjustCertBalance} className="rounded-lg border border-border bg-white p-4 space-y-3">
          <input type="hidden" name="companyId" value={company.id} />
          <p className="text-[12px] font-semibold text-navy">Adjust cert balance</p>
          <input type="number" name="delta" step={1} required placeholder="Delta (e.g. 100 or -10)"
            className="w-full rounded-md border border-border px-3 py-2 text-[13px]" />
          <p className="text-[11px] text-text-muted">Negative reduces the balance (never below zero).</p>
          <button type="submit" className="rounded-md bg-navy px-3 py-1.5 text-[12px] font-semibold text-white">Apply</button>
        </form>
      </div>

      <h2 className="mt-6 mb-3 text-[13px] font-semibold text-navy">Recent transactions</h2>
      <div className="overflow-hidden rounded-lg border border-border bg-white">
        {company.billingTransactions.length === 0 ? (
          <p className="px-4 py-6 text-center text-[12px] text-text-muted">No transactions.</p>
        ) : (
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-border bg-surface text-left text-[10px] uppercase tracking-wide text-text-muted">
                <th className="px-4 py-2 font-semibold">Date</th>
                <th className="px-4 py-2 font-semibold">Type</th>
                <th className="px-4 py-2 font-semibold">Qty</th>
                <th className="px-4 py-2 font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {company.billingTransactions.map((t) => (
                <tr key={t.id} className="border-b border-border last:border-b-0">
                  <td className="px-4 py-2 text-text-muted">{t.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</td>
                  <td className="px-4 py-2 text-text-mid">{t.type}</td>
                  <td className="px-4 py-2 tabular-nums text-text-mid">{t.quantity}</td>
                  <td className="px-4 py-2 tabular-nums text-text-muted">${(t.amountCents / 100).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
```

- [ ] **Step 5: Typecheck + build**

Run: `pnpm typecheck && pnpm build`
Expected: zero type errors; build lists `/admin`, `/admin/companies`, `/admin/companies/[id]`. (If `PortalStatCard`'s `tone`/props differ, read `components/portal-stat-card.tsx` and match; it's the same component the company dashboard uses.)

- [ ] **Step 6: Commit**

```bash
git add app/admin/page.tsx app/admin/companies lib/nav/portal-nav.ts
git commit -m "feat(admin): dashboard stats + company management with override forms"
```

---

## Task 5: Set-password page, route, and staff-invite email

**Files:** Create `app/set-password/page.tsx`, `app/api/auth/set-password/route.ts`, `emails/staff-invite.tsx`.

- [ ] **Step 1: Set-password page**

`app/set-password/page.tsx`:
```tsx
export default async function SetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;

  if (!token) {
    return (
      <main className="mx-auto max-w-sm px-4 py-16 text-center">
        <h1 className="text-lg font-semibold text-slate-900">Invalid link</h1>
        <p className="mt-2 text-sm text-slate-600">This set-password link is missing its token.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-sm px-4 py-16">
      <h1 className="text-lg font-semibold text-slate-900">Set your password</h1>
      <p className="mt-2 text-sm text-slate-600">Choose a password for your DentalACE staff account.</p>
      {error ? (
        <p className="mt-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}
      <form method="post" action="/api/auth/set-password" className="mt-5 space-y-3">
        <input type="hidden" name="token" value={token} />
        <input type="password" name="password" required minLength={10} placeholder="New password (min 10 chars)"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        <button type="submit" className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white">
          Set password
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 2: Set-password route**

`app/api/auth/set-password/route.ts`:
```ts
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { verifySetPasswordToken } from "@/lib/auth/set-password-token";

/*
  POST /api/auth/set-password — consumes a signed setpw token and sets the
  user's Supabase Auth password (service-role). Used by admin-provisioned staff
  to choose their own password. On success -> /login?set=1.
*/

export const runtime = "nodejs";

const schema = z.object({
  token: z.string().min(1),
  password: z.string().min(10).max(200),
});

export async function POST(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const form = await request.formData();
  const parsed = schema.safeParse({
    token: form.get("token"),
    password: form.get("password"),
  });

  const backToForm = (msg: string, token: unknown) =>
    NextResponse.redirect(
      `${origin}/set-password?token=${encodeURIComponent(String(token ?? ""))}&error=${encodeURIComponent(msg)}`,
      303,
    );

  if (!parsed.success) {
    return backToForm("Password must be at least 10 characters.", form.get("token"));
  }

  const userId = verifySetPasswordToken(parsed.data.token);
  if (!userId) {
    return NextResponse.redirect(
      `${origin}/set-password?error=${encodeURIComponent("This link is invalid or has expired.")}`,
      303,
    );
  }

  const admin = createServiceRoleClient();
  const { error } = await admin.auth.admin.updateUserById(userId, {
    password: parsed.data.password,
  });
  if (error) {
    return backToForm("Could not set the password. Please try again.", parsed.data.token);
  }

  return NextResponse.redirect(`${origin}/login?set=1`, 303);
}
```

- [ ] **Step 3: Staff-invite email**

`emails/staff-invite.tsx`:
```tsx
import { Text } from "@react-email/components";
import { BrandEmail, CtaButton, emailColors } from "./_brand";

export type StaffInviteProps = {
  firstName: string;
  roleLabel: string;
  setPasswordUrl: string;
};

export default function StaffInviteEmail({ firstName, roleLabel, setPasswordUrl }: StaffInviteProps) {
  return (
    <BrandEmail preview="Set up your DentalACE staff account" subject="Your DentalACE staff account" product="suite">
      <Text style={{ margin: 0, fontSize: 14, color: emailColors.navy }}>Hello {firstName},</Text>
      <Text style={{ margin: "10px 0 14px 0", fontSize: 14, lineHeight: 1.65, color: emailColors.textMid }}>
        An administrator created a DentalACE {roleLabel} account for you. Set your password to sign in. This link
        expires in 24 hours.
      </Text>
      <CtaButton href={setPasswordUrl} label="Set your password →" />
    </BrandEmail>
  );
}

StaffInviteEmail.subject = () => "Your DentalACE staff account · Set your password";
```

- [ ] **Step 4: Typecheck + build**

Run: `pnpm typecheck && pnpm build`
Expected: zero errors; `/set-password` and `/api/auth/set-password` in the route list.

- [ ] **Step 5: Commit**

```bash
git add app/set-password app/api/auth/set-password emails/staff-invite.tsx
git commit -m "feat(auth): set-password page, route, and staff-invite email"
```

---

## Task 6: Staff provisioning actions + /admin/users

**Files:** Create `lib/admin/provision.ts`, `app/admin/users/page.tsx`.

- [ ] **Step 1: Provisioning actions**

`lib/admin/provision.ts`:
```ts
"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { signSetPasswordToken } from "@/lib/auth/set-password-token";
import { sendEmail } from "@/lib/email/send";
import { appBaseUrl } from "@/lib/app-url";
import StaffInviteEmail from "@/emails/staff-invite";

/*
  Admin staff provisioning. Creates a Supabase Auth user (service-role, random
  password, email pre-confirmed) + a users row with the chosen staff_role and
  email_verified_at set, then emails a signed set-password link. setStaffRole
  promotes/revokes on existing accounts.
*/

const createSchema = z.object({
  email: z.string().email().max(200),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  staffRole: z.enum(["REVIEWER", "ADMIN"]),
});

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || user.staffRole !== "ADMIN") redirect("/login");
  return user;
}

export async function createStaffAccount(formData: FormData) {
  await requireAdmin();
  const parsed = createSchema.safeParse({
    email: form(formData, "email"),
    firstName: form(formData, "firstName"),
    lastName: form(formData, "lastName"),
    staffRole: form(formData, "staffRole"),
  });
  if (!parsed.success) {
    redirect(`/admin/users?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid input")}`);
  }
  const data = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email: data.email }, select: { id: true } });
  if (existing) {
    redirect(`/admin/users?error=${encodeURIComponent("An account with that email already exists.")}`);
  }

  const admin = createServiceRoleClient();
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: data.email,
    password: randomUUID() + randomUUID(), // random; never shown — staffer sets their own
    email_confirm: true,
  });
  if (createErr || !created?.user) {
    redirect(`/admin/users?error=${encodeURIComponent("Could not create the account (email may already exist).")}`);
  }
  const userId = created!.user.id;

  await prisma.user.create({
    data: {
      id: userId,
      email: data.email,
      firstName: data.firstName,
      lastName: data.lastName,
      staffRole: data.staffRole,
      protrackTier: "FREE",
      emailVerifiedAt: new Date(),
    },
  });

  const token = signSetPasswordToken(userId);
  const setPasswordUrl = `${appBaseUrl()}/set-password?token=${encodeURIComponent(token)}`;
  try {
    await sendEmail({
      to: data.email,
      subject: StaffInviteEmail.subject(),
      react: StaffInviteEmail({
        firstName: data.firstName,
        roleLabel: data.staffRole === "ADMIN" ? "Admin" : "Reviewer",
        setPasswordUrl,
      }),
    });
  } catch (err) {
    console.error("[createStaffAccount] invite email failed", err);
  }

  revalidatePath("/admin/users");
  redirect("/admin/users?ok=created");
}

export async function setStaffRole(formData: FormData) {
  await requireAdmin();
  const userId = form(formData, "userId");
  const staffRole = form(formData, "staffRole");
  if (!userId || !["NONE", "REVIEWER", "ADMIN"].includes(staffRole)) {
    redirect(`/admin/users?error=${encodeURIComponent("Invalid role change.")}`);
  }
  await prisma.user.update({
    where: { id: userId },
    data: { staffRole: staffRole as "NONE" | "REVIEWER" | "ADMIN" },
  });
  revalidatePath("/admin/users");
  redirect("/admin/users?ok=role");
}

function form(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "");
}
```

- [ ] **Step 2: /admin/users page**

`app/admin/users/page.tsx`:
```tsx
import { PageHeader } from "@/components/portal-shell";
import { requireStaff } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { createStaffAccount, setStaffRole } from "@/lib/admin/provision";

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await requireStaff("ADMIN");
  const { ok, error } = await searchParams;

  const staff = await prisma.user.findMany({
    where: { staffRole: { in: ["REVIEWER", "ADMIN"] } },
    orderBy: { email: "asc" },
    select: { id: true, email: true, firstName: true, lastName: true, staffRole: true },
  });

  return (
    <>
      <PageHeader title="Staff Users" subtitle={`${staff.length} reviewer/admin account${staff.length === 1 ? "" : "s"}`} />
      {ok ? (
        <div className="mb-4 rounded-md border border-emerald-400 bg-emerald-50 px-4 py-2.5 text-[13px] text-emerald-700">
          ✓ {ok === "created" ? "Account created and invite sent." : "Role updated."}
        </div>
      ) : null}
      {error ? (
        <div className="mb-4 rounded-md border border-red-400 bg-red-50 px-4 py-2.5 text-[13px] text-red-700">{error}</div>
      ) : null}

      <form action={createStaffAccount} className="mb-6 rounded-lg border border-border bg-white p-4 grid gap-3 sm:grid-cols-2">
        <p className="sm:col-span-2 text-[12px] font-semibold text-navy">Create staff account</p>
        <input name="firstName" required placeholder="First name" className="rounded-md border border-border px-3 py-2 text-[13px]" />
        <input name="lastName" required placeholder="Last name" className="rounded-md border border-border px-3 py-2 text-[13px]" />
        <input name="email" type="email" required placeholder="Email" className="rounded-md border border-border px-3 py-2 text-[13px]" />
        <select name="staffRole" className="rounded-md border border-border px-3 py-2 text-[13px]">
          <option value="REVIEWER">Reviewer</option>
          <option value="ADMIN">Admin</option>
        </select>
        <button type="submit" className="sm:col-span-2 justify-self-start rounded-md bg-navy px-3 py-1.5 text-[12px] font-semibold text-white">
          Create + send invite
        </button>
      </form>

      <div className="overflow-hidden rounded-lg border border-border bg-white">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-border bg-surface text-left text-[10px] uppercase tracking-wide text-text-muted">
              <th className="px-4 py-2 font-semibold">Name</th>
              <th className="px-4 py-2 font-semibold">Email</th>
              <th className="px-4 py-2 font-semibold">Role</th>
              <th className="px-4 py-2 font-semibold">Change</th>
            </tr>
          </thead>
          <tbody>
            {staff.map((u) => (
              <tr key={u.id} className="border-b border-border last:border-b-0">
                <td className="px-4 py-2 font-medium text-navy">{u.firstName} {u.lastName}</td>
                <td className="px-4 py-2 text-text-mid">{u.email}</td>
                <td className="px-4 py-2 text-text-mid">{u.staffRole}</td>
                <td className="px-4 py-2">
                  <form action={setStaffRole} className="flex items-center gap-2">
                    <input type="hidden" name="userId" value={u.id} />
                    <select name="staffRole" defaultValue={u.staffRole} className="rounded-md border border-border px-2 py-1 text-[11px]">
                      <option value="REVIEWER">REVIEWER</option>
                      <option value="ADMIN">ADMIN</option>
                      <option value="NONE">NONE (revoke)</option>
                    </select>
                    <button type="submit" className="rounded-md border border-border px-2 py-1 text-[11px] font-semibold text-navy">Save</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
```

- [ ] **Step 3: Typecheck + build**

Run: `pnpm typecheck && pnpm build`
Expected: zero errors; `/admin/users` in the route list. (Confirm `lib/app-url.ts` exports `appBaseUrl`; it is used by `app/api/auth/register/route.ts`. If the export name differs, match it.)

- [ ] **Step 4: Commit**

```bash
git add lib/admin/provision.ts app/admin/users/page.tsx
git commit -m "feat(admin): staff account provisioning + role management"
```

---

## Task 7: Rate limiting on login + application submit

**Files:** Modify `app/api/auth/signin/route.ts`, `lib/forms/application/actions.ts`.

- [ ] **Step 1: Rate-limit the signin route**

In `app/api/auth/signin/route.ts`, add imports at the top:
```ts
import { headers } from "next/headers";
import { rateLimit } from "@/lib/rate-limit";
```
Immediately after `if (!email || !password) return redirectTo("/login?error=missing");`, insert:
```ts
  const ip = ((await headers()).get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
  const limited = rateLimit(`signin:${ip}:${email.toLowerCase()}`, { limit: 8, windowMs: 15 * 60 * 1000 });
  if (!limited.ok) return redirectTo("/login?error=rate_limited");
```

- [ ] **Step 2: Rate-limit application submit**

In `lib/forms/application/actions.ts`, add imports near the top (alongside the existing `next/*` imports):
```ts
import { headers } from "next/headers";
import { rateLimit } from "@/lib/rate-limit";
```
In `submitApplication`, immediately after `const companyId = await getCustomerCompanyId();`, insert:
```ts
  const ip = ((await headers()).get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
  const limited = rateLimit(`submit:${ip}:${companyId}`, { limit: 20, windowMs: 60 * 60 * 1000 });
  if (!limited.ok) {
    redirect("/company/applications/new/review?error=rate_limited");
  }
```

- [ ] **Step 3: Typecheck + build**

Run: `pnpm typecheck && pnpm build`
Expected: zero errors; build succeeds.

- [ ] **Step 4: Commit**

```bash
git add app/api/auth/signin/route.ts lib/forms/application/actions.ts
git commit -m "feat(security): rate-limit login and application submit"
```

---

## Task 8: ACE badge PNG (render + route + courses link)

**Files:** Create `lib/badge/render.ts`, `app/api/courses/[id]/badge/route.ts`; Modify `app/company/courses/page.tsx`.

- [ ] **Step 1: Badge renderer**

`lib/badge/render.ts`:
```ts
import "server-only";
import { existsSync } from "node:fs";

/*
  Renders the per-course ACE marketing badge as a PNG by screenshotting a
  self-contained branded HTML card. Reuses the puppeteer-core + @sparticuz/chromium
  launch pattern from app/api/protrack/export/route.ts (serverless chromium +
  local fallback). No external assets, no em dashes.
*/

export type AceBadgeInput = {
  courseIdNumber: string;
  courseTitle: string;
  approvedAt: Date;
};

function localChromePath(): string {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
  ].filter(Boolean) as string[];
  return candidates.find((p) => existsSync(p)) ?? "";
}

function badgeHtml(input: AceBadgeInput): string {
  const approved = input.approvedAt.toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });
  const safeTitle = input.courseTitle.replace(/[<>&]/g, "");
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{margin:0;padding:0;box-sizing:border-box;font-family:Georgia,'Times New Roman',serif}
    body{width:600px;height:600px;display:flex;align-items:center;justify-content:center;background:#0B1A2E}
    .card{width:520px;height:520px;border:4px solid #C8971A;border-radius:18px;display:flex;flex-direction:column;
      align-items:center;justify-content:center;text-align:center;padding:40px;color:#fff}
    .brand{font-size:40px;font-weight:bold}.brand span{color:#C8971A}
    .seal{margin:18px 0;font-size:13px;letter-spacing:3px;text-transform:uppercase;color:#C8971A}
    .title{font-size:20px;margin:14px 0;color:#E6EDF5}
    .meta{font-size:13px;color:#6B87A8;margin-top:10px}
  </style></head><body><div class="card">
    <div class="brand">Dental <span>ACE</span></div>
    <div class="seal">Accredited Continuing Education</div>
    <div class="title">${safeTitle}</div>
    <div class="meta">Course ID ${input.courseIdNumber}</div>
    <div class="meta">Approved ${approved}</div>
  </div></body></html>`;
}

export async function renderAceBadgePng(input: AceBadgeInput): Promise<Buffer> {
  const puppeteer = (await import("puppeteer-core")).default;
  const onServerless = !!(process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.VERCEL);

  const browser = onServerless
    ? await (async () => {
        const chromium = (await import("@sparticuz/chromium")).default;
        return puppeteer.launch({
          args: chromium.args,
          executablePath: await chromium.executablePath(),
          headless: true,
        });
      })()
    : await puppeteer.launch({
        executablePath: localChromePath(),
        headless: true,
        args: ["--no-sandbox"],
      });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 600, height: 600, deviceScaleFactor: 2 });
    await page.setContent(badgeHtml(input), { waitUntil: "load" });
    const bytes = await page.screenshot({ type: "png" });
    return Buffer.from(bytes);
  } finally {
    await browser.close();
  }
}
```

- [ ] **Step 2: Badge download route**

`app/api/courses/[id]/badge/route.ts`:
```ts
import { NextResponse, type NextRequest } from "next/server";
import { requireDentalAce } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { renderAceBadgePng } from "@/lib/badge/render";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireDentalAce();
  const { id } = await params;

  const course = await prisma.accreditedCourse.findUnique({
    where: { id },
    select: {
      companyId: true,
      courseIdNumber: true,
      approvedAt: true,
      application: { select: { courseTitle: true } },
    },
  });
  if (!course) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (course.companyId !== user.companyId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const png = await renderAceBadgePng({
    courseIdNumber: course.courseIdNumber,
    courseTitle: course.application.courseTitle ?? "Accredited Course",
    approvedAt: course.approvedAt,
  });

  return new NextResponse(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": `attachment; filename="${course.courseIdNumber}-ace-badge.png"`,
    },
  });
}
```

- [ ] **Step 3: Add the badge link to the courses table**

In `app/company/courses/page.tsx`, add a header cell after the "Certs Issued" `<th>`:
```tsx
                <th className="px-4 py-2 text-right font-semibold">Badge</th>
```
And add a cell after the certs-issued `<td>` inside the `accreditedCourses.map` row (after the `Certs Issued` cell):
```tsx
                  <td className="px-4 py-2 text-right">
                    <a href={`/api/courses/${course.id}/badge`} className="text-ace underline">
                      Download
                    </a>
                  </td>
```

- [ ] **Step 4: Typecheck + build**

Run: `pnpm typecheck && pnpm build`
Expected: zero errors; `/api/courses/[id]/badge` in the route list. (Do not invoke the route in CI — it needs a Chromium binary.)

- [ ] **Step 5: Commit**

```bash
git add lib/badge/render.ts app/api/courses app/company/courses/page.tsx
git commit -m "feat(badge): per-course ACE marketing badge PNG download"
```

---

## Task 9: Final verification gate

- [ ] **Step 1: Full gate**

Run:
```bash
pnpm test && pnpm typecheck && pnpm build
```
Expected: all tests pass (incl. `override-rules` and `set-password-token` suites); zero type errors; build succeeds with the new routes: `/admin`, `/admin/companies`, `/admin/companies/[id]`, `/admin/users`, `/set-password`, `/api/auth/set-password`, `/api/courses/[id]/badge`.

- [ ] **Step 2: Confirm no stray staging**

Run: `git status --short`
Expected: only intended files committed across the prior tasks; no `git add -A` ever used.

---

## Self-Review (completed during authoring)

- **Spec coverage:** admin dashboard stats (T4), company list+detail (T4), grant credits + adjust balance as append-only ADMIN_OVERRIDE under a row lock (T1+T3), nav wiring with State Board Access dropped (T4), staff account creation + role change (T6) with the set-password sub-flow (T2+T5) and staff-invite email (T5), login + submit rate limiting (T7), ACE badge PNG render + guarded route + courses link (T8), Vitest on the pure helpers (T1, T2). All spec sections map to a task.
- **Placeholder scan:** no TBD/TODO; every code step is complete. Two "match the real export if it differs" notes (PortalStatCard props in T4, appBaseUrl name in T6) are verification guards, not placeholders — both reference existing, named code.
- **Type/name consistency:** `validateAppCreditGrant`/`validateCertBalanceAdjustment` (T1) are imported by T3; `signSetPasswordToken`/`verifySetPasswordToken` (T2) used by T5/T6; `StaffInviteEmail` props (T5) match the `createStaffAccount` call (T6); `renderAceBadgePng` input (T8 renderer) matches the route's call (T8 route); the override actions' `redirect(`/admin/companies/${id}?...`)` targets match the detail page's `searchParams` (`ok`/`error`) handling (T4).
- **Ordering:** T2 (token) before T5 (route uses it) before T6 (provisioning emails the link). T1 before T3. T4 detail page imports T3 actions. All dependencies precede their consumers.
- **DB:** no schema change (ADMIN_OVERRIDE columns already exist; `stripeEventId`/`performedById` nullable). So no migration and no live-DB step — unlike M2, this milestone is fully implementable offline.
- **Out of scope (per spec):** state-board dashboard, board/verify_access provisioning, global cross-company application/certificate views, pure-ops launch items, general password-reset UX.
