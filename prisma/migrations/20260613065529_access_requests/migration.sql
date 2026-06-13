-- CreateEnum
CREATE TYPE "AccessRequestKind" AS ENUM ('COMPANY', 'BOARD', 'REVIEWER', 'ADMIN');

-- CreateEnum
CREATE TYPE "AccessRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AdminAuditAction" ADD VALUE 'ACCESS_REQUEST_APPROVED';
ALTER TYPE "AdminAuditAction" ADD VALUE 'ACCESS_REQUEST_DENIED';

-- CreateTable
CREATE TABLE "access_requests" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" "AccessRequestKind" NOT NULL,
    "status" "AccessRequestStatus" NOT NULL DEFAULT 'PENDING',
    "payload" JSONB NOT NULL DEFAULT '{}',
    "note" TEXT,
    "label" TEXT NOT NULL,
    "decided_by_user_id" UUID,
    "decided_at" TIMESTAMP(3),
    "deny_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "access_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "access_requests_status_created_at_idx" ON "access_requests"("status", "created_at");

-- CreateIndex
CREATE INDEX "access_requests_user_id_status_idx" ON "access_requests"("user_id", "status");

-- AddForeignKey
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_decided_by_user_id_fkey" FOREIGN KEY ("decided_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
