# Email Testing

How to exercise every email notification DentalACE One sends, and how to confirm
each one fires. No special tooling is required for local testing: with no Resend
key set (the local-dev default) every send renders the real template and logs it
to the server console.

All outbound mail flows through one helper, `sendEmail()` in
[`lib/email/send.ts`](../lib/email/send.ts). It has exactly two runtime modes:

- **No `RESEND_API_KEY`** (local dev default): the template is rendered to HTML
  and a `[email:LOG_MODE]` line is printed to the server log. Nothing is sent.
- **`RESEND_API_KEY` set**: the email is sent via Resend.

Because both paths render the same React Email template, log mode proves the
template compiles, the props are well-formed, and the recipients are correct,
without any DNS or API setup.

## The three testing tiers

### Tier 1: LOG MODE (local dev, no key)

Run the app with no `RESEND_API_KEY` (leave it unset in `.env.local`):

```bash
pnpm dev
```

Then perform the action that triggers the email (see the checklist below). For
every send you get a console line like:

```
[email:LOG_MODE] subject="Confirm your email" to=["sarah.mitchell@example.com"] attachments=0 html_bytes=10342
```

The line reports the subject, the resolved `to` / `cc` / `bcc` lists, the
attachment count, and the rendered HTML size. Use it to confirm the right
template fired for the right recipient.

Two related dev-only log lines help when an email carries a one-time link
(verification or set-password). The link itself is also printed so you can
follow it without a real inbox:

```
[verify-email:DEV_LINK] sarah.mitchell@example.com -> http://localhost:3000/api/auth/verify-email?token=...
[set-password:DEV_LINK]  newadmin@example.com    -> http://localhost:3000/...
```

### Tier 2: CLIENT PREVIEW BCC (staging / prod, real key)

When a real `RESEND_API_KEY` is set, `EMAIL_TEST_BCC` (comma-separated
addresses) silently BCCs every outbound email to the client so they can see the
real, fully styled message land in their own inbox during acceptance testing.
It is a BCC, not a CC, so the actual recipient never sees the client addresses,
and addresses already on the message are de-duplicated.

```bash
# .env (staging): client sees a copy of every email
EMAIL_TEST_BCC=john@dentalace.org,christy@dentalace.org
```

> IMPORTANT: `EMAIL_TEST_BCC` MUST be unset before launch. While it is set,
> every real customer, licensee, and board email is also copied to the client.
> Removing the variable turns it off with no code change. Confirm it is absent
> from the production environment as part of the pre-launch checklist.

### Tier 3: RESEND DASHBOARD (real key, delivery truth)

