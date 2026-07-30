-- Admin balance adjustments recorded a bare ADMIN_OVERRIDE, which does not say
-- WHICH balance moved. On 2026-07-29 an admin granted 155 application credits
-- to SKF Practice Solutions meaning to grant 155 certificates, then granted the
-- 155 certificates as well; both landed in the ledger as an identical
-- "ADMIN_OVERRIDE, quantity 155" row, so the mistake was unreadable after the
-- fact. 28 of the 36 billing_transactions rows in production carry this type.
--
-- Split it. The existing 28 rows are NOT backfilled: two same-company,
-- same-quantity rows seconds apart carry no signal that says which balance each
-- one touched, and inventing one would put a guess in an append-only financial
-- ledger. They keep ADMIN_OVERRIDE and render as "Admin adjustment (legacy)".

-- AlterEnum
ALTER TYPE "BillingTransactionType" ADD VALUE 'ADMIN_OVERRIDE_APP_CREDITS';
ALTER TYPE "BillingTransactionType" ADD VALUE 'ADMIN_OVERRIDE_CERTS';
