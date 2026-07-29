# CLAUDE.md — DentalACE One

Project memory for Claude Code. Load this at the start of every session.

---

## Project Identity

- **Platform:** DentalACE One — **one platform**, one account per user, on one codebase for the American Association of Dental Boards.
- **Features (not separate products):** DentalACE (accreditation), ProTrack (licensee CE dashboard), Verify (state-board random audits) — gated by per-user entitlements on the `users` row (see Access model below).
- **Domain:** `dentalace.org`.
- **Current phase:** Phase 1 — DentalACE (Phase 0 scaffolding complete; Week 2 auth + portals up next). **Phase 2 (ProTrack) is being pulled forward in parallel at the client's request** — its tables, the `/protrack` area, and the full free+Pro feature now exist ahead of the original Weeks 9–16 slot. The platform now runs on the **unified entitlement access model** (see below), not the original per-role portals.
- **Repo:** `github.com/jaywilburn/dental-ace` (private; transfers to client at launch).
- **Installed versions:** Next.js 16.2.6, React 19.2.4, Tailwind v4, Prisma 6+, @supabase/ssr.
- **See also:** [`AGENTS.md`](./AGENTS.md) — auto-generated reminder that Next 16 has breaking changes from training data; check `node_modules/next/dist/docs/` when conventions feel uncertain.
- **Timeline:** 24-week, 3-phase build. Weeks 1–8 DentalACE → 9–16 ProTrack → 17–24 Verify.
- **Source of truth (scope/pricing/schema):** [`logic/aadb-master-sow-v1.1.html`](./logic/aadb-master-sow-v1.1.html)
- **Platform framing:** [`PRD.md`](./PRD.md)
- **Phase 1 detail:** [`PRD-phase-1-dental-ace.md`](./PRD-phase-1-dental-ace.md)

---

## Stack — Confirmed Deviations from the SOW

The SOW (v1.1, May 2026) is the contract document, but three stack choices were updated when the PRDs were drafted. **These are intentional. Do not "fix" the code back to the SOW.**

| SOW says | We use | Why |
|----------|--------|-----|
| Next.js 14 | **Next.js 16+ (App Router only)** | No `middleware.ts`, no `pages/`. Route protection lives in server-component portal layouts. |
| NextAuth.js v5 | **Supabase Auth** | Native RLS integration; one fewer service. Access via per-feature entitlement columns on `users` (mirrored to JWT claims), not a single role. |
| AWS S3 (two buckets) | **Supabase Storage (two buckets)** | Drops the AWS account. Same two-bucket split: `certificates` + `uploads`. Private; signed URLs only. |

Everything else from the SOW stands: Prisma + Postgres, Stripe + Stripe Connect, Resend, Vercel, Puppeteer + `@sparticuz/chromium`, qrcode, ShadCN + Tailwind themed.

---

## Brand Rules

The SOW pre-dates the brand refresh. **The landing-page handoff (`logic/dentalace-landing-page-handoff.md`) is the brand source of truth.** Internal table/column names, enums, and code identifiers can keep their original short forms (CUSTOMER, REVIEWER, BOARD, etc.) but everything user-facing follows these rules:

