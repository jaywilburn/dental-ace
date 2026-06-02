-- Unified access model: replace the single `role` with a staff role + per-feature
-- entitlement columns, and fold the `licensees` profile into `users`.
-- ProTrack child tables keep their `licensee_id` column but re-point the FK to users.

-- 1. Drop FKs that reference the licensees table.
ALTER TABLE "public"."user_licenses"   DROP CONSTRAINT IF EXISTS "user_licenses_licensee_id_fkey";
ALTER TABLE "public"."ce_certificates"  DROP CONSTRAINT IF EXISTS "ce_certificates_licensee_id_fkey";
ALTER TABLE "public"."pro_subscriptions" DROP CONSTRAINT IF EXISTS "pro_subscriptions_licensee_id_fkey";

-- 2. New staff-role enum.
CREATE TYPE "public"."StaffRole" AS ENUM ('NONE', 'REVIEWER', 'ADMIN');

-- 3. Add the new user columns (PlanTier already exists from 0003).
ALTER TABLE "public"."users"
  ADD COLUMN "first_name"        TEXT,
  ADD COLUMN "last_name"         TEXT,
  ADD COLUMN "staff_role"        "public"."StaffRole" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "protrack_tier"     "public"."PlanTier"  NOT NULL DEFAULT 'FREE',
  ADD COLUMN "pro_expires_at"    TIMESTAMP(3),
  ADD COLUMN "verify_access"     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "reminder_settings" JSONB   NOT NULL DEFAULT '{}';

-- 4. Backfill: map old role → staff_role, and fold licensee profile fields onto users.
UPDATE "public"."users" SET "staff_role" = 'ADMIN'    WHERE "role" = 'ADMIN';
UPDATE "public"."users" SET "staff_role" = 'REVIEWER' WHERE "role" = 'REVIEWER';

UPDATE "public"."users" u
SET "first_name"        = l."first_name",
    "last_name"         = l."last_name",
    "protrack_tier"     = l."plan_tier",
    "pro_expires_at"    = l."pro_expires_at",
    "reminder_settings" = l."reminder_settings"
FROM "public"."licensees" l
WHERE l."user_id" = u."id";

-- 5. Drop the old role column + enum.
ALTER TABLE "public"."users" DROP COLUMN "role";
DROP TYPE "public"."Role";

-- 6. Drop the licensees table (its data now lives on users).
DROP TABLE "public"."licensees";

-- 7. Re-point the ProTrack child FKs to users(id).
ALTER TABLE "public"."user_licenses"
  ADD CONSTRAINT "user_licenses_licensee_id_fkey"
  FOREIGN KEY ("licensee_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."ce_certificates"
  ADD CONSTRAINT "ce_certificates_licensee_id_fkey"
  FOREIGN KEY ("licensee_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."pro_subscriptions"
  ADD CONSTRAINT "pro_subscriptions_licensee_id_fkey"
  FOREIGN KEY ("licensee_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
