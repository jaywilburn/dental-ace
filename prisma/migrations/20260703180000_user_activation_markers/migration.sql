-- Activation markers on users for the legacy-account provisioning + set-password
-- invite batch (scripts/provision-legacy-accounts.ts, scripts/send-legacy-invites.ts).
-- Both columns are nullable and additive, so existing rows and flows are
-- unaffected. IF NOT EXISTS keeps the migration safe to (re)apply on a shared dev
-- database where the columns may have been applied out of band.

-- AlterTable
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "legacy_provisioned_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "activation_email_sent_at" TIMESTAMP(3);
