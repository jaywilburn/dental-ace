# CLAUDE.md — AADB Platform Suite

Project memory for Claude Code. Load this at the start of every session.

---

## Project Identity

- **Suite:** AADB Platform Suite — three products on one codebase for the American Association of Dental Boards.
- **Products:** Dental ACE (accreditation), Dental Track (licensee CE dashboard), Dental Audit (state-board random audits).
- **Domain:** `dentalace.org`.
- **Current phase:** Phase 1 — Dental ACE (pre-build).
- **Timeline:** 24-week, 3-phase build. Weeks 1–8 ACE → 9–16 Track → 17–24 Audit.
- **Source of truth (scope/pricing/schema):** [`logic/aadb-master-sow-v1.1.html`](./logic/aadb-master-sow-v1.1.html)
- **Suite framing:** [`PRD.md`](./PRD.md)
- **Phase 1 detail:** [`PRD-phase-1-dental-ace.md`](./PRD-phase-1-dental-ace.md)

---

## Stack — Confirmed Deviations from the SOW

The SOW (v1.1, May 2026) is the contract document, but three stack choices were updated when the PRDs were drafted. **These are intentional. Do not "fix" the code back to the SOW.**

| SOW says | We use | Why |
|----------|--------|-----|
| Next.js 14 | **Next.js 16+ (App Router only)** | No `middleware.ts`, no `pages/`. Route protection lives in route-group server-component layouts. |
| NextAuth.js v5 | **Supabase Auth** | Native RLS integration; one fewer service. Roles via JWT claims + `users.role`. |
| AWS S3 (two buckets) | **Supabase Storage (two buckets)** | Drops the AWS account. Same two-bucket split: `certificates` + `uploads`. Private; signed URLs only. |

Everything else from the SOW stands: Prisma + Postgres, Stripe + Stripe Connect, Resend, Vercel, Puppeteer + `@sparticuz/chromium`, qrcode, ShadCN + Tailwind themed.

---

## Architecture Rules

These rules are how we avoid context drift. If you violate one, the user will tell you to add a new rule below — do it immediately.

### Routing & auth
- **Never create a `middleware.ts` file.** Next 16 doesn't use it. Route protection goes in `app/(routeGroup)/layout.tsx` as a server component that reads the Supabase session and redirects on role mismatch.
- **Never use the Pages Router.** The whole app is App Router under `app/`.
- **Roles** live on `users.role` and are mirrored into JWT custom claims via a Supabase Auth hook or DB trigger. Read from the JWT on the server when possible; fall back to a `users` lookup only when needed.

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
- **Idempotency** — every webhook handler dedupes on `event.id`, persisted as `billing_transactions.stripeEventId` (unique).
- **Log the event to the DB *before* processing.** Replay must be safe.
- **Local testing** — `stripe listen --forward-to localhost:3000/api/webhooks/stripe`.
- **Stripe Connect** — AADB is the master account, CE Exchange is the connected recipient. Phase 1 split is a fixed 75/25 (CE Exchange / AADB) automated via transfers.

### UI
- **ShadCN + Tailwind, always heavily customized.** Default ShadCN look is never shipped. Theme matches the navy/gold AADB brand from the prototypes.
- Mobile-first for any page an attendee will see (the public attendee form at `/attend/[token]` is the most critical).

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

These will be fleshed out once the Next.js app is scaffolded (Week 1). For now, the conceptual list:

```bash
# Dev
npm run dev

# Prisma
npx prisma migrate dev --name <name>
npx prisma db push        # dev only — never on prod
npx prisma studio

# Stripe (local webhook forwarding)
stripe listen --forward-to localhost:3000/api/webhooks/stripe

# Typecheck (must be clean before commits)
npx tsc --noEmit

# Production build (must be clean before deploys)
npm run build
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
  - Don't convert the Track or Audit HTML prototypes until their phases start.
- **Scope creep goes to v1.1**, not into the current phase.

---

## File Layout (Anticipated)

```
/                                  # project root
├── app/                            # Next.js App Router
│   ├── (auth)/login/page.tsx
│   ├── (customer)/...              # CUSTOMER portal
│   ├── (reviewer)/...              # REVIEWER portal
│   ├── (admin)/...                 # ADMIN portal
│   ├── attend/[token]/page.tsx     # public attendee form
│   ├── api/
│   │   ├── webhooks/stripe/route.ts
│   │   └── ...
│   └── layout.tsx
├── components/                     # ShadCN + custom UI
├── emails/                         # React Email templates
├── lib/
│   ├── prisma.ts
│   ├── supabase/                   # auth + storage clients
│   ├── stripe.ts
│   └── resend.ts
├── prisma/
│   └── schema.prisma
├── logic/                          # SOW + prototypes (read-only reference)
├── PRD.md                          # suite-level PRD
├── PRD-phase-1-dental-ace.md       # Phase 1 detail
└── CLAUDE.md                       # this file
```

---

## Key Pointers

- **Single source of truth (scope, schema, pricing):** [`logic/aadb-master-sow-v1.1.html`](./logic/aadb-master-sow-v1.1.html) — 794 lines of contract-spec.
- **Suite framing:** [`PRD.md`](./PRD.md)
- **Phase 1 detail:** [`PRD-phase-1-dental-ace.md`](./PRD-phase-1-dental-ace.md)
- **Prototypes** (open these only when their product's phase starts):
  - ACE landing page: [`logic/dentalace-landing-page.html`](./logic/dentalace-landing-page.html)
  - ACE landing handoff: [`logic/dentalace-landing-page-handoff.md`](./logic/dentalace-landing-page-handoff.md)
  - Track demo: [`logic/dental-track-demo.html`](./logic/dental-track-demo.html)
  - Audit demo: [`logic/dental-audit-demo.html`](./logic/dental-audit-demo.html)

---

## GitHub

- Repo lives under **`YourUsername`** (user's global instruction).
- Private repo.
- Branch protection on `main`: PR required before merge.
- John Stamper + Christy Stamper invited as collaborators (when accounts exist).
