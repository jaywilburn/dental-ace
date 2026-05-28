# DentalACE — Phase 1 PRD

**Phase 1 of 3** · Weeks 1–8 · v0.1 · May 2026
Domain: `dentalace.org`
Parent doc: [`PRD.md`](./PRD.md) · Source of truth: [`logic/aadb-master-sow-v1.1.html`](./logic/aadb-master-sow-v1.1.html)

---

## 1. Phase 1 Goal & Success Criteria

Ship the DentalACE accreditation platform to production at `dentalace.org` by the end of Week 8. Success means:

- A real CE course provider can buy application credits, submit a real 34-field course application, have it reviewed and approved by an AADB reviewer in production, and have the resulting QR code scanned by a real attendee whose certificate PDF lands in their inbox — all without manual intervention.
- The pre-launch checklist (Section 11) passes top to bottom on production, not staging.
- AADB reviewer accounts and ADMIN accounts for John and Christy are live.
- The first paying customer is onboarded.

What's explicitly **not** in Phase 1: any LICENSEE or BOARD functionality, Pro subscriptions, multi-state licensure, the audit tool, the state-board v2 dashboard, the 50-state requirements seeding, the legacy ~3K-record import. The state-board portal in Phase 1 is read-only visibility only — a precursor to Verify.

## 2. In-Scope Features by Week

The week-by-week breakdown mirrors the SOW phase cards (Weeks 1–8) but reframed as feature deliverables. Reviewer/admin task lists are in the SOW; this section describes *what gets built*.

### Week 1 — Setup & Scaffold
- Next.js 16+ project scaffolded with TypeScript strict, Tailwind, ShadCN (themed, not default), and the App Router only.
- Prisma schema for the 6 Phase 1 tables (Section 4) created and pushed to Supabase via `prisma db push`.
- All 29 environment variables populated locally (Section 9).
- Supabase project created, both Storage buckets created (private), Stripe products created in test mode (all 14 — Section 6), Resend account created with `dentalace.org` domain queued for DNS verification.
- CLAUDE.md present; the four `/logic` HTML files preserved as reference (not imported).

### Week 2 — Auth & Portal Shells
- Supabase Auth with email/password. Sign-up disabled for CUSTOMER/REVIEWER/ADMIN roles (those are provisioned by ADMIN, not self-serve). Public attendee flow has no login.
- Role stored on `users` row and mirrored in JWT claims via a Supabase auth hook or trigger.
- Login page at `/login` styled with the navy/gold ACE branding from the prototypes.
- Portal layouts at `app/company/layout.tsx`, `app/reviewer/layout.tsx`, `app/admin/layout.tsx`, each server-rendered with a role guard that redirects to `/login` on mismatch.
- Sidebar navigation per role.
- Seed: 1 test company, 1 test reviewer user, 1 test admin user.

