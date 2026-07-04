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
- Targets only `legacyProvisionedAt != null AND activationEmailSentAt == null AND
  lastLogin == null AND disabledAt == null`, and skips malformed addresses.
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
