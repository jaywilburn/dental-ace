# Dental ACE M2 — Lifecycle Emails + Crons Design

**Date:** 2026-06-03
**Status:** Approved (design); ready for implementation planning
**Scope:** The lifecycle-notification half of the Dental ACE launch remainder: the daily cron that fires course-expiry, credit-expiry, and certificate-balance alerts, the four email templates they send, the dedupe/cooldown store, and the dashboard widget copy fix. This is M2 of the launch-completion plan (`docs/superpowers/specs/2026-06-02-dentalace-launch-completion-design.md`). M1 (the attendee → certificate loop) is merged.

## Background

M1 closed the certificate-issuing loop. M2 adds the time-based lifecycle notifications from the Phase-1 PRD that nothing currently sends:

- **PRD §8 emails not yet built:** `course-expiring` (60d/30d), `app-credits-expiring` (30d), `low-cert-balance`, `cert-balance-exhausted`.
- **PRD Weeks 7-8 crons not yet built:** daily course-expiry (60d, 30d) reminders, daily app-credit-expiry (30d) reminder.
- **PRD Flow E:** low-balance alert (email + dashboard treatment) when `cert_balance ≤ cert_alert_threshold` (default 25), no more than once per 7 days.
- **PRD balance-exhausted:** when `cert_balance == 0`, notify the company + `AADB_ADMIN_EMAIL`.

The established pattern to mirror is `app/api/cron/protrack-reminders/route.ts`: a single daily Vercel cron, CRON_SECRET bearer auth (non-prod fallback), send-once enforced by inserting into a dedicated log table with a unique constraint and only emailing when the insert is new.

## Confirmed decisions

- **One consolidated daily cron** (`/api/cron/dental-ace-lifecycle`) runs all checks in a single pass — not separate routes per job. Mirrors the protrack cron; one `vercel.json` entry; one CRON_SECRET auth; fewer Vercel cron slots.
- **Balance-exhausted fires from the daily cron** (detect `cert_balance == 0`, deduped), not real-time from the attendee action — keeps the certificate-issuing hot path clean and gives one dedupe path.
- **Dashboard: enhance the existing widget only.** The cert-balance widget in `app/company/page.tsx` already flips on `lowBalance`; M2 only replaces its placeholder copy with a real warning. No new dismissible top-of-page banner.
- **Cert-bundle tier reconciliation is dropped from scope** — `lib/billing/catalog.ts` already uses 50/100/200/300/500/750 (matches PRD §6); the earlier flag was a misread of the buy page, which renders from the catalog.
- **Testing:** Vitest unit tests for all pure lifecycle logic (consistent with M1). The cron route itself stays untested (DB-dependent), as the protrack cron is.

## Components

### 1. Consolidated daily cron — `app/api/cron/dental-ace-lifecycle/route.ts`

Mirrors `app/api/cron/protrack-reminders/route.ts`: `export const runtime = "nodejs"`, an `authorized(request)` helper checking `Authorization: Bearer <CRON_SECRET>` (allow in non-production when CRON_SECRET is unset), `GET` handler, JSON summary response. `NEXT_PUBLIC_APP_URL` (fallback to request origin) builds links.

One daily pass, in order:

1. **Course expiring.** For each `accredited_course` with `expiresAt > now`, compute `daysUntil`. `dueCourseReminders(daysUntil)` returns which of `d60`/`d30` apply (`d60` when `daysUntil ≤ 60`, `d30` when `daysUntil ≤ 30`). Each is send-once per course per expiry date (so a course gets the 60d reminder once and the 30d reminder once). Recipient: the company's customer email(s). Email: `course-expiring` with `daysRemaining`.
2. **App credits expiring.** For each company with `applicationCreditsExpiresAt` within 30 days (`creditsReminderDue(daysUntil, applicationCredits) === true`, i.e. `0 < daysUntil ≤ 30` and credits remain), send-once per company per that expiry date. Email: `app-credits-expiring`.
3. **Balance alerts.** Per company, mutually exclusive via `balanceAlertKind(certBalance, threshold)`:
   - `"exhausted"` (`certBalance == 0`) → `cert-balance-exhausted` to the company **and** `AADB_ADMIN_EMAIL`; rolling 7-day cooldown.
   - `"low"` (`0 < certBalance ≤ threshold`) → `low-cert-balance` to the company; rolling 7-day cooldown.
   - `null` otherwise → nothing.