### Weeks 3–4 — Application Form, Stripe Billing, Reviewer Dashboard
- Stripe Checkout flows for all 14 products. Webhook handler at `/api/webhooks/stripe` with idempotency keys (using Stripe's `event.id` as the dedup key on `billing_transactions`).
- Application credit purchases with tier-based pricing (1, 2–4, 5–9, 10–15 — Section 6). Expedite add-on applied per checkout. Credit expiry: 1 year from purchase date, enforced on submission (not at purchase).
- Customer billing-history page; application-credits-remaining widget.
- Multi-step course application form — 5 steps spanning all 34 fields including the quiz builder (Q1–Q2 true/false, Q3–Q5 multiple choice). Draft auto-save to `course_applications` with `status = DRAFT`.
- File uploads (course outline, CV/resume, presenter headshots) to the Supabase Storage `uploads` bucket via server-side signed-upload URLs.
- Submission API validates available credit, atomically consumes one credit, sets `status = PENDING`, and triggers a reviewer-notification email.
- AADB reviewer dashboard: queue view, filters by status/date/expedite, slide-in review panel showing all 34 fields read-only.
- Approve flow: generates `ACE-YYYY-#####` Course ID, attendee link token (UUID), QR code PNG (uploaded to `uploads` bucket), approval letter PDF (PDFKit, uploaded to `uploads` bucket), and sends the approval email to the customer.
- Reject flow: reviewer notes required; rejection email sent.
- React Email templates for: application submitted, approved (with approval letter PDF), rejected.

### Weeks 5–6 — Attendee Form, Certificate Engine, Company Dashboard
- Public attendee form at `/attend/[token]` — 4 mobile-optimized steps. Reads the course record by token, fails closed if the course is expired or the company's certificate balance is exhausted.
- Quiz: dynamically loaded from the course's `quizQuestions` JSON. Scoring: 3 out of 5 to pass. One retake on fail; after failed retake, correct answers are shown.
- Certificate submission API: validates token, scores quiz, atomically decrements `companies.cert_balance`, generates the certificate PDF (Puppeteer + @sparticuz/chromium matching `ACE_Certificate.pdf` design), uploads to the `certificates` bucket, and emails the attendee via Resend with the PDF attached.
- Company dashboard: stat cards (active courses, certs issued this month, balance), cert-balance widget, activity feed, course list.
- Certificate log page: paginated, search, signed-URL PDF download links.
- Buy Certificates page: all 6 bundle tiers (50/100/200/300/500/750 — Section 6).
- Low balance alert: email + dashboard banner triggered when `certBalance` falls below `certAlertThreshold` (configurable per company; default 25).
- Balance exhausted: attendee form returns a friendly error; company + AADB admin notified.

### Weeks 7–8 — Admin, State Board Read-Only, QA, Launch
- Super admin dashboard: all companies, override tools (manual credit grants, manual cert balance adjustments — every override logged to `billing_transactions` with `type = ADMIN_OVERRIDE`), platform analytics.
- State board visibility dashboard (Phase 1 precursor to Verify): read-only, filterable by state / license type / delivery format. No audit tools yet.
- Vercel cron jobs:
  - Daily — courses expiring in 60 days → reminder email to customer.
  - Daily — courses expiring in 30 days → second reminder.
  - Daily — application credits expiring in 30 days → reminder email.
- Per-course ACE badge download (PNG) for course providers.
- Beta-bug fixes from Weeks 5–6 testing.
- TypeScript strict pass: `npx tsc --noEmit` zero errors.
- Zod validation on every API route boundary. Error boundaries and loading skeletons. Rate limiting on attendee form, login, application submission.
- Mobile responsiveness pass at 375px (attendee form and landing page minimum).
- Supabase RLS policies enabled for company-data isolation.
- DNS for `dentalace.org` pointed to Vercel in **Week 7** (not 8) for propagation buffer.
- Stripe switched from test to live mode in Vercel production.
- Production Stripe webhook registered. Resend DNS records (SPF/DKIM/DMARC) verified.
- Error monitoring on (Sentry or Vercel Analytics).
- All AADB reviewer accounts created. ADMIN accounts for John and Christy created in production.

## 3. User Flows (Critical Paths)

### Flow A — Customer onboards and submits a course application
1. Customer logs in via `/login` and lands on `/company`.
2. If no application credits, redirected to "Buy Credits" page — picks a tier (1, 2–4, 5–9, 10–15), optionally adds expedite.
3. Stripe Checkout → webhook fires → `billing_transactions` row created → `companies.application_credits` incremented → `application_credits_expires_at` set to +1 year.
4. Customer clicks "New Application" → 5-step form. Each step auto-saves to a `DRAFT` `course_applications` row.
5. On final submit: API validates remaining credit, atomically decrements credit, sets `status = PENDING`, sends reviewer-notification email to all addresses in `REVIEWER_NOTIFICATION_EMAILS`.

### Flow B — Reviewer approves an application
1. Reviewer logs in via `/login` and lands on `/reviewer`.
2. Queue shows pending applications, with expedite-flagged ones at the top.
3. Clicks an application → slide-in panel renders all 34 fields read-only.
4. Reviewer clicks Approve → server action runs in a transaction:
   - Generate Course ID `ACE-YYYY-#####` (year + zero-padded counter scoped to year).
   - Generate attendee-link UUID, persist to `accredited_courses.attendee_link_token`.
   - Generate QR code PNG → upload to `uploads/qrcodes/{course_id}.png`.
   - Generate approval letter PDF (PDFKit) → upload to `uploads/approval-letters/{course_id}.pdf`.
   - Create `accredited_courses` row with `expires_at = now + 3 years`.
   - Send approval email (Resend) to customer with approval letter PDF attached.

### Flow C — Attendee takes a course and receives a certificate
1. Attendee scans QR or follows public link → `/attend/{token}`.
2. Mobile form: 4 steps — identity (name, email, license number/type/state), attendance affirmation, quiz (5 questions), review/submit.
3. On submit: API validates token + course is active + `companies.cert_balance > 0` → scores quiz.
4. If pass (3/5+): atomically decrement `companies.cert_balance`, render certificate PDF (Puppeteer) matching the existing `ACE_Certificate.pdf` template with dynamic fields populated, upload to `certificates/{cert_uuid}.pdf`, send email with the PDF attached.
5. If fail: show wrong answers and "retake" CTA. Retake only allowed once. After failed retake, the attendee is locked out from this course.

### Flow D — Company buys a certificate bundle
1. Customer clicks "Buy Certificates" → picks a bundle (50/100/200/300/500/750).
2. Stripe Checkout → webhook → `billing_transactions` row → `companies.cert_balance` incremented by the bundle quantity → confirmation email.

### Flow E — Low-balance alerting
- Daily cron checks `companies` where `cert_balance ≤ cert_alert_threshold` and an alert hasn't been sent in the last 7 days → send email + show dashboard banner until the company tops up.

### Flow F — Admin override
- Admin selects a company → can grant application credits or adjust cert balance.
- Each override creates a `billing_transactions` row with `type = ADMIN_OVERRIDE` and the admin's `performed_by_id` set. Append-only — no edit/delete.

## 4. Phase 1 Data Model

Six tables. Phase 2/3 tables (`licensees`, `state_requirements`, `pro_subscriptions`, `pending_licensees`, `state_boards`, `audit_batches`, `audit_selections`, `deficiency_notices`) are **not** created in Phase 1 — they'll be added by their own migrations in Weeks 9 and 17.

> **Naming convention:** columns are `snake_case` in Postgres (the source of truth listed below), and Prisma's `@map` exposes them as `camelCase` on the generated client. So `course_applications.reviewed_by_id` in SQL/RLS is `courseApplication.reviewedById` in TypeScript. The fields listed below are the DB names — translate to camelCase when writing app code.

| Table | Key Fields |
|-------|-----------|
| **users** | `id`, `email` (unique), `role` (`CUSTOMER` \| `REVIEWER` \| `ADMIN` — `LICENSEE`/`BOARD` added later), `company_id` (FK, nullable), `created_at`, `last_login` |
| **companies** | `id`, `name`, `stripe_customer_id`, `application_credits`, `application_credits_expires_at`, `cert_balance`, `cert_alert_threshold`, `total_certs_issued`, `created_at` |
| **course_applications** | `id`, `company_id`, `status` (`DRAFT` \| `PENDING` \| `APPROVED` \| `REJECTED`), `course_title`, `ce_hours`, `course_type`, `delivery_method`, `application_data` (JSON — all 34 fields), `is_expedited`, `submitted_at`, `reviewed_by_id`, `reviewer_notes`, `reviewed_at`, `created_at` |
| **accredited_courses** | `id`, `application_id`, `company_id`, `course_id_number` (`ACE-YYYY-#####`), `approved_at`, `expires_at` (+3y), `attendee_link_token` (UUID), `qr_code_url`, `approval_letter_url`, `quiz_questions` (JSON), `certs_issued_count`, `created_at` |
| **issued_certificates** | `id`, `course_id`, `company_id`, `attendee_name`, `attendee_email`, `license_number`, `license_type`, `license_states` (array), `delivery_method`, `course_type`, `quiz_responses` (JSON), `score`, `passed`, `cert_pdf_url`, `issued_at` |
| **billing_transactions** | `id`, `company_id`, `type` (`APP_CREDIT` \| `CERT_BUNDLE` \| `EXPEDITE` \| `ADMIN_OVERRIDE`), `quantity`, `amount_cents`, `stripe_payment_id` (nullable for admin overrides), `stripe_event_id` (unique — idempotency), `is_expedited`, `performed_by_id` (nullable; set for `ADMIN_OVERRIDE`), `created_at` |

### Schema notes
- All money stored as integer cents.
- `stripe_event_id` is the idempotency key: webhook handler upserts on this column to be safe against Stripe retries.
- All credit/balance decrements run inside a transaction with a row-level lock on the `companies` row.
- Phase 2 will add `LICENSEE` to the `users.role` enum and a `licensees` table; design the enum and FK to make that additive, not a breaking change.

## 5. Authentication & Authorization

**Supabase Auth** with email/password. No social providers in Phase 1.

### Role model
- Three private roles in Phase 1: `CUSTOMER`, `REVIEWER`, `ADMIN`.
- Public ATTENDEE access is via `attendee_link_token` only — never authenticated.
- Role is the single source of truth on `users.role`. A Supabase Auth Hook (or DB trigger) mirrors it into JWT custom claims so server components can read it without a DB roundtrip on every request.

### Route protection (Next 16, no middleware.ts)
Each portal has a server-component `layout.tsx` that:
1. Reads the Supabase session on the server.
2. Loads the role from JWT claims (or falls back to a `users` lookup).
3. Redirects to `/login` if no session, or `/403` if the role doesn't match.

Layouts:
- `app/company/layout.tsx` requires `CUSTOMER`.
- `app/reviewer/layout.tsx` requires `REVIEWER`.
- `app/admin/layout.tsx` requires `ADMIN`.
- `app/attend/[token]/page.tsx` is public; access controlled by token + course-active check.
- `app/login/page.tsx` is public; sign-in form for all three private roles.

### RLS as the floor
Even if a route handler is misconfigured, Supabase RLS policies enforce:
- Customers see only their own company's rows in `course_applications`, `accredited_courses`, `issued_certificates`, `billing_transactions`.
- Reviewers see all `course_applications` in `PENDING` status and their own historical reviews.
- Admins see everything.

Server-side privileged operations (webhook handlers, cron jobs) use the service-role key — **never exposed client-side**.

## 6. Stripe Products (14)

All 14 created in test mode in Week 1, switched to live in Week 8.

### Application credits (4 products)
| Product | Price | Env Var |
|---------|-------|---------|
| 1 Course Application | $99.00 | `STRIPE_PRICE_ID_APP_1` |
| 2–4 Course Applications | $95.00/each | `STRIPE_PRICE_ID_APP_2_4` |
| 5–9 Course Applications | $90.00/each | `STRIPE_PRICE_ID_APP_5_9` |
| 10–15 Course Applications | $85.00/each | `STRIPE_PRICE_ID_APP_10_15` |

### Expedite add-ons (4 products, flat fee on top of an app purchase)
| Product | Price | Env Var |
|---------|-------|---------|
| Expedite — 1 app | +$75.00 | `STRIPE_PRICE_ID_EXP_1` |
| Expedite — 2–4 apps | +$150.00 | `STRIPE_PRICE_ID_EXP_2_4` |
| Expedite — 5–9 apps | +$250.00 | `STRIPE_PRICE_ID_EXP_5_9` |
| Expedite — 10–15 apps | +$350.00 | `STRIPE_PRICE_ID_EXP_10_15` |

### Certificate bundles (6 products)
| Product | Price | Env Var |
|---------|-------|---------|
| 50 Certificate Bundle | $500.00 ($10/cert) | `STRIPE_PRICE_ID_CERT_50` |
| 100 Certificate Bundle | $900.00 ($9/cert) | `STRIPE_PRICE_ID_CERT_100` |
| 200 Certificate Bundle | $1,400.00 ($7/cert) | `STRIPE_PRICE_ID_CERT_200` |
| 300 Certificate Bundle | $1,800.00 ($6/cert) | `STRIPE_PRICE_ID_CERT_300` |
| 500 Certificate Bundle | $2,500.00 ($5/cert) | `STRIPE_PRICE_ID_CERT_500` |
| 750 Certificate Bundle | $3,000.00 ($4/cert) | `STRIPE_PRICE_ID_CERT_750` |

### Stripe Connect
AADB is the master Stripe account holder. CE Exchange is the connected recipient. Phase 1 split is fixed 75/25 (CE Exchange / AADB) per the Services Agreement — implemented as automatic transfers via Stripe Connect, not manual journal entries.

### Webhook handler rules
- Every handler is idempotent on `event.id` (persisted as `stripeEventId`).
- Log the event to the DB **before** processing — so a partial-failure replay is safe.
- Local testing via Stripe CLI: `stripe listen --forward-to localhost:3000/api/webhooks/stripe`.

## 7. File Storage (Supabase Storage)

Two private buckets:

| Bucket | Contents |
|--------|----------|
| `certificates` | Generated certificate PDFs. One per issued cert. |
| `uploads` | Course outlines, presenter CVs/resumes, presenter headshots, generated QR code PNGs, generated approval-letter PDFs. |

### Rules
- Both buckets are **private**. Public reads forbidden.
- Client uploads use server-issued signed upload URLs — never the service role key on the client.
- Reads use short-lived signed URLs (e.g., 5-minute TTL for PDF downloads).
- Folder convention: `uploads/applications/{applicationId}/...`, `uploads/approval-letters/{courseId}.pdf`, `uploads/qrcodes/{courseId}.png`, `certificates/{certId}.pdf`.

## 8. Email Templates (Resend + React Email)

| Trigger | Template | Recipients |
|---------|----------|------------|
| Application submitted | `application-submitted.tsx` | Customer + reviewers in `REVIEWER_NOTIFICATION_EMAILS` |
| Application approved | `application-approved.tsx` (attaches approval letter PDF) | Customer |
| Application rejected | `application-rejected.tsx` (includes reviewer notes) | Customer |
| Certificate issued | `certificate-issued.tsx` (attaches cert PDF) | Attendee |
| Low cert balance | `low-cert-balance.tsx` | Customer (cooldown: 7 days between sends per company) |
| Cert balance exhausted | `cert-balance-exhausted.tsx` | Customer + `AADB_ADMIN_EMAIL` |
| Course expiring (60d / 30d) | `course-expiring.tsx` | Customer |
| Application credits expiring (30d) | `app-credits-expiring.tsx` | Customer |

### Deliverability rules
- Sending domain: `dentalace.org`.
- SPF + DKIM + DMARC records published in DNS **before Week 5** (when certificate emails start firing).
- Deliverability tested against Gmail, Outlook, Yahoo before Week 5.
- All transactional emails sent server-side from Vercel functions; from address `noreply@dentalace.org` (`RESEND_FROM_EMAIL`).

## 9. Environment Variables (29)

Differences from the SOW: dropped 4 AWS vars and 2 NextAuth vars; added 5 Supabase vars. Stripe price IDs unchanged.

### Supabase (added)
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` — server-only
- `SUPABASE_STORAGE_BUCKET_CERTS` — e.g. `certificates`
- `SUPABASE_STORAGE_BUCKET_UPLOADS` — e.g. `uploads`

### Database (Prisma)
- `DATABASE_URL` — pooled connection string from Supabase
- `DIRECT_URL` — direct (non-pooled) URL for Prisma migrations

### App
- `NEXT_PUBLIC_APP_URL` — base URL for attendee links and emails

### Stripe
- `STRIPE_SECRET_KEY` — `sk_test_...` dev / `sk_live_...` prod
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` — `pk_test_...` or `pk_live_...`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_ID_APP_1`, `STRIPE_PRICE_ID_APP_2_4`, `STRIPE_PRICE_ID_APP_5_9`, `STRIPE_PRICE_ID_APP_10_15`
- `STRIPE_PRICE_ID_EXP_1`, `STRIPE_PRICE_ID_EXP_2_4`, `STRIPE_PRICE_ID_EXP_5_9`, `STRIPE_PRICE_ID_EXP_10_15`
- `STRIPE_PRICE_ID_CERT_50`, `STRIPE_PRICE_ID_CERT_100`, `STRIPE_PRICE_ID_CERT_200`, `STRIPE_PRICE_ID_CERT_300`, `STRIPE_PRICE_ID_CERT_500`, `STRIPE_PRICE_ID_CERT_750`

### Resend
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL` — `noreply@dentalace.org`

### Admin
- `AADB_ADMIN_EMAIL` — alerts for cert exhausted, system errors
- `REVIEWER_NOTIFICATION_EMAILS` — comma-separated list

### Dropped from SOW
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `AWS_S3_BUCKET_CERTS`, `AWS_S3_BUCKET_UPLOADS` → replaced by Supabase Storage vars.
- `NEXTAUTH_SECRET`, `NEXTAUTH_URL` → replaced by Supabase Auth (no extra env vars needed beyond the Supabase keys).

## 10. PDF Generation

- **Certificates** — Puppeteer + `@sparticuz/chromium` rendering an HTML template that matches the existing `ACE_Certificate.pdf` exactly. Dynamic fields: attendee name, course title, CE hours, completion date, Course ID, certificate ID, AADB seal/logo.
- **Approval letters** — PDFKit (simpler, lighter, no headless browser needed). One per approved application.
- **Vercel** — function size set to 50MB in `vercel.json` for the Puppeteer cold start.
- **Risk** — Puppeteer on Vercel serverless is the single highest-likelihood risk in Phase 1. Budget 1–2 buffer days in Week 5.

## 11. Pre-Launch Checklist (Week 8)

### Technical (developer)
- [ ] `npm run build` passes with zero errors
- [ ] `npx tsc --noEmit` passes with zero errors
- [ ] All 29 env vars set in Vercel production
- [ ] Stripe switched to LIVE mode; live keys in Vercel
- [ ] Production Stripe webhook registered at `https://dentalace.org/api/webhooks/stripe` and verified
- [ ] `dentalace.org` SSL issued; HTTPS working
- [ ] Supabase Storage buckets private — no public access; signed-URL access only
- [ ] Resend SPF + DKIM + DMARC verified on `dentalace.org`
- [ ] Supabase RLS policies active on all Phase 1 tables
- [ ] Error monitoring active (Sentry or Vercel Analytics)
- [ ] Daily Vercel cron jobs configured (course 60d/30d reminders, credit 30d reminder)

### Functional (John / Christy)
- [ ] Full E2E flow tested on **production** (not staging)
- [ ] Real Stripe payment processed successfully
- [ ] QR code scanned on **iPhone AND Android**
- [ ] Certificate PDF received by email and visually approved
- [ ] Reviewer dashboard — both Approve and Reject flows tested
- [ ] Approval letter PDF matches expected AADB format
- [ ] Admin accounts created for John and Christy
- [ ] All AADB reviewer accounts created
- [ ] Low-balance alert email received and approved
- [ ] Landing page copy reviewed and approved

## 12. Open Questions

1. **Sign-up flow for new CUSTOMER companies** — is it self-serve (any email can sign up and start a new company) or invite-only (AADB admin provisions new companies)? The SOW implies self-serve via the company portal flow but doesn't say it explicitly. Default assumption in this PRD: **invite-only in Phase 1** (admin provisions companies; self-serve added in v1.1 if needed). Confirm.
2. **Reviewer-notification email** — single shared inbox or fan-out to all reviewer addresses? Default assumption: fan-out per `REVIEWER_NOTIFICATION_EMAILS`. Confirm.
3. **Certificate PDF — exact design source.** SOW references "matching `ACE_Certificate.pdf` exactly" — confirm the file location of the template to mirror.
4. **AADB logo + brand assets** — confirm where the high-res logo (PNG, transparent, 400×400+) will be sourced for both the cert PDF and the platform UI.
5. **Landing page copy approver** — who signs off on the dentalace.org landing-page copy before launch?
6. **State board read-only dashboard in Phase 1** — what's the minimum filter set John wants? SOW says "filterable by state/type/format" — confirm those three are the full set for Phase 1.

## 13. Out of Phase 1 (Built Later)

Anything referenced in the SOW that this PRD intentionally defers:

- LICENSEE role and ProTrack portal → Phase 2 (Weeks 9–16).
- BOARD role and Verify portal → Phase 3 (Weeks 17–24).
- `licensees`, `ce_certificates`, `state_requirements`, `pro_subscriptions`, `pending_licensees`, `state_boards`, `audit_batches`, `audit_selections`, `deficiency_notices` tables.
- ACE → Track auto-sync hook (added in Phase 2 once `licensees` exists).
- ProTrack Pro Stripe subscriptions.
- Multi-state licensure.
- 50-state CE requirements data.
- ~3,000 legacy ACE attendee record import.
- Random audit generator, deficiency notices, audit report PDF export.

## 14. References

- SOW: [`logic/aadb-master-sow-v1.1.html`](./logic/aadb-master-sow-v1.1.html) — pricing, schema, scope source of truth
- Suite PRD: [`PRD.md`](./PRD.md)
- Project memory: [`CLAUDE.md`](./CLAUDE.md)
- Landing-page prototype: [`logic/dentalace-landing-page.html`](./logic/dentalace-landing-page.html)
- Landing-page handoff: [`logic/dentalace-landing-page-handoff.md`](./logic/dentalace-landing-page-handoff.md)