Once `RESEND_API_KEY` and `RESEND_FROM_EMAIL` are set, the
[Resend dashboard](https://resend.com) is the source of truth for what actually
left the system. Use it to review per-message delivery, opens, bounces, and spam
complaints. This is the only tier that confirms real inbox delivery (SPF / DKIM /
DMARC for `dentalace.org` must be live, which they are as of 2026-06-28).

## Whether-to-send unit tests

The cron "should this notification fire today?" logic is pure and unit-tested,
so you do not need to stand up data to check the thresholds. See
[`lib/notifications/lifecycle.test.ts`](../lib/notifications/lifecycle.test.ts)
(course-expiry 60/30-day windows, low vs. exhausted cert-balance classification,
and the rolling cooldown). Access-request fan-out is covered by
[`lib/auth/access-requests.test.ts`](../lib/auth/access-requests.test.ts).

```bash
pnpm test                 # vitest run (whole suite)
pnpm test lifecycle       # just the lifecycle decision tests
```

These tests assert the decision logic, not the rendered email; pair them with a
Tier 1 LOG MODE run to confirm the template itself.

## Email inventory and how to trigger each one

Relevant environment variables: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`,
`EMAIL_TEST_BCC`, `AADB_ADMIN_EMAIL`, `CRON_SECRET`, `NEXT_PUBLIC_APP_URL`
(see `.env.example`).

### Transactional (action-triggered)

| Email template | Trigger |
|----------------|---------|
| `verify-email` | Sign up at `/signup`, or board self-register at `/signup/board`; also `/api/auth/resend-verification` and the admin "Resend verification" action |
| `protrack-welcome` | Click the verification link (`/api/auth/verify-email?token=`); welcome fires after the account is confirmed |
| `staff-invite` | Admin invites a staff member or creates an account (admin "Send set-password link" / "Create account") |
| `application-submitted` | Submit a course application (`/company` application wizard) or an event submission |
| `application-approved` | Reviewer approves a course or event in `/reviewer` |
| `application-rejected` | Reviewer rejects a course or event in `/reviewer` |
| `certificate-issued` | An attendee completes the public form at `/attend/[token]` (single course or combined event) |
| `access-request-received` | A user requests access to a feature (sent to the requester) |
| `access-request-new-admin` | Same request, sent to platform admins |
| `access-request-approved` | Admin approves an access request |
| `access-request-denied` | Admin denies an access request |
| `notice-initial` / `notice-followup-30d` / `notice-final-7d` | A board user manually sends a deficiency notice from `/board` |

Note: `emails/company-registered.tsx` exists but is not currently wired to any
send site. It renders for preview only.

### Cron-triggered

These run daily (weekly for housekeeping) on Vercel Cron per
[`vercel.json`](../vercel.json). Trigger them locally with a plain GET (see
below).

| Cron route | Emails it can send |
|------------|--------------------|
| `app/api/cron/dental-ace-lifecycle` | `course-expiring`, `low-cert-balance`, `cert-balance-exhausted` |
| `app/api/cron/protrack-reminders` | `protrack-renewal-reminder`, `protrack-category-gap` |
| `app/api/cron/verify-board-summary` | `board-daily-summary` |
| `app/api/cron/verify-deficiency-check` | `notice-followup-30d`, `notice-final-7d`, `notice-resolved` |
| `app/api/cron/verify-audit-housekeeping` | none (status housekeeping only) |

## Triggering the cron routes locally

Each cron handler checks `Authorization: Bearer <CRON_SECRET>`. In non-production
with no `CRON_SECRET` set, the routes allow an unauthenticated request as a dev
convenience, so a bare curl works:

```bash
curl localhost:3000/api/cron/dental-ace-lifecycle
curl localhost:3000/api/cron/protrack-reminders
curl localhost:3000/api/cron/verify-board-summary
curl localhost:3000/api/cron/verify-deficiency-check
```

If you set `CRON_SECRET` locally, pass it:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/cron/dental-ace-lifecycle
```

Each route returns a JSON summary (counts of what it sent), and every actual send
prints a `[email:LOG_MODE]` line. The lifecycle and ProTrack crons rely on
seeded data, so run `pnpm seed` (and `pnpm seed:verify` for the board crons)
first if the counts come back zero.

Notifications are de-duplicated by a ledger row written before the send (the
lifecycle and ProTrack crons are send-once per cycle, balance alerts use a
7-day cooldown), so re-running a cron immediately will report zero new sends.
Clear or age the ledger to re-fire.

## Quick smoke test

With no Resend key set:

1. `pnpm dev`
2. Register at `/signup`; confirm a `[email:LOG_MODE] subject="Confirm your
   email"` line plus a `[verify-email:DEV_LINK]` line appear in the console.
3. `curl localhost:3000/api/cron/dental-ace-lifecycle` (after `pnpm seed`);
   confirm at least one `[email:LOG_MODE]` line and a JSON summary.

## Pre-launch checklist

- [ ] `RESEND_API_KEY` and `RESEND_FROM_EMAIL` set in the production environment.
- [ ] `EMAIL_TEST_BCC` UNSET in production (no client copies of customer mail).
- [ ] `CRON_SECRET` set so the Vercel Cron routes reject unauthenticated calls.
- [ ] `NEXT_PUBLIC_APP_URL` set to the production origin (used for all links in
      outbound email).
- [ ] SPF / DKIM / DMARC verified for `dentalace.org` in Resend.