Returns `{ ok, coursesReminded, creditsReminded, lowBalance, exhausted }`.

The cron resolves a company's customer recipient(s) by querying `users` where `companyId` matches (the same way the approve flow finds `company.users[0].email`). If a company has no users, skip its company-level emails (log and continue).

### 2. Dedupe store — `notification_log` table + RLS migration `sql-migrations/00NN_notification_log_rls.sql`

(Use the next available `sql-migrations/` number — `0009` is the current highest, so `0010` unless the Verify stream has since added more; check before naming.)

Prisma model:
```
model NotificationLog {
  id        String   @id @default(uuid()) @db.Uuid
  companyId String   @map("company_id") @db.Uuid
  kind      String   // course_expiring_60 | course_expiring_30 | credits_expiring_30 | low_balance | balance_exhausted
  refId     String   @map("ref_id") @db.Uuid   // courseId for course_* kinds; companyId for company-level kinds
  periodKey String   @map("period_key")        // dedupe bucket (see below)
  sentAt    DateTime @default(now()) @map("sent_at")

  @@unique([companyId, kind, refId, periodKey])
  @@index([companyId, kind, sentAt])
  @@map("notification_log")
}
```

- **`refId` is NOT NULL.** Postgres treats NULLs as distinct in unique constraints, which would silently break dedupe for company-level alerts. So `refId` is always set: `courseId` for `course_*`, `companyId` for `credits_expiring_30` / `low_balance` / `balance_exhausted`.
- **Send-once kinds** (`course_expiring_60`, `course_expiring_30`, `credits_expiring_30`): `periodKey` = the relevant expiry date as an ISO date string (course `expiresAt` date, or company `applicationCreditsExpiresAt` date). Implemented with `prisma.notificationLog.createMany({ data: [key], skipDuplicates: true })` and emailing only when `count === 1` — the exact protrack-reminders `logAndSend` pattern. Because buying more credits resets `applicationCreditsExpiresAt`, the new window has a new `periodKey` and can alert again.
- **Cooldown kinds** (`low_balance`, `balance_exhausted`): query the most recent matching row (`companyId` + `kind`, order by `sentAt desc`); send only if none exists or `isCooldownElapsed(lastSentAt, now, 7)`, then insert a row with `periodKey` = today's ISO date (same-day idempotency under the unique constraint). The two balance kinds are mutually exclusive per run, so a company never receives both.
- **RLS:** mirror `protrack_reminder_log` (see `sql-migrations/0007`): `alter table ... enable row level security` plus an admin-all policy. Written by the cron via the service-role client; ADMIN may read. No anon/customer access. Applied via the Supabase MCP `apply_migration` tool (raw-SQL migrations live in `sql-migrations/`, not `prisma/migrations`).

Because this adds a Prisma model, a Prisma migration is also generated for the table itself (`pnpm exec prisma migrate dev --name notification_log`, which Prisma timestamps; follow the existing `<timestamp>_000N_*` convention using the next sequential `000N`), and the RLS is layered on via the raw-SQL migration — matching how the existing tables split structural DDL (Prisma) from RLS (sql-migrations). Confirm the current highest Prisma migration number before naming, since the Verify stream may have added one.

### 3. Pure lifecycle logic — `lib/notifications/lifecycle.ts`

No `server-only`, no DB; unit-tested directly. The cron wires these to Prisma.

