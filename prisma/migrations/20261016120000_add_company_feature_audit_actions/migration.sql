-- Per-company feature toggles (event surveys, attendance codes) are flipped by
-- admins on /admin/companies/[id], and the event survey can be edited by admins
-- on a provider's behalf. Both land in the Audit Log.

-- AlterEnum
ALTER TYPE "AdminAuditAction" ADD VALUE 'COMPANY_FEATURE_CHANGED';
ALTER TYPE "AdminAuditAction" ADD VALUE 'EVENT_SURVEY_UPDATED';
