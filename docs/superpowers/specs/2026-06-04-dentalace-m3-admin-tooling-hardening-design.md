# Dental ACE M3 — Admin Tooling + Launch Hardening Design

**Date:** 2026-06-04
**Status:** Approved (design); ready for implementation planning
**Scope:** The final Dental ACE launch slice (Weeks 7-8 remainder): the AADB super-admin surface (`/admin`), billing overrides, staff account provisioning, login + application-submit rate limiting, and the per-course ACE marketing badge. M3 of the launch-completion plan (`docs/superpowers/specs/2026-06-02-dentalace-launch-completion-design.md`). M1 (attendee→cert loop) and M2 (lifecycle emails+crons) are merged.

## Background

M1 + M2 left `/admin` a placeholder and a few PRD Weeks 7-8 items unbuilt. As of this design:

- `/admin` is still just a layout + placeholder page; the admin nav (`lib/nav/portal-nav.ts`) has `#`-href stubs (Companies, Users, Applications, Certificates, Billing Overrides, Reviewer Accounts, State Board Access).
- `ADMIN_OVERRIDE` is defined in the `BillingTransactionType` enum and only ever *displayed* (`app/company/page.tsx`, `app/company/billing/page.tsx`); nothing creates one. PRD Flow F (admin grants credits / adjusts balance, append-only, logged with `performed_by_id`) is unbuilt.
- `lib/rate-limit.ts` (from M1) is applied to the attendee action only; login and application-submit are not rate-limited (PRD Weeks 7-8 / §71).
- No ACE marketing badge generator exists, though the approval email already promises "ACE Marketing Badge — Coming soon."

**Re-scoped against the Verify stream** (which has since shipped a full `/board/*` board portal + public `/verify` lookup + `board_invites` flow):
- The PRD's "state-board read-only dashboard" is **dropped** — Verify's `/board/*` supersedes it.
- Board / `verify_access` provisioning is **dropped from M3** — Verify owns it (invite-code registration). M3 provisions DentalACE *staff* (REVIEWER/ADMIN) only.

## Confirmed decisions

- **Scope:** admin tooling + hardening — billing overrides, staff provisioning, login/app-submit rate limiting, ACE badge PNG. Excludes pure-ops launch items (Stripe live-mode, Resend DNS, error monitoring, RLS audit) — deployment steps, not code.
- **Provisioning depth:** full staff account creation (service-role Supabase Auth user + `users` row), plus role grant/revoke on existing accounts.
- **Badge rendering:** Puppeteer (`puppeteer-core` + `@sparticuz/chromium`) HTML→PNG screenshot, reusing the launch pattern already in `app/api/protrack/export/route.ts`. No new dependency.
- **Override transactions:** `billing_transactions` rows with `type = ADMIN_OVERRIDE`, `performedById = admin.id`, `amountCents = 0`, `stripePaymentId = null`, `stripeEventId = null` (the column is `String? @unique`, so null is fine and multiple are allowed). Append-only.

## Verified facts (codebase)

- `app/admin/layout.tsx` already calls `requireStaff("ADMIN")`, so every `/admin/*` route is admin-gated by the layout.
- `BillingTransaction.stripeEventId` is `String? @unique`; `performedById` is `String? @db.Uuid` ("for ADMIN_OVERRIDE"). No schema change needed for overrides.
- Login (`app/api/auth/signin/route.ts`) validates credentials via `supabase.auth.signInWithPassword`, then requires `users.emailVerifiedAt`, then mints the app's own HMAC session cookie. Passwords live in Supabase Auth.
- `lib/auth/verification-token.ts` is a stateless HMAC token (`signEmailVerificationToken`/`verifyEmailVerificationToken`, `SESSION_SECRET` with a `verify:` domain-separation prefix). There is **no** password-reset/set-password route today.
- Account creation pattern (`app/api/auth/register/route.ts`): `createServiceRoleClient()` → create Supabase Auth user → `users` row in a transaction → signed email link via Resend.

## Components

### 1. Admin dashboard + company management