- `daysUntil(date: Date, now: Date): number` — whole days from `now` to `date` (ceil).
- `dueCourseReminders(daysUntil: number): ("d60" | "d30")[]` — `["d60"]` plus `"d30"` when `daysUntil ≤ 30`; empty when `daysUntil > 60`. (A course under 30 days yields both thresholds; dedupe makes the 60d one a no-op if already sent.)
- `creditsReminderDue(daysUntil: number, creditsRemaining: number): boolean` — `creditsRemaining > 0 && daysUntil > 0 && daysUntil ≤ 30`.
- `balanceAlertKind(certBalance: number, threshold: number): "exhausted" | "low" | null` — `0 → exhausted`; `≤ threshold (and > 0) → low`; else `null`.
- `isCooldownElapsed(lastSentAt: Date | null, now: Date, cooldownDays: number): boolean` — `true` if `lastSentAt` is null or older than `cooldownDays`.

### 4. Email templates (mirror `emails/_brand.tsx`; em-dash-free; send-only, no preview tab)

Each extends `BrandEmail` with `DetailGrid`/`CtaButton`/`emailColors` and a static `.subject(props)`, like `emails/application-approved.tsx`:

- `emails/course-expiring.tsx` — props include `companyName`, `courseTitle`, `courseIdNumber`, `expiresAt`, `daysRemaining` (60 or 30), `myCoursesUrl`.
- `emails/app-credits-expiring.tsx` — `companyName`, `creditsRemaining`, `expiresAt`, `buyCreditsUrl`.
- `emails/low-cert-balance.tsx` — `companyName`, `certBalance`, `threshold`, `buyCertsUrl`.
- `emails/cert-balance-exhausted.tsx` — `companyName`, `buyCertsUrl` (sent to company + `AADB_ADMIN_EMAIL`).

### 5. Dashboard widget copy — `app/company/page.tsx`

The cert-balance widget already computes `lowBalance` and renders a low-balance branch. Replace the placeholder string `"⚠ Low balance alert active · email + banner"` with a real customer-facing warning (e.g. "Low balance, top up to keep issuing certificates"). No structural/layout change, no new component.

### 6. `vercel.json`

Add one entry to the existing `crons` array:
```json
{ "path": "/api/cron/dental-ace-lifecycle", "schedule": "0 12 * * *" }
```
(Daily at 12:00 UTC, distinct from the protrack cron's 14:00.)

## Tests (Vitest)

`lib/notifications/lifecycle.test.ts` covers every function:
- `daysUntil` rounding;
- `dueCourseReminders` at boundaries (61 → none, 60 → d60, 31 → d60, 30 → d60+d30, 1 → d60+d30);
- `creditsReminderDue` (0 credits → false, 31 days → false, 30 days → true, 0 days → false);
- `balanceAlertKind` (0 → exhausted, threshold → low, threshold+1 → null);
- `isCooldownElapsed` (null → true, 6 days → false, 7 days → true).

The cron route is not unit-tested (DB-dependent), consistent with `protrack-reminders`.

## M2 acceptance criteria

- A daily authorized GET to `/api/cron/dental-ace-lifecycle` sends, with correct dedupe: 60d and 30d course-expiry reminders (once each per course), a 30d app-credit-expiry reminder (once per credit window), a low-balance email (≤ threshold, ≤ once/7 days), and an exhausted email to company + `AADB_ADMIN_EMAIL` (== 0, ≤ once/7 days), never both balance emails at once.
- Unauthorized requests (bad/missing bearer in production) get 401.
- The four templates render and send via the existing `sendEmail` (log mode without `RESEND_API_KEY`).
- `notification_log` enforces send-once / cooldown; RLS enabled.
- Dashboard widget shows a real low-balance warning.
- `pnpm test` green (incl. new lifecycle tests); `pnpm typecheck` clean; `pnpm build` succeeds with the new cron route listed.

## Out of scope (→ M3)

Admin override tooling, reviewer/admin provisioning, read-only state-board dashboard, ACE badge PNG, login/application-submit rate limiting. (Verify-feature code such as `lib/board/audits/run.ts` is a separate stream and not part of M2.)
