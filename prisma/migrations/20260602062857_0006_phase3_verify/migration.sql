-- CreateEnum
CREATE TYPE "BatchStatus" AS ENUM ('ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "ComplianceStatus" AS ENUM ('COMPLIANT', 'IN_PROGRESS', 'DEFICIENT', 'NO_UPLOAD');

-- CreateEnum
CREATE TYPE "DeficiencyStatus" AS ENUM ('PENDING', 'RESOLVED', 'ESCALATED');

-- CreateEnum
CREATE TYPE "NoticeType" AS ENUM ('INITIAL', 'FOLLOWUP_30D', 'FINAL_7D', 'RESOLVED_CONFIRMATION', 'PROTRACK_INVITE');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "board_id" UUID;

-- CreateTable
CREATE TABLE "boards" (
    "id" UUID NOT NULL,
    "state" CHAR(2) NOT NULL,
    "name" TEXT NOT NULL,
    "admin_email" TEXT,
    "daily_summary_email" TEXT,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "boards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_batches" (
    "id" UUID NOT NULL,
    "board_id" UUID NOT NULL,
    "batch_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sample_percent" INTEGER NOT NULL,
    "license_type" "LicenseType",
    "renewal_cycle" TEXT NOT NULL,
    "selected_count" INTEGER NOT NULL,
    "deficient_count" INTEGER NOT NULL,
    "status" "BatchStatus" NOT NULL DEFAULT 'ACTIVE',
    "initiated_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_selections" (
    "id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "user_license_id" UUID NOT NULL,
    "ce_hours_completed" DECIMAL(5,2) NOT NULL,
    "ce_hours_required" DECIMAL(5,2) NOT NULL,
    "compliance_status" "ComplianceStatus" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_selections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deficiencies" (
    "id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "user_license_id" UUID NOT NULL,
    "missing_hours" DECIMAL(5,2) NOT NULL,
    "missing_categories" JSONB NOT NULL,
    "notices_sent_count" INTEGER NOT NULL DEFAULT 0,
    "deadline_at" TIMESTAMP(3),
    "status" "DeficiencyStatus" NOT NULL DEFAULT 'PENDING',
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deficiencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notices_sent" (
    "id" UUID NOT NULL,
    "deficiency_id" UUID NOT NULL,
    "notice_type" "NoticeType" NOT NULL,
    "recipient_email" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_by_id" UUID,
    "resend_message_id" TEXT,

    CONSTRAINT "notices_sent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "boards_state_key" ON "boards"("state");

-- CreateIndex
CREATE UNIQUE INDEX "audit_batches_batch_code_key" ON "audit_batches"("batch_code");

-- CreateIndex
CREATE INDEX "audit_batches_board_id_created_at_idx" ON "audit_batches"("board_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_selections_batch_id_compliance_status_idx" ON "audit_selections"("batch_id", "compliance_status");

-- CreateIndex
CREATE UNIQUE INDEX "audit_selections_batch_id_user_license_id_key" ON "audit_selections"("batch_id", "user_license_id");

-- CreateIndex
CREATE INDEX "deficiencies_batch_id_status_idx" ON "deficiencies"("batch_id", "status");

-- CreateIndex
CREATE INDEX "deficiencies_status_deadline_at_idx" ON "deficiencies"("status", "deadline_at");

-- CreateIndex
CREATE INDEX "notices_sent_deficiency_id_sent_at_idx" ON "notices_sent"("deficiency_id", "sent_at");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "boards"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_batches" ADD CONSTRAINT "audit_batches_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "boards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_batches" ADD CONSTRAINT "audit_batches_initiated_by_id_fkey" FOREIGN KEY ("initiated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_selections" ADD CONSTRAINT "audit_selections_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "audit_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_selections" ADD CONSTRAINT "audit_selections_user_license_id_fkey" FOREIGN KEY ("user_license_id") REFERENCES "user_licenses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deficiencies" ADD CONSTRAINT "deficiencies_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "audit_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deficiencies" ADD CONSTRAINT "deficiencies_user_license_id_fkey" FOREIGN KEY ("user_license_id") REFERENCES "user_licenses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notices_sent" ADD CONSTRAINT "notices_sent_deficiency_id_fkey" FOREIGN KEY ("deficiency_id") REFERENCES "deficiencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notices_sent" ADD CONSTRAINT "notices_sent_sent_by_id_fkey" FOREIGN KEY ("sent_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