- `app/admin/page.tsx` — replace placeholder with platform stats: total companies, total certs issued (sum), pending applications count, count of companies at/under their `cert_alert_threshold`. Read-only.
- `app/admin/companies/page.tsx` — all companies in a table (name, app credits, expedited credits, cert balance, total certs issued), `?q=` search by name, paginated (reuse the cert-log pagination idiom).
- `app/admin/companies/[id]/page.tsx` — company detail: balances + recent `billing_transactions`, and the two override forms (section 2). Server component reading via Prisma.
- `lib/nav/portal-nav.ts` — point the admin `#` items at real routes (`/admin/companies`, `/admin/users`); remove "State Board Access" (Verify owns it). Items without a route yet (Applications, Certificates global views) are removed rather than left dangling — YAGNI; add later if asked.

### 2. Billing overrides — `lib/admin/billing-overrides.ts`

Pure helper (unit-tested), no DB:
- `validateOverride({ kind: "app_credits" | "cert_balance", quantity, currentBalance }): { ok: true } | { ok: false; error: string }` — quantity must be a positive integer; a `cert_balance` *decrease* (negative delta) may not drive the balance below zero. Returns a typed result the action surfaces.

Server actions (`"use server"`, `requireStaff("ADMIN")`, Zod on the FormData boundary):
- `grantAppCredits(formData)` — `{ companyId, quantity, expedited: boolean }`. Transaction with `SELECT id FROM companies WHERE id = ... FOR UPDATE`, increment `applicationCredits` or `expeditedCredits` by `quantity`, set/extend `applicationCreditsExpiresAt` to +1 year (consistent with the Stripe credit-grant path), and insert the `ADMIN_OVERRIDE` row (`quantity`, `isExpedited`, `performedById`, `amountCents = 0`).
- `adjustCertBalance(formData)` — `{ companyId, delta }` (signed integer). Transaction + row lock; re-check under lock that `certBalance + delta >= 0`; update `certBalance` by `delta`; insert the `ADMIN_OVERRIDE` row (`quantity = delta`, `performedById`, `amountCents = 0`). Append-only; no edit/delete path.

Both `revalidatePath` the company detail page and surface validation errors back to the form (redirect with an `?error=` like the reviewer reject flow).

### 3. Staff account provisioning — `app/admin/users/page.tsx` + `lib/admin/provision.ts` + a set-password sub-flow

- `app/admin/users/page.tsx` — list staff accounts (`staffRole != NONE`) with email, name, role; a create form (email, first name, last name, role = REVIEWER | ADMIN); and per-row role change/revoke.
- `lib/admin/provision.ts` (`"use server"`, `requireStaff("ADMIN")`, Zod):
  - `createStaffAccount({ email, firstName, lastName, staffRole })`:
    1. Service-role `auth.admin.createUser({ email, password: <random>, email_confirm: true })` (random password is never shown to anyone).
    2. Insert the `users` row: `staffRole`, `firstName`, `lastName`, `emailVerifiedAt = now` (admin-provisioned accounts skip self-verification), `protrackTier = FREE`.
    3. Email the new staffer a **set-password link** (section below) via Resend.
    Handles the already-exists case (existing Supabase user / users row) by surfacing an error rather than duplicating.
  - `setStaffRole({ userId, staffRole })` — promote/revoke `staff_role` on an existing account (`NONE` revokes staff access).
- **Set-password sub-flow** (needed because no password-reset route exists and the admin must not know the password):
  - `lib/auth/set-password-token.ts` — mirrors `verification-token.ts`: `signSetPasswordToken(userId)` / `verifySetPasswordToken(token)`, HMAC over `SESSION_SECRET` with a `setpw:` domain-separation prefix, short TTL embedded in the payload.
  - `app/set-password/page.tsx` — public page taking `?token=`, a new-password form posting to the route below.
  - `app/api/auth/set-password/route.ts` — validates the token, enforces a minimum password policy (Zod), and sets the password via service-role `auth.admin.updateUserById(userId, { password })`. On success redirects to `/login?set=1`. This primitive is intentionally reusable for a future password-reset, but M3 only wires the provisioning entry point.
  - `emails/staff-invite.tsx` — React Email template (mirrors `_brand`) with the set-password CTA.

