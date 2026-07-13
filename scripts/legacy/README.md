# Legacy CE data migration + account provisioning

The end-to-end effort to bring the client's legacy CE records (from their old
Google Sheet / Typeform tracking) into DentalACE One, in two parts:

1. **Data migration** — load the historical companies, courses, and certificates.
2. **Account provisioning + activation** — create a ProTrack account per attendee,
   backfill their CE history, and email each one a link to set a password.

Both are one-time, idempotent `tsx` scripts. Helpers live in `scripts/legacy/`
(`parse-source.ts`, `normalize.ts`, `name-split.ts`); the reviewable data artifacts
live in `scripts/data/legacy/`.

---

## Part 1 — Data migration

Loads **39 CE-provider companies, 106 accredited courses, 4,637 issued
certificates** (4,677 source rows minus 40 test/internal). The delivered
`dentalace_migration_v3.sql` targets a simplified/assumed schema (integer PKs, a
flat `certificates` table) that does **not** match our real schema, so it is never
run: it's treated as a dataset, parsed + cleaned + mapped onto the real schema, and
loaded by `scripts/migrate-legacy.ts`.

### Data artifacts (`scripts/data/legacy/`)

| File | What it is |
|---|---|
| `companies.json` | 39 companies (`legacyId`, `name`, `totalCertsIssued`). |
| `courses.json` | 106 courses (application + accredited-course fields, `ACE-LEG-#####` id). |
| `certificates.json` | 4,637 issued certs, normalized + FK-linked by legacy id. |
| `migration-report.txt` | Counts, every excluded row + reason, dropped states, unmapped occupation/type/format, nulled dates. |

These committed JSON files are the reviewable artifact; regenerate them from the
source SQL with `--extract`.

### Idempotency keys

`issued_certificates` had no unique business key, so the migration adds three
nullable, unique columns (migration `20260703120000_add_legacy_migration_keys`):
`companies.legacy_id`, `accredited_courses.legacy_id`, and
`issued_certificates.legacy_cert_number` (the legacy `cert_number`, e.g.
`LEGACY-DA255-00001`; 0 blank / 0 duplicate). Re-running the load upserts on these.

### Run

```bash
pnpm exec prisma migrate deploy      # apply the legacy-key + activation-marker migrations
pnpm migrate:legacy --extract        # re-parse source SQL -> JSON (only if source changes)
pnpm migrate:legacy --dry-run        # reads only; reports insert/update counts
pnpm migrate:legacy                  # idempotent load; re-run = updates only, 0 inserts
```
Data load only: it does not touch `cert_balance` (raw inserts skip the issue
transaction), loads historical courses already-expired (attend links inactive), and
sets no accounts. Certs carry the real `attendee_email` + `passed = true`, so Part 2
(and the email-proven claim/sync in `lib/protrack/ace-sync.ts`) can surface them.

### Cleaning applied
- **Excluded (40):** client-flagged test rows + internal `@ceexchange.io` /
  `@johnstampermedia.com` operator addresses (each logged in `migration-report.txt`).
- **Dates:** completion dates outside 2015-2026 / impossible are nulled (195 rows);
  the cert still imports and falls back to its issued date.
- **States:** full names -> 2-char US/CA codes; non-US (Jamaica, etc.) and `N/A`
  dropped from `license_states` and logged.
- **Occupation / subject / format:** mapped to the on-cert license type, course
  type, and delivery method; unmappable values stored as null and logged.

### Reversing the load
```sql
DELETE FROM issued_certificates WHERE legacy_cert_number IS NOT NULL;
DELETE FROM accredited_courses  WHERE legacy_id IS NOT NULL;
DELETE FROM course_applications WHERE application_data->>'source' = 'legacy-migration-v3';
DELETE FROM companies           WHERE legacy_id IS NOT NULL;
```

---

## Part 2 — Account provisioning + activation

Turns the migrated attendee emails into real ProTrack accounts.

| Command | What it does |
|---|---|
| `pnpm provision:legacy` | One account per distinct migrated attendee email: a Supabase auth user (`email_confirm`, random password) + a `users` row (`protrackTier=FREE`, `emailVerifiedAt=now`, `legacyProvisionedAt=now`) + a CE backfill (every passing `IssuedCertificate` for that email becomes an AUTO-verified `CeCertificate`). |
| `pnpm invite:legacy` | Emails each provisioned, not-yet-invited account a 30-day set-password link (records-first copy, `emails/legacy-activation.tsx`). |

Both build their own Prisma/Supabase/Resend clients (the app's `send.ts` /
`ace-sync.ts` are `server-only` and can't be imported by a `tsx` script), and both
are idempotent/resumable.

### Provisioning flags
`--dry-run` (counts, no writes) · `--limit=N` (staged) · `--sleep-ms=N` (throttle
between auth creates, default 60).

### How accounts are created
- **Pre-verified but password-locked** (a random password the user never sees), so
  inert until the emailed set-password link is used.
- Backfill matches on the **authoritative migrated `attendeeEmail` only** (mirrors
  `lib/protrack/ace-sync.ts`), deduped on the unique `ce_certificates.issued_certificate_id`.
- `firstName`/`lastName` come from the most recent cert's name (first token / rest,
  `scripts/legacy/name-split.ts`).
- No `UserLicense` (the legacy certs carry no license number): CE history is visible,
  the compliance dashboard appears once the user adds a license.
- `User.legacyProvisionedAt` marks the cohort; `User.activationEmailSentAt` tracks the
  send. Migration `20260703180000_user_activation_markers`.

### What has been run (production)

