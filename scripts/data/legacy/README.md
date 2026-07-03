# Legacy CE data migration

One-time import of the client's legacy CE dataset (from their old Google Sheet /
Typeform tracking) into DentalACE One: **39 CE-provider companies, 106 accredited
courses, 4,637 issued certificates** (4,677 source rows minus 40 test/internal
rows).

The delivered `dentalace_migration_v3.sql` targets a simplified, assumed schema
(integer PKs, a flat `certificates` table) that does **not** match our real
schema, so it is never run. It is treated as a dataset: parsed, cleaned, mapped
onto the real schema, and loaded by `scripts/migrate-legacy.ts`.

## Files in this folder

| File | What it is |
|---|---|
| `companies.json` | 39 companies (`legacyId`, `name`, `totalCertsIssued`). |
| `courses.json` | 106 courses (application + accredited-course fields, `ACE-LEG-#####` id). |
| `certificates.json` | 4,637 issued certs, normalized + FK-linked by legacy id. |
| `migration-report.txt` | Extract report: counts, every excluded row + reason, dropped states, unmapped occupation/type/format, nulled dates. |

These JSON files are the reviewable, committed artifact. Regenerate them from the
source SQL with `--extract` (below); they are deterministic apart from the report
timestamp.

## Idempotency keys

`issued_certificates` had no unique business key, so the migration adds three
nullable, unique columns (Prisma migration
`20260703120000_add_legacy_migration_keys`):

- `companies.legacy_id`
- `accredited_courses.legacy_id`
- `issued_certificates.legacy_cert_number` (the legacy `cert_number`, e.g.
  `LEGACY-DA255-00001`; verified 0 blank / 0 duplicate)

Re-running the load upserts on these, so it is a no-op for rows already present.

## How to run

All commands run from the repo root.

1. **Apply the schema migration** on the target database (adds the three nullable
   columns; already committed under `prisma/migrations/`):
   ```
   pnpm exec prisma migrate deploy
   ```
   Note: on the shared dev database, `prisma migrate dev` reports drift because
   two unmerged feature-branch migrations are applied there but absent on `main`;
   the migration SQL uses `IF NOT EXISTS`, so it is safe to apply out of band
   (e.g. via the Supabase SQL editor or the Supabase MCP) if `migrate deploy` is
   not appropriate for that environment.

2. **Re-extract** (only needed if the source SQL changes). Defaults to
   `~/Downloads/dentalace_migration_v3.sql`; override with `--source=` or
   `LEGACY_SQL_PATH`:
   ```
   pnpm migrate:legacy --extract
   ```

3. **Dry run** (reads only, reports insert/update counts):
   ```
   pnpm migrate:legacy --dry-run
   ```

4. **Load** (idempotent; FK order Company, CourseApplication, AccreditedCourse,
   IssuedCertificate):
   ```
   pnpm migrate:legacy
   ```
   Re-running reports updates only, 0 inserts.

The script prints the target DB host before writing. It performs a **data load
only**: no company owner logins, no activation emails, no cert PDFs, no
`ce_certificates`.

## What the load does (and does not) touch

- Sets `companies.total_certs_issued` and `accredited_courses.certs_issued_count`
  to the migrated counts. A raw insert never runs the issue transaction, so
  `companies.cert_balance` is left at 0 (migrated certs do not consume balance).
- Historical courses are loaded with `expires_at == approved_at` (already
  expired), so their public attend links are inactive: these are records, not
  live courses. `quiz_questions` is `[]`.
- Certificates carry the real `attendee_email` and `passed = true`, so they
  become claimable in ProTrack automatically via the existing email-proven sync
  (`lib/protrack/ace-sync.ts`): they appear when a person verifies an account
  with a matching email, or via the certificate claim link. No email is sent by
  the migration.

## Cleaning applied

- **Excluded (40):** the client's flagged test rows plus internal
  `@ceexchange.io` / `@johnstampermedia.com` operator addresses. Each is listed
  with its reason in `migration-report.txt`.
- **Dates:** completion dates outside 2015 to 2026, or impossible/unparseable,
  are nulled (195 rows); the certificate is still imported and falls back to its
  issued date.
- **States:** full names mapped to 2-char US/CA codes; non-US jurisdictions
  (Jamaica, etc.) and `N/A` are dropped from `license_states` and logged.
- **Occupation, subject, format:** mapped to the app's on-cert license type,
  course type, and delivery method; unmappable values stored as null and logged.

## Out of scope (follow-up)

Company owner logins and activation emails are a separate step: the dataset has
no per-company contact email, and activation is a user-level set-password flow.
Once John/Christy supply contact emails, provision an owner user per company
(Supabase auth user + `users` row with `email_verified_at` set + `company_id`),
then send a set-password invite (`lib/auth/set-password-token.ts`).

## Reversing the load

Every migrated row is tagged, so the import is fully reversible:
```sql
DELETE FROM issued_certificates WHERE legacy_cert_number IS NOT NULL;
DELETE FROM accredited_courses  WHERE legacy_id IS NOT NULL;
DELETE FROM course_applications WHERE application_data->>'source' = 'legacy-migration-v3';
DELETE FROM companies           WHERE legacy_id IS NOT NULL;
```
