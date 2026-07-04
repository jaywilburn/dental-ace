# Legacy attendee account provisioning + activation

Follow-on to the legacy CE data migration. The migration loaded ~4,637 certificates
for ~3,162 distinct attendee emails as **data only** (no accounts). These two scripts
create a ProTrack account for each attendee, backfill their CE history, and later
email each one a link to set a password and sign in.

## Scripts

| Command | What it does |
|---|---|
| `pnpm provision:legacy` | One account per distinct migrated attendee email: a Supabase auth user (`email_confirm`, random password) + a `users` row (`protrackTier=FREE`, `emailVerifiedAt=now`, `legacyProvisionedAt=now`) + a CE backfill (every passing `IssuedCertificate` for that email becomes an AUTO-verified `CeCertificate`). |
| `pnpm invite:legacy` | Emails each provisioned, not-yet-invited account a 30-day set-password link (records-first copy, `emails/legacy-activation.tsx`). |

Both build their own Prisma/Supabase/Resend clients (the app's `send.ts` / `ace-sync.ts`
are `server-only` and can't be imported by a `tsx` script), and both are
idempotent/resumable.

### Provisioning flags
`--dry-run` (counts, no writes) · `--limit=N` (staged) · `--sleep-ms=N` (throttle between
auth creates, default 60).

### How accounts are created
- Accounts are **pre-verified but password-locked** (a random password the user never
  sees), so they are inert until the emailed set-password link is used.
- Backfill matches on the **authoritative migrated `attendeeEmail` only** (mirrors
  `lib/protrack/ace-sync.ts`), deduped on the unique `ce_certificates.issued_certificate_id`.
- `firstName`/`lastName` come from the attendee name on the most recent cert
  (first token / rest; `scripts/legacy/name-split.ts`).
- No `UserLicense` is created (the legacy certs carry no license number), so an account
  starts with CE history visible but no compliance dashboard until the user adds a license.
- `User.legacyProvisionedAt` marks the cohort; `User.activationEmailSentAt` tracks the send.

## What has been run (production)

Provisioning ran on 2026-07-03: **3,159 created, 3 reused, 0 failed, 4,637 CE certs
backfilled** (100% of migrated certs). Invite cohort: **3,161** accounts, all verified,
none signed in. **The activation emails have NOT been sent yet.**

Re-running `pnpm provision:legacy` is a no-op for existing accounts (skips + dedupes).

---

## Ready to send (the activation email)

Run when it's time to invite people. Send from an environment where:

- **`EMAIL_TEST_BCC` is UNSET.** It is applied inside the app's mailer on every send, so
  leaving it set would BCC the client on all ~3,161 emails. `invite:legacy` **hard-refuses
  to run** if it is set (override only with `--force`).
- **`RESEND_API_KEY` is set** (and `RESEND_FROM_EMAIL`, default `noreply@dentalace.org`),
  and **`NEXT_PUBLIC_APP_URL`** points at production so the set-password links are correct.

Recommended sequence (staged, so a bad address never hurts domain reputation):

```bash
pnpm invite:legacy --dry-run        # renders + logs each recipient, sends nothing
pnpm invite:legacy --limit=25       # small real batch; watch Resend for bounces
pnpm invite:legacy                  # full send
```

Behavior:
- Targets only `legacyProvisionedAt != null AND activationEmailSentAt == null AND lastLogin
  == null AND disabledAt == null`, and skips malformed addresses.
- Mints a **30-day** set-password link, sends the records-first email, then stamps
  `activationEmailSentAt` per recipient, so a re-run only picks up stragglers and never
  double-sends.
- Throttled to ~2 sends/sec (`--rate=N` to change) with retry + backoff; `--limit=N` to cap.
- If some fail, just re-run; it resumes from where it left off.

Stragglers: anyone who doesn't act within 30 days can be re-invited by re-running the send
after clearing their `activationEmailSentAt` (a fresh 30-day link is minted each send).

### Manual end-to-end check
Before the full send, do one real `--limit=1` invite to your own inbox, then click the
link, set a password, sign in, and confirm your migrated CE history shows in `/protrack`.
