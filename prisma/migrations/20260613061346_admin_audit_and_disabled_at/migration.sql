-- CreateEnum
CREATE TYPE "AdminAuditAction" AS ENUM ('PROFILE_UPDATED', 'STAFF_ROLE_CHANGED', 'COMPANY_LINKED', 'COMPANY_UNLINKED', 'PROTRACK_TIER_CHANGED', 'VERIFY_ACCESS_CHANGED', 'ACCOUNT_SUSPENDED', 'ACCOUNT_UNSUSPENDED', 'WORK_REASSIGNED', 'EMAIL_VERIFIED_MANUALLY', 'VERIFICATION_RESENT', 'SET_PASSWORD_LINK_SENT', 'STAFF_ACCOUNT_CREATED');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "disabled_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "admin_audit_log" (
    "id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "target_user_id" UUID,
    "action" "AdminAuditAction" NOT NULL,
    "summary" TEXT NOT NULL,
    "details" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "admin_audit_log_created_at_idx" ON "admin_audit_log"("created_at");

-- CreateIndex
CREATE INDEX "admin_audit_log_target_user_id_created_at_idx" ON "admin_audit_log"("target_user_id", "created_at");

-- CreateIndex
CREATE INDEX "admin_audit_log_actor_user_id_created_at_idx" ON "admin_audit_log"("actor_user_id", "created_at");

-- AddForeignKey
ALTER TABLE "admin_audit_log" ADD CONSTRAINT "admin_audit_log_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_audit_log" ADD CONSTRAINT "admin_audit_log_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
