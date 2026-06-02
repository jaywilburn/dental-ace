-- Email verification: track when a signup email was confirmed. Existing accounts
-- predate verification (seeded/already-trusted), so mark them verified.
ALTER TABLE "public"."users" ADD COLUMN "email_verified_at" TIMESTAMP(3);
UPDATE "public"."users" SET "email_verified_at" = "created_at" WHERE "email_verified_at" IS NULL;
