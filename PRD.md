# DentalACE One — Product Requirements Document

**Suite-level PRD** · v0.1 · May 2026
Prepared for: John & Christy Stamper · AADB · CE Exchange
Domain: `dentalace.org`

> This is the framing document for the entire DentalACE One. For the detailed Phase 1 build (DentalACE, Weeks 1–8), see [`PRD-phase-1-dental-ace.md`](./PRD-phase-1-dental-ace.md). The contractual source of truth for scope, pricing, and schema is the SOW at [`logic/aadb-master-sow-v1.1.html`](./logic/aadb-master-sow-v1.1.html).

---

## 1. Vision & Problem

The American Association of Dental Boards (AADB) administers continuing-education accreditation, licensee tracking, and state-board compliance audits for the U.S. dental industry. Today these workflows are stitched together from WordPress forms, Typeform, Zapier, Google Sheets, and Anvil — with manual paper-based audits at the state-board level. The seams cost time, introduce errors, and make adoption hard for both course providers and dental boards.

DentalACE One replaces that stack. It is a **single platform** — one account per user — with three features, delivered over a 24-week build:

- **DentalACE** — CE course accreditation and certificate distribution for course providers.
- **ProTrack** — Personal CE dashboard for the ~50-state population of dentists, hygienists, and dental assistants.
- **Verify** — Random-sample CE compliance auditing for state dental boards.

Every user is a DentalACE One user; the three features are gated by per-user entitlements (see §3). Each feature stands on its own, and together they share one dataset: courses accredited in DentalACE auto-sync into ProTrack, which feeds compliance data into Verify. The same dataset serves the course provider, the licensee, and the regulator.

## 2. The Three Features

### DentalACE — Accreditation
**Serves:** CE course providers, AADB reviewers, and admins.
**Access:** the user belongs to a provider company that has purchased application credits (prepaid credits + certificate bundles — paid access, not a recurring subscription).
**Replaces:** WordPress + Typeform + Zapier + Google Sheets + Anvil.
**Core flow:** Provider buys application credits → submits 34-field course application → AADB reviews → approved course gets a Course ID (`ACE-YYYY-#####`), QR code, and attendee form → attendees take a 5-question quiz → certificates issued by email.
**Revenue:** Per-application credits ($85–$99 depending on tier, plus optional expedite add-on) and certificate bundles ($4–$10 per cert depending on bundle size).
**Launch:** Week 8.