Provisioning ran on 2026-07-03: **3,159 created, 3 reused, 0 failed, 4,637 CE certs
backfilled** (100% of migrated certs). Invite cohort: **3,161** accounts, all verified,
none signed in. Re-running is a no-op. **The activation emails have NOT been sent yet.**

---

## Ready to send (the activation email)

Run when it's time to invite people. Send from an environment where:

- **`EMAIL_TEST_BCC` is UNSET.** It is applied inside the app's mailer on every send,
  so leaving it set would BCC the client on all ~3,161 emails. `invite:legacy`
  **hard-refuses to run** if it is set (override only with `--force`).
- **`RESEND_API_KEY`** is set (and `RESEND_FROM_EMAIL`, default
  `noreply@dentalace.org`), and **`NEXT_PUBLIC_APP_URL`** points at production so the
  set-password links are correct.

Recommended staged sequence (so a bad address never hurts domain reputation):

```bash
pnpm invite:legacy --dry-run        # renders + logs each recipient, sends nothing
pnpm invite:legacy --limit=25       # small real batch; watch Resend for bounces
pnpm invite:legacy                  # full send
```

Behavior:
- Targets only `companyId == null AND legacyProvisionedAt != null AND
  activationEmailSentAt == null AND lastLogin == null AND disabledAt == null`, and skips
  malformed addresses. The `companyId == null` fence keeps this ProTrack cohort strictly
  separate from the CE-provider accounts (Part 3), which share the same markers.
- Mints a **30-day** set-password link, sends the records-first email, then stamps
  `activationEmailSentAt` per recipient, so a re-run only picks up stragglers and
  never double-sends.
- Throttled to ~2 sends/sec (`--rate=N` to change) with retry + backoff; `--limit=N`
  to cap.
- If some fail, just re-run; it resumes from where it left off.

Stragglers: anyone who doesn't act within 30 days can be re-invited by clearing their
`activationEmailSentAt` and re-running (a fresh 30-day link is minted each send).

### Manual end-to-end check
Before the full send, do one real `--limit=1` invite to your own inbox, then click the
link, set a password, sign in, and confirm your migrated CE history shows in `/protrack`.

---

## Part 3 — CE provider (company) accounts

The migration loaded **39 CE-provider companies** (`companies.legacy_id != null`) as
data only, with no owner accounts and no contact emails. This part creates one owner
account per company and links it to the pre-loaded Company (credits, accredited courses,
and issued-cert history all intact), then emails each owner a set-password link. It
mirrors Part 2 but for the company side.

| Command | What it does |
|---|---|
| `pnpm provision:legacy-providers --emit-template` | Prints the fill-in CSV to stdout (`legacy_id` + `company_name` pre-filled from the DB, `owner_email`/`owner_first`/`owner_last` blank) for the client to complete. |
| `pnpm provision:legacy-providers [csvPath]` | Reads the filled CSV and, per row, creates a Supabase auth user (`email_confirm`, random password) + a `users` row (`companyId`, `signupIntent=COMPANY`, `protrackTier=FREE`, `emailVerifiedAt=now`, `legacyProvisionedAt=now`) linked to the Company. |
| `pnpm invite:legacy-providers` | Emails each provisioned, not-yet-invited provider account a 30-day set-password link (`emails/legacy-provider-activation.tsx`). |

Because the legacy source has no provider emails, provisioning is CSV-driven. The CSV
path is the first positional arg (default `~/Downloads/legacy-providers.csv`):

```
legacy_id,company_name,owner_email,owner_first,owner_last
7,"Acme Dental Institute",owner@acme.com,Jane,Doe
```

`parseProvidersCsv` (`scripts/legacy/provider-csv.ts`, unit-tested, no DB) handles quoted
fields, trimming, and rejects blank/invalid emails.

### Provisioning behavior
- Finds the Company by `legacy_id`; **skips + warns** if none, or if the row's
  `company_name` does not match the DB name (trimmed, case-insensitive) so a mis-fill is
  caught but non-fatal.
- **Skips (counts as reused)** if the Company already has any linked user, or if the
  `owner_email` already exists as a user — a user links only one company. This is what
  makes re-runs a no-op (the account created on a prior run is already linked).
- **No cert backfill** — providers are not individual licensees; their history lives on
  the Company they link to.
- Pre-verified but **password-locked** (a random password the owner never sees), so inert
  until the emailed set-password link is used.
- Flags: `--dry-run` (no writes), `--limit=N` (staged), `--sleep-ms=N` (throttle between
  auth creates, default 60), `--emit-template`.

### Sending the provider invites
Same env prereqs as Part 2: **`EMAIL_TEST_BCC` UNSET** (`invite:legacy-providers`
hard-refuses to run if it is set, override only with `--force`), **`RESEND_API_KEY`** set
(and `RESEND_FROM_EMAIL`), **`SESSION_SECRET`** set (mints the 30-day set-password token),
and **`NEXT_PUBLIC_APP_URL`** pointed at production. Staged sequence:

```bash
pnpm invite:legacy-providers --dry-run     # renders + logs each recipient, sends nothing
pnpm invite:legacy-providers --limit=25    # small real batch; watch Resend for bounces
pnpm invite:legacy-providers               # full send
```

### Two cohorts, one set of markers
Both parts stamp the same `legacyProvisionedAt` / `activationEmailSentAt` columns, so the
send scripts are fenced by `companyId`: Part 2 (`invite:legacy`) targets `companyId == null`
(ProTrack individuals), Part 3 (`invite:legacy-providers`) targets `companyId != null`
(providers). Neither can ever pick up the other's accounts.
