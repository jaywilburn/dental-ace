# AADB Platform Suite

Three-product suite for the American Association of Dental Boards. Production domain: [dentalace.org](https://dentalace.org).

- **Dental ACE** — CE course accreditation, certificate issuance, state board compliance reporting. Replaces WordPress + Typeform + Zapier + Sheets + Anvil.
- **Dental Track** — Personal CE dashboard for dentists, hygienists, dental assistants. All 50 states.
- **Dental Audit** — Random-sample CE compliance audit tool for state dental boards.

**Current phase:** Phase 1 — Dental ACE (Weeks 1–8). See [`PRD-phase-1-dental-ace.md`](./PRD-phase-1-dental-ace.md).

## Documentation

- [`PRD.md`](./PRD.md) — Suite-level PRD (vision, stack, roadmap, revenue model).
- [`PRD-phase-1-dental-ace.md`](./PRD-phase-1-dental-ace.md) — Phase 1 detailed PRD.
- [`CLAUDE.md`](./CLAUDE.md) — Project memory for Claude Code. **Load at the start of every session.**
- [`logic/aadb-master-sow-v1.1.html`](./logic/aadb-master-sow-v1.1.html) — Master SOW (contract source of truth).
- [`logic/`](./logic/) — Production HTML/CSS prototypes for each product.

## Tech Stack

- **Next.js 16+** (App Router only — no `middleware.ts`, no `pages/`)
- **Supabase** — Postgres, Auth, Storage
- **Prisma** ORM
- **Stripe** + Stripe Connect
- **Resend** + React Email
- **Vercel** (hosting + cron)
- **Puppeteer** + `@sparticuz/chromium` (certificate PDFs)
- **Tailwind** + **ShadCN** (heavily customized — navy/gold AADB brand)

See [`CLAUDE.md`](./CLAUDE.md) for the full set of architectural rules.

## Local Development

### Prerequisites

- Node.js 20+ (`nvm use 20` if you have nvm)
- `npm` (or your package manager of choice)
- A Supabase Personal Access Token, exported in your shell as `SUPABASE_ACCESS_TOKEN` — required for the Supabase MCP server in `.mcp.json`. Add to `~/.zshrc`:
  ```bash
  echo 'export SUPABASE_ACCESS_TOKEN=sbp_xxx' >> ~/.zshrc && source ~/.zshrc
  ```
  Get a token at [Supabase Account Tokens](https://supabase.com/dashboard/account/tokens).
- GitHub CLI (`gh`) — for creating PRs from the terminal.

### Setup

```bash
git clone git@github.com:YourUsername/dental-ace.git
cd dental-ace
npm install
cp .env.example .env.local   # fill in real values
npm run dev
```

### Common commands

```bash
npm run dev                                        # local dev server on :3000
npm run build                                      # production build (must pass before deploy)
npx tsc --noEmit                                   # typecheck (must pass before commit)
npx prisma migrate dev --name <name>               # add a Prisma migration
npx prisma studio                                  # browse the DB locally
stripe listen --forward-to localhost:3000/api/webhooks/stripe   # forward Stripe webhooks
```

## License

Confidential — Internal Use Only.
