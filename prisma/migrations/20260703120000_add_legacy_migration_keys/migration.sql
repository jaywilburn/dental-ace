-- Legacy-import provenance / dedup keys for the one-time migration of the
-- legacy Google Sheet + Typeform CE dataset (see scripts/migrate-legacy.ts).
-- All three columns are nullable and additive, so existing rows and flows are
-- unaffected. The IF NOT EXISTS guards make the migration safe to (re)apply on
-- a shared dev database where the columns may have been applied out of band.

-- AlterTable
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "legacy_id" INTEGER;

-- AlterTable
ALTER TABLE "accredited_courses" ADD COLUMN IF NOT EXISTS "legacy_id" INTEGER;

-- AlterTable
ALTER TABLE "issued_certificates" ADD COLUMN IF NOT EXISTS "legacy_cert_number" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "companies_legacy_id_key" ON "companies"("legacy_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "accredited_courses_legacy_id_key" ON "accredited_courses"("legacy_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "issued_certificates_legacy_cert_number_key" ON "issued_certificates"("legacy_cert_number");