- **Platform vs feature naming (important):** the **full platform is `DentalACE One`** and the **accreditation feature is `DentalACE`** (one word, no "One"). Use `DentalACE One` everywhere the whole platform/suite is meant (logo/top-left brand mark, page-title suffix, "the complete platform" copy); use `DentalACE` when referring specifically to the accreditation product alongside ProTrack and Verify. Never "AADB Platform Suite" (the old working title).
- **Product names:**
  - **DentalACE** (one word, "ACE" always uppercase and gold). Never "Dental ACE" (spaced), "DentalAce", or "Dental Ace." (Superseded the earlier spaced "Dental ACE" form on 2026-06-02 at the client's request.) The platform adds the suffix: **DentalACE One**.
  - **ProTrack** (one word, capital P and T). Never "Dental Track" or "Pro Track."
  - **Verify** (initial capital). Never "Dental Audit."
- **No em dashes (`—`)** in user-facing copy. Use commas, parentheses, or restructure the sentence. Page titles, button labels, marketing copy, in-app strings, email templates: all em-dash-free.
- **Brand mark rendering:** "Dental" in white on dark / navy on light. "ACE" in gold (`--ace` token).
- **Operator framing (client feedback, 2026-06-09):** DentalACE One is **operated by the American Association of Dental Boards (AADB)**. Never "Powered by CE Exchange" and never "Dental Exchange, Inc. d/b/a CE Exchange" in user-facing copy, including the footer copyright and Privacy Policy §1. (Superseded the earlier "An AADB Program · Powered by CE Exchange" tagline.)
- **No "Free Forever"** anywhere in user-facing copy. ProTrack has a Free plan and a paid Pro plan ($7/mo or $67/yr, `lib/billing/pro-plans.ts`); call the free tier "Free".
- **VerifyIQ** (one word, capital V + IQ) is the compliance-intelligence layer of DentalACE One, built for **DSOs / dental groups only** (team-wide CE visibility). It is **not** a state-board product (Verify is the separate board-facing product), so keep all VerifyIQ copy free of state-board / population-analytics / licensee framing. (Superseded the earlier "both audiences" positioning on 2026-07-01 at the client's request.) Priced $499/mo or $5,000/yr. As of July 2026 it is pre-launch (no product build): the home teaser (`components/landing/verifyiq-section.tsx`), the dedicated page (`app/(marketing)/verifyiq/page.tsx`), the `/verifyiq/contact` waitlist, and the pricing card are marketing-only, driving to the early-access list. Accent is blue (`--ver`) on the dedicated page.
- **No emojis** in marketing/landing copy (client feedback, 2026-06-09). Status glyphs (✓ ⚠ ✗ arrows) in app UI are fine.
- **Public email:** `info@dentalace.org`.
- **Product accent colors:** DentalACE = gold (`--ace`), ProTrack = teal (`--pro`), Verify = blue (`--ver`). Use these only when product-color semantics matter (landing page, marketing). Internal app UI defaults to `--ace` for primary accent regardless of product.

---

## Architecture Rules

These rules are how we avoid context drift. If you violate one, the user will tell you to add a new rule below — do it immediately.

### Routing & auth
- **Never create a `middleware.ts` file.** Next 16 doesn't use it. Route protection goes in each feature area's `layout.tsx` (e.g. `app/company/layout.tsx`) as a server component that reads the session and redirects when the required entitlement is missing.
- **Public URLs:** `/login` (unified sign-in), `/signup` (public sign-up → account + ProTrack Free), `/signup/board` (Verify self-register for state boards), `/home` (post-login hub), `/company` (DentalACE), `/reviewer` (staff), `/admin` (staff), `/attend/[token]` (public attendee), `/protrack` (ProTrack), `/board` (Verify portal — board users), `/verify` and `/verify/contact` (public cert lookup + sales lead).
- **Never use the Pages Router.** The whole app is App Router under `app/`.
- **Supabase SSR cookie refresh** happens inside feature-area layouts via `supabase.auth.getUser()`, not in `middleware.ts`. The server client's `setAll` swallows errors inside RSC reads; refresh writes only succeed in server actions and route handlers.

### Access model (implemented)
DentalACE One is **one platform**; features are gated by **per-user entitlements on the `users` row**, not by a single role. The session cookie carries only `{ userId }`; `getCurrentUser()` (`lib/auth/session.ts`) loads the entitlements:

| Column | Values | Grants |
|--------|--------|--------|
| `staff_role` | `NONE`/`REVIEWER`/`ADMIN` | `/reviewer`, `/admin` (admin-provisioned; ADMIN is a superset) |
| `company_id` | FK → companies | DentalACE (`/company`); the company holds prepaid credits/billing |
| `protrack_tier` | `FREE`/`PRO` | ProTrack (`/protrack`); every account is `FREE`, `PRO` is the upgrade |
| `verify_access` | boolean | Verify (`/board` portal); self-registered at `/signup/board` — first claim for a state requires a `.gov` email, subsequent admins for an already-claimed state must be granted access manually (admin invite UI is a follow-up; today via direct DB grant or `pnpm seed:verify`) |

- **Guards** (`lib/auth/session.ts`): `requireUser()` (any account → ProTrack floor), `requireDentalAce()` (`company_id`), `requireStaff("REVIEWER"|"ADMIN")`, `requireVerify()`; ProTrack Pro pages use `requireProtrackPro()` (`lib/protrack/require-pro.ts`). A missing entitlement redirects to `/home`, never `/403`.
- **One public sign-up** (`/signup` → `/api/auth/register`) creates an account + ProTrack Free (license fields optional). Login lands on the **`/home` hub**, which shows the account's available features. ATTENDEE stays a public token flow (no account).
- **Email verification is required.** Sign-up creates the account **unverified** (no Supabase email confirm, `users.email_verified_at` null) and mints **no session** — it emails a 24h HMAC-signed link (`lib/auth/verification-token.ts`, `emails/verify-email.tsx`). `/api/auth/verify-email?token=` marks it verified, mirrors `email_confirm` to Supabase, runs the now-safe ACE certificate backfill (`syncIssuedCertsForLicensee`), then redirects to `/login` — it does **not** mint a session (auto-sign-in from a GET link is a login-CSRF / session-fixation vector). The user signs in normally. An unverified account can never harvest CE history by email (see the SECURITY note in `lib/protrack/ace-sync.ts`). `/api/auth/signin` blocks unverified accounts; `/api/auth/resend-verification` re-sends.
- **Outbound email links use `appBaseUrl()` (`lib/app-url.ts`), pinned to `NEXT_PUBLIC_APP_URL`, never the request `Host`** — prevents host-header injection from pointing verification links at an attacker domain. In dev the link is logged as `[verify-email:DEV_LINK]`.
- **There is no `Role` enum and no `licensees` table.** ProTrack profile (`first_name`/`last_name`/`protrack_tier`/`pro_expires_at`/`reminder_settings`) lives on `users`; ProTrack child tables (`user_licenses`, `ce_certificates`, `pro_subscriptions`) keep a `licensee_id` column that FKs to `users.id`.
- **RLS:** `current_user_role()` (`sql-migrations/0008`) derives `'ADMIN'`/`'REVIEWER'`/`'CUSTOMER'` from `staff_role` + company presence, so the Phase-1 + ProTrack policies keep working unchanged. The access-token hook emits `staff_role`/`company_id`/`protrack_tier`/`verify_access` into the JWT.

### Database
- **Prisma** for application reads/writes.
- **Supabase RLS policies** are the access-control *floor* — even if a route handler is wrong, RLS must enforce company-data isolation.
- **Money in cents** — integer columns, never floats.
- **All credit/balance decrements** run inside a transaction with a row-level lock on the relevant `companies` row.
- Phase 2/3 tables don't exist yet. Don't reference them in Phase 1 code. Don't create them ahead of schedule.

### File storage
- **Supabase Storage** with two private buckets: `certificates` and `uploads`.
- **Never expose the service-role key client-side.** Client uploads use server-issued signed-upload URLs. Reads use short-lived signed download URLs.

### Stripe
- **Catalog is the single source of truth at `lib/billing/catalog.ts`** (June 2026 client pricing sheet; supersedes the earlier 10-SKU table and the SOW's 14-SKU table). Course applications are **volume-tiered by quantity** via the `app_course` SKU (`APP_COURSE_TIERS`: $99 / $95 / $90 / $85 per course); the webhook multiplies the per-unit grant by the clamped quantity and always recomputes the amount server-side. Expedited stays the fixed `app_1_exp` SKU. 7 cert bundles (50–1,500). ProTrack Pro plans live separately in `lib/billing/pro-plans.ts` ($7/mo, $67/yr).
- **Idempotency** — every webhook handler dedupes on `event.id`, persisted as `billing_transactions.stripeEventId` (unique). `INSERT ... ON CONFLICT DO NOTHING` is the idempotency check; the balance increment only runs if the insert succeeded.
- **Mock mode** — when `STRIPE_SECRET_KEY` is absent (or `STRIPE_MOCK_MODE=true`), `lib/billing/checkout-mode.ts` reports mock mode. The Buy pages route to `/dev/stripe-mock-checkout`, which POSTs to `/api/dev/mock-stripe-webhook`. Both routes call into the same `handleCheckoutCompleted` in `lib/billing/webhook-core.ts` that the real `/api/webhooks/stripe` will. When a real Stripe account lands, only env vars + the session-creation function change.
- **Local testing (real mode)** — `stripe listen --forward-to localhost:3000/api/webhooks/stripe`.
- **Live webhook destination must be `https://www.dentalace.org/api/webhooks/stripe`** (the canonical serving domain). The apex `dentalace.org` 308-redirects to `www`, and Stripe never follows redirects, so an apex-pointed endpoint fails every delivery while checkout still succeeds (shipped broken 2026-06-30, caught 2026-07-13). When changing the endpoint, **update the URL in place** — deleting/recreating rotates the signing secret and invalidates `STRIPE_WEBHOOK_SECRET` on Vercel.
- **Stripe Connect** — AADB is the master account, CE Exchange is the connected recipient. Phase 1 split is a fixed 75/25 (CE Exchange / AADB) automated via transfers.

### Events (multi-session Live Event)
- **Created at `/company/events/new`** (no eligibility gate; the events list always offers "+ New Event"). Two qualifier answers — coverage (`FULL`/`SELECTIVE`) + reuse (`EVENT_ONLY`/`PER_COURSE`) — derive one of four `EventType`s via `deriveEventType` (`lib/forms/event/schemas.ts`):
  - `FULL_EVENT_QUIZ` (Opt 1): full attendance, event-level accreditation. Each session is a full course application captured inline (`sessions/[sessionAppId]/…` sub-wizard = real `CourseApplication` rows), plus a 5-question event quiz.
  - `FULL_PER_COURSE` (Opt 2): full attendance; attaches existing approved courses to the event.
  - `SELECTIVE_INLINE` (Opt 3): selective attendance, event-level accreditation. Each session is a full course application stored **inline** in `event_sessions.course_info` (JSONB) via the per-session mini-wizard (`inline-sessions/[sessionId]/{course,creator,presenters,question}`), plus one MC question in `event_sessions.question`. **No `CourseApplication` rows.** (Before July 2026 this collected an event-level application once; that was replaced by per-session full applications at the client's request. `eventData.eventApplication` + `eventStep1Schema`/`EVENT_OUTLINE_MAX` remain read-only for the two legacy approved events.)
  - `SELECTIVE_PER_COURSE` (Opt 4): selective attendance; attaches existing approved courses.
- **Billing:** event-only types (`FULL_EVENT_QUIZ`, `SELECTIVE_INLINE`) charge **one application credit per event** at submit (company-row lock), regardless of session count, via `eventCreditCost()` in `lib/forms/event/schemas.ts`; per-course types are free (their courses were already paid). `eventCreditCost` is the single source of truth, read by both `submitEvent` and the review page's quote. (Between 2026-06-30 and 2026-07-29 submit charged one credit *per session* while the qualifier screen promised "accredited as a single application"; an 8-session event was billed 8 credits for one Event ID. Never reintroduce per-session event billing.)
- **Model detection keys on data shape, not the enum:** pending `CourseApplication` session rows present ⇒ full-course; absent on a `SELECTIVE_INLINE` event ⇒ lightweight inline. `approveEvent`, the attendee flow, and both detail pages branch on this, so **never create `CourseApplication` rows for `SELECTIVE_INLINE`** (a stale row would misclassify the event).
- An event holds its sessions via `event_sessions` and carries an `attendee_link_token` for the combined certificate at `/attend/event/[token]`. The combined-certificate PDF renderer lives at `lib/pdf/event-certificate.ts`; the public attendee form only ever exposes each session's step1 slice (objectives/outline/format), never creator/presenter data or answers.

### UI
- **ShadCN + Tailwind, always heavily customized.** Default ShadCN look is never shipped. Theme matches the navy/gold AADB brand from the prototypes.
- Mobile-first for any page an attendee will see (the public attendee form at `/attend/[token]` is the most critical).
- **Tailwind v4** — design tokens live in `app/globals.css` inside `@theme inline { … }`. ShadCN-compatible aliases (`--color-primary`, etc.) are already set, so any `npx shadcn add <component>` works without overwriting the AADB theme. **Don't run `shadcn init`** — it would clobber globals.css. Just `shadcn add` individual components when needed.
- The `cn()` helper lives at `lib/utils.ts` (clsx + tailwind-merge).

### Code quality
- **TypeScript strict mode.** `npx tsc --noEmit` must be clean before any commit.
- **Zod validation** on every API route boundary and every server action that accepts client input.
- **Error boundaries + loading skeletons** for every server-component tree the user sees.
- **Rate limiting** on the attendee form, login, and application submission.

### Email
- Sending domain is `dentalace.org`. SPF + DKIM + DMARC must be live before Week 5 (when certificate emails start firing).
- All emails sent server-side via Resend; from address `noreply@dentalace.org`.
- React Email templates in `emails/`.

---

## Commands

**Package manager: pnpm** (pinned via `packageManager` in `package.json`). Don't `npm install` — the `package-lock.json` is intentionally absent and only `pnpm-lock.yaml` is committed.

```bash
# Dev
pnpm dev                                                             # localhost:3000 (Turbopack)
pnpm build                                                           # production build (must be clean before deploys)
pnpm typecheck                                                       # tsc --noEmit (must be clean before commits)
pnpm lint                                                            # eslint

# Prisma
pnpm exec prisma migrate dev --name <name>                           # add + apply a migration in dev
pnpm exec prisma migrate deploy                                      # apply migrations in CI/prod
pnpm exec prisma studio                                              # browse the DB locally
pnpm exec prisma generate                                            # regenerate the client after schema changes

# Raw-SQL RLS migrations
# Apply files under sql-migrations/ via the Supabase MCP apply_migration tool.
# These are NOT in prisma/migrations because Prisma doesn't manage RLS.

# Stripe (local webhook forwarding)
stripe listen --forward-to localhost:3000/api/webhooks/stripe

# Seed dev users (idempotent)
pnpm seed
```

---

## Dev Test Credentials

Seeded by `pnpm seed` against the live Supabase project. Every account signs in at `/login` and lands on the `/home` hub. **Dev-only. Rotate the admin password before any client demo and before transferring the repo.**

| Account | Email | Password | Entitlement |
|---------|-------|----------|-------------|
| Admin | `jay@wilburncreative.com` | `ChangeMeNow!2026` | `staff_role = ADMIN` (all areas) |
| Admin | `john@dentalace.org` | `test1234` | `staff_role = ADMIN` (all areas) |
| Reviewer | `reviewer@dentalace.org` | `test1234` | `staff_role = REVIEWER` |
| DentalACE | `customer@dentalace.org` | `test1234` | `company_id` → Texas Dental Association |
| ProTrack | `sarah.mitchell@example.com` | `test1234` | `protrack_tier = FREE` |
| Verify | `board@dentalace.org` | `test1234` | `verify_access = true`, `board_id` → Texas |

The DentalACE seed is linked to **Texas Dental Association** (the test company), whose balance the mock-Stripe flow grants and whose applications populate the reviewer queue.

The ProTrack seed (Sarah Mitchell, RDH, TX, license TX-RDH-91043) ships with six CE certificates on a Free plan, tracked against the provisional Texas RDH requirements. Provisional state requirements (TX/CA/FL) are seeded by `pnpm seed`; replace them with John's authoritative 50-state file when it lands.

The Verify seed is created by `pnpm seed:verify` (separate from `pnpm seed`). It upserts the Texas Board row + the board admin user, then creates ~100 in-state licensees with mixed CE compliance for the audit demo. Set `VERIFY_SEED_COUNT=500` in env to ship the larger sample.

If the admin password is rotated in Supabase Auth, update this table.

---

## Working Style

- **Fresh Claude Code session at every phase boundary.** Don't carry Phase 1 context into Phase 2.
- **Always load this file at the start of a session.**
- **When Claude Code makes a mistake**, add a RULE in the "Architecture Rules" section above. Don't just fix the code — fix the floor.
- **No premature work:**
  - Don't create Phase 2 or Phase 3 tables in Phase 1.
  - Don't seed the 50-state CE requirements until John provides the authoritative requirements file (Phase 2).
  - Don't import the legacy ~3K ACE-attendee records until the cleaned CSV is delivered (Phase 2).
  - Don't convert the ProTrack or Verify HTML prototypes until their phases start.
- **Scope creep goes to v1.1**, not into the current phase.

---

## File Layout

```
/                                       # project root
├── app/                                # Next.js App Router
│   ├── login/page.tsx                  # ← Week 2 — unified sign-in for all roles
│   ├── company/...                     # CUSTOMER portal (← Week 2)
│   ├── reviewer/...                    # REVIEWER portal (← Week 2)
│   ├── admin/...                       # ADMIN portal (← Week 2)
│   ├── attend/[token]/page.tsx         # public attendee form (← Weeks 5-6)
│   ├── api/
│   │   ├── webhooks/stripe/route.ts    # ← Weeks 3-4
│   │   └── ...
│   ├── globals.css                     # ✅ AADB theme tokens + ShadCN aliases
│   ├── layout.tsx                      # ✅ Cormorant + DM Sans + JetBrains Mono
│   └── page.tsx                        # 🟡 Phase 0 brand-verification page (temp)
├── components/                         # ← added when first ShadCN component lands
├── emails/                             # React Email templates (← Weeks 5-6)
├── lib/
│   ├── supabase/
│   │   ├── server.ts                   # ✅ SSR client (server components, actions, routes)
│   │   ├── client.ts                   # ✅ Browser client
│   │   └── service-role.ts             # ✅ Server-only; bypasses RLS
│   ├── prisma.ts                       # ← add when first DB call is needed
│   ├── stripe.ts                       # ← Weeks 3-4
│   ├── resend.ts                       # ← Weeks 5-6
│   └── utils.ts                        # ✅ cn() helper (clsx + tailwind-merge)
├── prisma/
│   ├── schema.prisma                   # ✅ 6 Phase 1 tables
│   └── migrations/                     # ← created on first `prisma migrate dev`
├── sql-migrations/                     # raw-SQL migrations (RLS, triggers)
│   └── 0002_phase1_rls_policies.sql    # ✅ Phase 1 RLS policies (apply via MCP)
├── logic/                              # SOW + prototypes (gitignored — local reference only)
├── .mcp.json                           # ✅ project-scoped Supabase MCP
├── .env.example                        # ✅ committed env contract
├── .env.local                          # gitignored, populated locally
├── AGENTS.md                           # Next 16 "this isn't the Next you know" notice (from scaffold)
├── PRD.md                              # ✅ suite-level PRD
├── PRD-phase-1-dental-ace.md           # ✅ Phase 1 detail
└── CLAUDE.md                           # ✅ this file
```

---

## Key Pointers

- **Single source of truth (scope, schema, pricing):** [`logic/aadb-master-sow-v1.1.html`](./logic/aadb-master-sow-v1.1.html) — 794 lines of contract-spec. (Gitignored; only present on the dev machine.)
- **Platform framing:** [`PRD.md`](./PRD.md)
- **Phase 1 detail:** [`PRD-phase-1-dental-ace.md`](./PRD-phase-1-dental-ace.md)
- **Next 16 scaffold notes:** [`AGENTS.md`](./AGENTS.md)
- **Prototypes** (open only when their product's phase starts; gitignored, local only):
  - ACE landing page: `logic/dentalace-landing-page.html`
  - ACE landing handoff: `logic/dentalace-landing-page-handoff.md`
  - Track demo: `logic/dental-track-demo.html`
  - Audit demo: `logic/dental-audit-demo.html`

---

## GitHub

- Repo: **`github.com/jaywilburn/dental-ace`** (private).
- Branch protection on `main`: PR required before merge (enable once a collaborator is added).
- Will transfer to the client's GitHub at launch.
