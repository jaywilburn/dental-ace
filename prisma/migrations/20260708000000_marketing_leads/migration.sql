-- CreateEnum
CREATE TYPE "MarketingLeadSource" AS ENUM ('VERIFYIQ', 'VERIFY');

-- CreateTable
CREATE TABLE "marketing_leads" (
    "id" UUID NOT NULL,
    "source" "MarketingLeadSource" NOT NULL,
    "contact_name" TEXT NOT NULL,
    "title" TEXT,
    "organization" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marketing_leads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "marketing_leads_created_at_idx" ON "marketing_leads"("created_at");