### 4. Rate limiting — login + application submit

- `app/api/auth/signin/route.ts` — before credential validation, `rateLimit(\`signin:${ip}:${email.toLowerCase()}\`, { limit: 8, windowMs: 15 * 60 * 1000 })`; on block redirect `/login?error=rate_limited`. IP from `x-forwarded-for`.
- `lib/forms/application/actions.ts` `submitApplication` — `rateLimit(\`submit:${ip}:${companyId}\`, { limit: 20, windowMs: 60 * 60 * 1000 })` at the top; on block throw/redirect with a friendly message. (`headers()` is async in Next 16.)
- Reuses `lib/rate-limit.ts` unchanged (already unit-tested). Documented single-instance caveat already noted there.

### 5. ACE badge PNG — `lib/badge/render.ts` + `app/api/courses/[id]/badge/route.ts`

- `lib/badge/render.ts` — `renderAceBadgePng({ courseIdNumber, courseTitle, approvedAt }): Promise<Buffer>`. Builds a self-contained branded HTML string (navy/gold, "Dental ACE Accredited", Course ID, approval date, no external assets, no em dashes) and screenshots it to PNG using the `puppeteer-core` + `@sparticuz/chromium` launch pattern copied from `app/api/protrack/export/route.ts` (serverless chromium path + local `/usr/bin/chromium-browser` fallback), via `page.setContent(html)` then `page.screenshot({ type: "png" })`.
- `app/api/courses/[id]/badge/route.ts` — `GET`, `runtime = "nodejs"`. `requireDentalAce()`; load the `accredited_course` by id; 404 if missing; 403 unless `course.companyId === user.companyId`. Returns the PNG with `Content-Type: image/png` and a `Content-Disposition: attachment; filename="<courseId>-ace-badge.png"`. Generated on demand (no storage).
- `app/company/courses/page.tsx` — add a "Download badge" link per approved course pointing at the route.

### 6. Tests — Vitest

Pure helpers only (proportionate to M1/M2):
- `lib/admin/billing-overrides.test.ts` — `validateOverride`: positive-quantity enforcement, negative `cert_balance` delta that would underflow rejected, valid cases accepted.
- `lib/auth/set-password-token.test.ts` — sign→verify round-trip, tamper rejection, expiry rejection (inject `now`), wrong-prefix isolation from the verification token.
- Provisioning (Supabase Auth + DB), the override transactions, the badge (Puppeteer), and the route handlers are integration paths — not unit-tested, consistent with the crons and the attendee action. Their pure bits are extracted into the helpers above.

## M3 acceptance criteria

- An ADMIN sees real platform stats at `/admin`, can browse/search companies, open a company, grant app credits (standard or expedited) and adjust cert balance; each writes an append-only `ADMIN_OVERRIDE` `billing_transaction` with `performedById` set, under a company row lock, and a `cert_balance` adjustment can never drive the balance negative.
- An ADMIN can create a REVIEWER/ADMIN account; the new staffer receives a set-password email, sets their password, and can log in; an ADMIN can change/revoke a staff role.
- Login and application-submit are rate-limited (excess attempts get a friendly limited response), reusing `lib/rate-limit.ts`.
- A provider can download a PNG ACE badge for an approved course; the route rejects other companies' courses.
- Non-admins cannot reach `/admin/*` (layout guard) or the admin server actions (per-action `requireStaff("ADMIN")`).
- `pnpm test` green (new helper tests); `pnpm typecheck` clean; `pnpm build` succeeds with the new routes listed.

## Out of scope

- State-board dashboard and board/`verify_access` provisioning (Verify's `/board/*` + invite flow).
- Global admin "Applications"/"Certificates" cross-company browse views (add later if requested).
- Pure-ops launch items: Stripe live-mode switch, Resend SPF/DKIM/DMARC, error monitoring (Sentry/Vercel Analytics), RLS audit — deployment/ops, documented in the PRD Week-8 checklist, not code.
- A general user-facing password-reset flow (the set-password primitive lands, but only the provisioning entry point is wired).
