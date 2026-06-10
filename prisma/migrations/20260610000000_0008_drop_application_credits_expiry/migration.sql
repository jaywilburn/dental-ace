-- Client decision (2026-06 feedback round 1): application credits never expire.
-- The column was write-only (set on purchase, shown on the dashboard, one
-- reminder email) and never enforced at submission time.
ALTER TABLE "public"."companies" DROP COLUMN "application_credits_expires_at";
