# CLAUDE.md — DentalACE One

Project memory for Claude Code. Load this at the start of every session.

---

## Project Identity

- **Suite:** DentalACE One — three products on one codebase for the American Association of Dental Boards.
- **Products:** DentalACE (accreditation), ProTrack (licensee CE dashboard), Verify (state-board random audits).
- **Domain:** `dentalace.org`.
- **Current phase:** Phase 1 — DentalACE (Phase 0 scaffolding complete; Week 2 auth + portals up next).
- **Repo:** `github.com/jaywilburn/dental-ace` (private; transfers to client at launch).
- **Installed versions:** Next.js 16.2.6, React 19.2.4, Tailwind v4, Prisma 6+, @supabase/ssr.
- **See also:** [`AGENTS.md`](./AGENTS.md) — auto-generated reminder that Next 16 has breaking changes from training data; check `node_modules/next/dist/docs/` when conventions feel uncertain.
- **Timeline:** 24-week, 3-phase build. Weeks 1–8 DentalACE → 9–16 ProTrack → 17–24 Verify.
- **Source of truth (scope/pricing/schema):** [`logic/aadb-master-sow-v1.1.html`](./logic/aadb-master-sow-v1.1.html)
- **Suite framing:** [`PRD.md`](./PRD.md)
- **Phase 1 detail:** [`PRD-phase-1-dental-ace.md`](./PRD-phase-1-dental-ace.md)

---

## Stack — Confirmed Deviations from the SOW

The SOW (v1.1, May 2026) is the contract document, but three stack choices were updated when the PRDs were drafted. **These are intentional. Do not "fix" the code back to the SOW.**

| SOW says | We use | Why |
|----------|--------|-----|
| Next.js 14 | **Next.js 16+ (App Router only)** | No `middleware.ts`, no `pages/`. Route protection lives in server-component portal layouts. |
| NextAuth.js v5 | **Supabase Auth** | Native RLS integration; one fewer service. Roles via JWT claims + `users.role`. |
| AWS S3 (two buckets) | **Supabase Storage (two buckets)** | Drops the AWS account. Same two-bucket split: `certificates` + `uploads`. Private; signed URLs only. |

Everything else from the SOW stands: Prisma + Postgres, Stripe + Stripe Connect, Resend, Vercel, Puppeteer + `@sparticuz/chromium`, qrcode, ShadCN + Tailwind themed.

---

## Brand Rules

The SOW pre-dates the brand refresh. **The landing-page handoff (`logic/dentalace-landing-page-handoff.md`) is the brand source of truth.** Internal table/column names, enums, and code identifiers can keep their original short forms (CUSTOMER, REVIEWER, BOARD, etc.) but everything user-facing follows these rules:

- **Suite name: DentalACE One.** Never "AADB Platform Suite" (that was the working title before the brand was set).
- **Product names:**
  - **Dental ACE** (two words, "ACE" always uppercase). Never "DentalAce" or "Dental Ace." The landing-page v3 brand uses the spaced form; only the suite name is one word.
  - **ProTrack** (one word, capital P and T). Never "Dental Track" or "Pro Track."
  - **Verify** (initial capital). Never "Dental Audit."
- **No em dashes (`—`)** in user-facing copy. Use commas, parentheses, or restructure the sentence. Page titles, button labels, marketing copy, in-app strings, email templates: all em-dash-free.
- **Brand mark rendering:** "Dental" in white on dark / navy on light. "ACE" in gold (`--ace` token).
- **Tagline:** "An AADB Program · Powered by CE Exchange."
- **Public email:** `info@dentalace.org`.
- **Product accent colors:** DentalACE = gold (`--ace`), ProTrack = teal (`--pro`), Verify = blue (`--ver`). Use these only when product-color semantics matter (landing page, marketing). Internal app UI defaults to `--ace` for primary accent regardless of product.

---

## Architecture Rules

These rules are how we avoid context drift. If you violate one, the user will tell you to add a new rule below — do it immediately.

### Routing & auth
- **Never create a `middleware.ts` file.** Next 16 doesn't use it. Route protection goes in each portal's `layout.tsx` (e.g. `app/company/layout.tsx`) as a server component that reads the Supabase session and redirects on role mismatch.
- **Public URLs follow the handoff:** `/login` (unified sign-in), `/company` (CUSTOMER), `/reviewer` (REVIEWER), `/admin` (ADMIN), `/attend/[token]` (public attendee), `/protrack` and `/protrack/register` (LICENSEE, Phase 2), `/verify` and `/verify/contact` (BOARD, Phase 3).
- **Never use the Pages Router.** The whole app is App Router under `app/`.
- **Roles** live on `users.role` and are mirrored into JWT custom claims via a Supabase Auth hook or DB trigger. Read from the JWT on the server when possible; fall back to a `users` lookup only when needed.
- **Supabase SSR cookie refresh** happens inside portal layouts (`app/company/layout.tsx`, `app/reviewer/layout.tsx`, `app/admin/layout.tsx`) via `supabase.auth.getUser()`, not in `middleware.ts`. The server client's `setAll` swallows errors inside RSC reads; refresh writes only succeed in server actions and route handlers.

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
- **10 SKUs**, not 14. Catalog is the single source of truth at `lib/billing/catalog.ts`. PRD §6 updated May 2026; do not regenerate the 14-SKU table.
- **Idempotency** — every webhook handler dedupes on `event.id`, persisted as `billing_transactions.stripeEventId` (unique). `INSERT ... ON CONFLICT DO NOTHING` is the idempotency check; the balance increment only runs if the insert succeeded.
- **Mock mode** — when `STRIPE_SECRET_KEY` is absent (or `STRIPE_MOCK_MODE=true`), `lib/billing/checkout-mode.ts` reports mock mode. The Buy pages route to `/dev/stripe-mock-checkout`, which POSTs to `/api/dev/mock-stripe-webhook`. Both routes call into the same `handleCheckoutCompleted` in `lib/billing/webhook-core.ts` that the real `/api/webhooks/stripe` will. When a real Stripe account lands, only env vars + the session-creation function change.
- **Local testing (real mode)** — `stripe listen --forward-to localhost:3000/api/webhooks/stripe`.
- **Stripe Connect** — AADB is the master account, CE Exchange is the connected recipient. Phase 1 split is a fixed 75/25 (CE Exchange / AADB) automated via transfers.

### Events (multi-session Live Event)
- **Event Setup** is reachable from `/company/events` only when at least one approved course has `combinedCert=true` + `submitSessionsSeparately=true` on its `application_data`.
- An event holds N approved courses via `event_sessions`. The event itself has an `attendee_link_token` for the combined certificate.
- **The combined-certificate PDF render is Weeks 5-6 work**, not Weeks 3-4. Weeks 3-4 only persists the event + sessions and reserves the URL.

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
```

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
- **Suite framing:** [`PRD.md`](./PRD.md)
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
