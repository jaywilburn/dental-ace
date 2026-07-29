-- Balance adjustments were recorded only in billing_transactions, so an admin
-- looking in the Audit Log for "who changed this company's credits" found
-- nothing. Money movements now appear there alongside every other admin action.

-- AlterEnum
ALTER TYPE "AdminAuditAction" ADD VALUE 'COMPANY_BALANCE_ADJUSTED';