### ProTrack — CE Tracking
**Serves:** Dentists (DDS/DMD), hygienists (RDH), and dental assistants (DA) in all 50 states.
**Access:** included free with **every** DentalACE One account (the platform's free baseline); ProTrack Pro is a paid upgrade.
**Replaces:** Spreadsheets, shoeboxes of paper certs, board-renewal anxiety.
**Core flow:** Every account includes ProTrack Free → ACE-issued certificates auto-sync to the dashboard → upload other CE certificates (ADA CERP, AGD PACE, Other Accredited) → see real-time progress against the user's state CE requirements → Pro tier unlocks audit-ready PDF export, renewal reminders, and multi-state licensure.
**Revenue:** Free for every account (baseline) + ProTrack Pro at $7/mo or $79/yr.
**Launch:** Week 16.

### Verify — Board Auditing
**Serves:** State dental boards.
**Access:** free, but **admin-granted** — the board signs up like any user, then an admin enables Verify access from the Admin dashboard after the board is contracted.
**Replaces:** Manual paper-based random audit processes administered by board staff.
**Core flow:** Board logs in → configures a random audit (sample %, license type filter, renewal cycle) → one click generates a sample → live compliance data pulled from ProTrack → board sends bulk deficiency notices via Resend → deficiencies auto-resolve when licensees upload missing hours → board exports a signed audit report PDF.
**Revenue:** Annual board license — $500 (small board, <3K licensees) / $1,000 (mid, 3K–10K) / $1,500 (large, 10K+).
**Launch:** Week 24.

## 3. Users & Access

Every user has **one DentalACE One account** and signs up through **one public sign-up**. A new account gets **ProTrack Free** immediately. The other features are layered on by entitlement, all readable directly off the streamlined `users` row:

| Column | Values | Grants |
|--------|--------|--------|
| `staff_role` | `NONE` / `REVIEWER` / `ADMIN` | Internal AADB staff areas (`/reviewer`, `/admin`). Admin-provisioned; default `NONE`. |
| `company_id` | FK → `companies` (nullable) | **DentalACE** access. Set when the user belongs to a provider company; the company holds prepaid credits/billing. |
| `protrack_tier` | `FREE` / `PRO` | **ProTrack**. Every account is at least `FREE`; `PRO` unlocks reminders, multi-state, and audit-ready export. |
| `verify_access` | boolean | **Verify**. Admin-granted from the Admin dashboard; default `false`. |

A single account can hold several features at once, so login lands on a **platform home/hub**, not a single role-portal. Feature areas live at `/company` (DentalACE), `/protrack` (ProTrack), `/verify` (Verify), `/reviewer`, and `/admin`; each is gated by the relevant entitlement, enforced at the server-component layout layer and at the database layer (RLS).

**ATTENDEE is not an account.** Attendees reach `/attend/[token]` via a public QR/link, take the quiz, and receive a certificate — no login, no `users` row.

### Registration & access
- **Sign-up (public, self-serve):** creates the account and activates ProTrack Free. One funnel for everyone.
- **DentalACE:** added in-app by creating or joining a provider company and purchasing credits (sets `company_id`).
- **ProTrack Pro:** a paid upgrade ($7/mo or $79/yr) on the existing account; no separate sign-up.
- **Verify:** the state board signs up like any user; an admin then grants `verify_access`.
- **Reviewer / Admin:** provisioned by an admin (not public sign-up); `staff_role` is set on their account.

## 4. Shared Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | **Next.js 16+** — App Router only. No `pages/`, no `middleware.ts`. TypeScript strict mode. |
| **Database** | **Supabase Postgres** via Prisma ORM. Row Level Security policies as the access-control floor. |
| **Authentication** | **Supabase Auth** — email/password. Staff role + per-feature entitlements stored on the `users` row (and mirrored to JWT claims). Route protection via server-component layout checks in each route group. |
| **File Storage** | **Supabase Storage** — two private buckets (`certificates`, `uploads`). Signed URLs only; never expose service-role key to the client. |
| **Payments** | Stripe + Stripe Connect. AADB is the master account; CE Exchange is the connected recipient (per the Services Agreement revenue split). |
| **Email** | Resend with React Email TypeScript components. Sending domain `dentalace.org` with SPF + DKIM + DMARC. |
| **PDF Generation** | Puppeteer + `@sparticuz/chromium` for certificates and audit reports; PDFKit for approval letters. Vercel function size 50MB. |
| **QR Codes** | `qrcode` npm package, server-side generation. |
| **UI** | Tailwind + ShadCN — **always heavily customized**, never default look. Navy/gold AADB brand from the prototypes. |
| **Hosting** | Vercel — frontend, API routes, cron jobs. Error monitoring via Sentry or Vercel Analytics. |

### Deliberate Deviations from the SOW

Three of the SOW's stack choices were updated when this PRD was drafted. They are intentional — not mistakes to fix.

1. **Next.js 16+ (not 14).** Removes `middleware.ts` and the Pages Router from the architecture. Route protection lives in server-component layouts (`app/company/layout.tsx`, `app/reviewer/layout.tsx`, `app/admin/layout.tsx`, etc.), not edge middleware.
2. **Supabase Auth (not NextAuth.js v5).** Native integration with Supabase RLS, one fewer service to wire up, JWT-claim-based access. Access is **entitlement-based on a single `users` row** (a staff role plus per-feature flags) rather than one-role-per-user; the public ATTENDEE token flow is unchanged.
3. **Supabase Storage (not AWS S3).** Two buckets replace the two S3 buckets. Drops the AWS account entirely. Signed URLs replace S3 pre-signed URLs.

All other SOW decisions stand: Prisma, Stripe Connect with 14 products in Phase 1, Resend, Vercel, Puppeteer + @sparticuz/chromium, qrcode, ShadCN + Tailwind themed.

## 5. Phase Roadmap

| Phase | Weeks | Product | Milestone |
|-------|-------|---------|-----------|
| **Phase 1** | 1–8 | DentalACE | `dentalace.org` live; first paying customer; first cert issued |
| **Phase 2** | 9–16 | ProTrack | Free + Pro live; ~3K legacy ACE records claimable |
| **Phase 3** | 17–24 | Verify | First state board provisioned; full E2E audit cycle works |

Each phase starts in a fresh Claude Code session with the latest [`CLAUDE.md`](./CLAUDE.md) loaded. Out-of-phase work (e.g., touching ProTrack during Phase 1) is explicitly out of scope unless promoted to the v1.1 backlog.

## 6. Revenue Model

All platform revenue flows through Stripe Connect: AADB is the master Stripe account holder; CE Exchange is the connected recipient. Splits are automated at time of payment per the Services Agreement (effective July 1, 2026, term through December 31, 2031).

| Phase | Period | CE Exchange | AADB | Trigger |
|-------|--------|-------------|------|---------|
| **Phase 1 — Fixed** | Jul 1, 2026 – Dec 31, 2027 | 75% | 25% | All revenue. Fixed, not adjustable. |
| **Phase 2 — Tier 0** | Jan 1, 2028 – Dec 31, 2031 | 75% | 25% | AADB-sourced revenue < $25K trailing 12 months |
| **Phase 2 — Tier 1** | Jan 1, 2028 – Dec 31, 2031 | 65% | 35% | AADB-sourced revenue $25K–$74,999 |
| **Phase 2 — Tier 2** | Jan 1, 2028 – Dec 31, 2031 | 60% | 40% | AADB-sourced revenue $75K–$149,999 |
| **Phase 2 — Parity** | Jan 1, 2028 – Dec 31, 2031 | 50% | 50% | AADB-sourced revenue ≥ $150K |

CE Exchange provides quarterly revenue reports within 15 days of each quarter-end. AADB-Sourced Customer = a customer introduced to CE Exchange by AADB in writing before their first purchase.

## 7. Out of Scope (v1.0)

These are architecturally anticipated (the data model supports them) but not built in the initial 24 weeks:

- White-label custom branding per company → v1.1
- Public API for third-party integrations → v1.1
- Native mobile apps (iOS/Android) — attendee form is mobile web only → v2.0
- Multi-language support — English only → v2.0
- State Board Dashboards v2 (renewal forecasting, deficiency heat maps) → Weeks 25–28
- CE Course Recommendations in Track Pro → Weeks 29–32
- National Verify Rollout (15+ boards) → Year 2
- Camera-free audio-only quiz path → v1.1
- 30-day proof dashboard for companies → v1.1

## 8. Top Risks

| Risk | Mitigation |
|------|-----------|
| **Cross-state data leakage in Verify** | Two-layer defense: Prisma query filters + Supabase RLS policies scoped to `state` on `licensees`. Pen-test before any real board goes live. |
| **Puppeteer on Vercel serverless** (affects ACE Week 5, Track Pro Week 13, Audit Week 22) | `@sparticuz/chromium`, Vercel function size 50MB, budget 1–2 extra days per product. |
| **Email deliverability** — certificates landing in spam | SPF + DKIM + DMARC on `dentalace.org` before Week 5. Test against Gmail, Outlook, Yahoo. |
| **Stripe webhook timing** — credits not added after payment | Idempotency keys on every webhook handler. Log event to DB before processing. Stripe CLI for local testing. |
| **Legacy CSV data quality** — missing emails in ~3K ACE records | John/Christy audit spreadsheet before Week 9. Flag records with missing email; clean before import. |
| **50-state CE requirements accuracy** | John provides authoritative per-board requirements file before Week 9. Spot-check TX/CA/FL/NY minimum. Admin tool to update without code deploy. |
| **Board licensee adoption below threshold** | Adoption-rate tracker shipped Week 15. Target 70%+ adoption before a board runs its first audit. Bulk invite tool used aggressively at onboarding. |
| **DNS propagation delay** on launch day | Initiate DNS in Week 7, not Week 8. Allow up to 48 hours. |
| **Claude Code context drift** between phases | Fresh session per phase. Always load `CLAUDE.md`. Add a RULE immediately when a mistake occurs. |
| **Scope creep mid-build** | Lock scope per phase. New features → v1.1 backlog. Mid-phase changes require a new Claude Code session. |

## 9. References & Pointers

- **Source of truth (scope, pricing, schema):** [`logic/aadb-master-sow-v1.1.html`](./logic/aadb-master-sow-v1.1.html)
- **Phase 1 detail:** [`PRD-phase-1-dental-ace.md`](./PRD-phase-1-dental-ace.md)
- **Project memory for Claude Code:** [`CLAUDE.md`](./CLAUDE.md)
- **Prototypes** (reviewed when each product's phase starts):
  - [`logic/dentalace-landing-page.html`](./logic/dentalace-landing-page.html)
  - [`logic/dentalace-landing-page-handoff.md`](./logic/dentalace-landing-page-handoff.md)
  - [`logic/dental-track-demo.html`](./logic/dental-track-demo.html)
  - [`logic/dental-audit-demo.html`](./logic/dental-audit-demo.html)
