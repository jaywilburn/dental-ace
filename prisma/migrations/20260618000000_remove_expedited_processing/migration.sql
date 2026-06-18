-- Client decision (June 2026 batch, Row 17): expedited processing is eliminated
-- entirely. No expedited SKU, no expedited credit pool, no is_expedited flag.
--
-- Data is preserved, not destroyed:
--   * existing EXPEDITE billing transactions are re-typed to APP_CREDIT
--   * any expedited credit balances are folded into the standard pool so no
--     company loses purchased value
-- then the columns + enum value are removed.

-- 1. Re-type any EXPEDITE transactions before removing the enum value.
UPDATE "billing_transactions" SET "type" = 'APP_CREDIT' WHERE "type" = 'EXPEDITE';

-- 2. Fold expedited credits into the standard application-credit pool.
UPDATE "companies"
   SET "application_credits" = "application_credits" + "expedited_credits"
 WHERE "expedited_credits" > 0;

-- 3. Drop the expedited columns. The reviewer-queue index that referenced
--    is_expedited is replaced with a (status, submitted_at) index.
DROP INDEX IF EXISTS "course_applications_status_is_expedited_submitted_at_idx";
ALTER TABLE "companies" DROP COLUMN "expedited_credits";
ALTER TABLE "course_applications" DROP COLUMN "is_expedited";
ALTER TABLE "billing_transactions" DROP COLUMN "is_expedited";
CREATE INDEX "course_applications_status_submitted_at_idx" ON "course_applications"("status", "submitted_at");

-- 4. Remove EXPEDITE from the enum. Postgres cannot drop an enum value in place,
--    so rename-and-swap. CASCADE is intentionally NOT used (it would drop the
--    dependent column); we re-cast the column to the new type explicitly.
ALTER TYPE "BillingTransactionType" RENAME TO "BillingTransactionType_old";
CREATE TYPE "BillingTransactionType" AS ENUM ('APP_CREDIT', 'CERT_BUNDLE', 'ADMIN_OVERRIDE');
ALTER TABLE "billing_transactions"
  ALTER COLUMN "type" TYPE "BillingTransactionType"
  USING ("type"::text::"BillingTransactionType");
DROP TYPE "BillingTransactionType_old";
