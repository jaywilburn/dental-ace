# Dental ACE — Launch Completion Design

**Date:** 2026-06-02
**Status:** Approved (design); M1 ready for implementation planning
**Scope:** Complete the Dental ACE accreditation feature (Weeks 5–8 remainder) so it is launch-ready. This is the Dental ACE feature only, not ProTrack or Verify.

## Background

An audit of the Dental ACE feature found the submission + review + billing half is production-grade, but the half that delivers the actual product value is missing:

- No `/attend/[token]` public attendee flow — the entire certificate-issuing loop does not exist.
- No certificate PDF generation, no `issued_certificates` write path, no certificate-issued email.
- `/admin` is a placeholder; no override tooling.
- No lifecycle crons (course/credit expiry) or their emails; only 3 of 8 spec emails exist.
- **Zero automated tests and no test framework** — the top launch risk, since the untested paths are the money/state-mutation ones.

Authoritative spec: `PRD-phase-1-dental-ace.md` (Flows C/E/F, §6–§11).

## Confirmed decisions

- **Scope:** everything for launch (the full Weeks 5–8 remainder).
- **Certificate PDF engine:** PDFKit (not Puppeteer). Intentional deviation from SOW §10 — keeps us off headless Chromium and consistent with the existing approval-letter renderer. `ACE_Certificate.pdf` becomes a visual reference, not an exact HTML mirror.
- **Testing:** included in scope; stand up Vitest and cover the critical money/state paths as part of M1.
- **Emails:** sent via Resend (`RESEND_API_KEY` already set in `.env.local`). **No email-preview tab in the dashboard** — the `emails/` templates remain send-only artifacts. Do not add any preview UI.
- **Quiz retake/lockout tracking:** attempt rows in `issued_certificates` (no new table); failed attempts have `passed=false`, `cert_pdf_url=null`, and do not touch `cert_balance`.
- **Attendee identity / dedupe key:** `course_id` + lowercased `attendee_email`.
- **Cron send-once / cooldown tracking:** a generic `notification_log` table (mirrors the existing `protrack_reminder_log` pattern), introduced in M2.

## Milestone structure

One spec + plan per milestone, built in order. M1 is the blocker and the highest-risk piece; M2/M3 depend on its data existing. This document fully specifies **M1** and outlines M2/M3 (each gets its own spec → plan cycle after the prior milestone lands).

---

## M1 — Attendee → certificate loop

### 1. Routes & components

- `app/attend/[token]/page.tsx` — **public** server component. Loads the course by `accredited_courses.attendee_link_token`. **Fails closed** (friendly error page, no form) when: token not found, course expired (`expires_at < now`), or `companies.cert_balance <= 0`. Mobile-first at 375px.
- `app/attend/[token]/error.tsx` + `app/attend/[token]/loading.tsx` — error boundary + loading skeleton (project rule).
- `components/attend/attendee-form.tsx` — client component, 4 steps:
  1. **Identity** — name, email, license number / type / state.
  2. **Attendance affirmation.**
  3. **Quiz** — 5 questions rendered from `accredited_courses.quiz_questions` JSON.
  4. **Review / submit.**
  Quiz UI state and the retake interaction live client-side; **scoring is server-side only** (never trust the client).

### 2. Submission flow — `lib/attend/actions.ts` (Zod-validated server action)

On submit:

1. Re-fetch the course by token; re-assert active + `cert_balance > 0`.
2. **Lockout check** — count `issued_certificates` rows where `course_id` matches and lowercased `attendee_email` matches:
   - a passing row exists → already certified; return the existing certificate (idempotent).
   - ≥2 rows exist (original + retake, both failed) → locked out for this course.
3. **Score the quiz server-side** against `quiz_questions` (3/5 to pass).
4. **Fail path** — write an attempt row (`passed=false`, `cert_pdf_url=null`, `quiz_responses`, `score`). Does **not** touch `cert_balance`. Return wrong-answer feedback; on the 2nd fail also reveal correct answers + lockout message.
5. **Pass path** — single transaction with `SELECT … FOR UPDATE` on the `companies` row:
   - re-check `cert_balance > 0` inside the lock (closes the race),
   - decrement `cert_balance`, increment `companies.total_certs_issued` and `accredited_courses.certs_issued_count`,
   - insert the `issued_certificates` row (`passed=true`).
   - **After** the transaction commits: render PDF → upload → email → persist `cert_pdf_url`. PDF/email failures are caught and logged without rolling back the issued cert (mirrors `lib/reviewer/actions.ts` approve flow); the cert remains downloadable from the log.

### 3. Certificate PDF — `lib/pdf/certificate.ts` (PDFKit)

Mirrors `lib/pdf/approval-letter.ts` structure (navy/gold brand, no em dashes). Dynamic fields per PRD §10: attendee name, course title, CE hours, completion date, Course ID, certificate ID (`issued_certificates.id`), AADB seal/logo. Uploaded to the **`certificates`** bucket at `certificates/{cert_uuid}.pdf` via the existing `uploadToStorage`.

### 4. Email — `emails/certificate-issued.tsx`

React Email template extending `emails/_brand.tsx`, cert PDF attached, sent to the attendee via the existing `sendEmail`. Send-only; no preview tab.

### 5. Certificate log signed URLs — `app/company/certificates/page.tsx`

Replace the Phase-1 placeholder. List real `issued_certificates` (passed only) for the company, paginated + searchable by attendee name/email; each download is a short-lived **signed URL** via `getSignedUrl` (PRD §7). No schema change.

### 6. Rate limiting — `lib/rate-limit.ts`

A small reusable limiter (in-memory token bucket keyed by IP + token), applied to the attendee submission action now. Documented as upgradeable to a shared store for multi-instance. Reused for login + application submit in M3 (PRD §71).

### 7. Tests — Vitest (new harness)

Add `vitest` + config + a `test` script. Cover money/state paths, mocking at the Prisma boundary (pure logic where possible):

- **Quiz scoring** — pass/fail boundaries, 3/5 threshold, malformed responses.
- **Lockout logic** — 0 / 1 / 2 prior attempts; existing-pass short-circuit.
- **Atomic cert-balance decrement** — decrement on pass, no decrement on fail, zero-balance race rejection.
- **Webhook idempotency** — `stripe_event_id` conflict → no double increment (existing code; first test).
- **Credit consumption** on application submit (existing `submitApplication`).
- **Course-ID generator** — year rollover, zero-padding.

### 8. Schema / config

- **No new tables for M1.** Attempts ride in `issued_certificates`. `notification_log` arrives in M2.
- **Env:** document `RESEND_FROM_EMAIL`, `AADB_ADMIN_EMAIL`, `REVIEWER_NOTIFICATION_EMAILS` in `.env.example`; confirm set in `.env.local` (only `RESEND_API_KEY` is set today). `NEXT_PUBLIC_APP_URL` is required for the attendee-link base.

### M1 acceptance criteria

- A public attendee can open a valid course link, complete the form, pass the quiz, and receive a certificate PDF by email; the cert appears in the company's log with a working signed download.
- Failing twice locks the attendee out of that course and reveals correct answers; a pass after one fail succeeds.
- `cert_balance` decrements exactly once per issued certificate, never on a fail, and never below zero under concurrent submits.
- Attendee form fails closed on expired course / exhausted balance / bad token.
- `pnpm typecheck` clean; Vitest suite green; rate limiting active on the attendee action.

---

## M2 — Lifecycle emails + crons (outline)

- **Templates:** `low-cert-balance.tsx`, `cert-balance-exhausted.tsx`, `course-expiring.tsx`, `app-credits-expiring.tsx` (PRD §8).
- **Crons (daily, Vercel):** courses expiring in 60d → reminder; courses expiring in 30d → second reminder; app credits expiring in 30d → reminder. Mirror `app/api/cron/protrack-reminders/route.ts` (CRON_SECRET bearer auth; non-prod fallback).
- **Low-balance:** email + dashboard banner when `cert_balance <= cert_alert_threshold` (default 25), 7-day cooldown. Exhausted: friendly attendee error (already in M1) + notify company + `AADB_ADMIN_EMAIL`.
- **Send-once / cooldown:** generic `notification_log` table (`company_id` + `kind` + `period_key`, unique) + RLS. 7-day cooldown via a date-bucket `period_key`.
- `vercel.json` cron schedule entries.

## M3 — Admin tooling + launch hardening (outline)

- **Admin override UI:** company list, grant application credits, adjust cert balance → `billing_transactions` rows with `type = ADMIN_OVERRIDE` and `performed_by_id`, append-only (PRD Flow F). Wire the placeholder admin nav (`#` hrefs in `lib/nav/portal-nav.ts`).
- **Account provisioning:** create reviewer/admin accounts.
- **Read-only state-board dashboard:** filterable by state / license type / delivery format (PRD Weeks 7–8; Verify precursor, no audit tools).
- **ACE badge PNG download** per course for providers.
- **Launch hardening:** rate limiting on login + application submit (reusing `lib/rate-limit.ts`), error monitoring, RLS verification on all Phase-1 tables, env-var completeness, Stripe live-mode + production webhook, Resend DNS verification (PRD §11).

## Open items to reconcile (not blocking M1)

- **Cert bundle tiers:** PRD §6 lists `50/100/200/300/500/750`; the current buy-certs page renders a different set. `lib/billing/catalog.ts` is the source of truth — confirm and reconcile (M2/M3, not M1).
