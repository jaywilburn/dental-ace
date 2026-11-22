-- Spam on the public marketing lead forms (Verify contact, mostly). Caught
-- submissions are kept but flagged, so they send no email yet stay reviewable
-- under Admin > Leads > Spam. ip_hash backs a rate limit that holds across
-- serverless instances (the in-memory limiter did not).

-- AlterTable
ALTER TABLE "marketing_leads" ADD COLUMN     "ip_hash" TEXT,
ADD COLUMN     "is_spam" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "spam_reason" TEXT;

-- CreateIndex
CREATE INDEX "marketing_leads_ip_hash_created_at_idx" ON "marketing_leads"("ip_hash", "created_at");

-- CreateIndex
CREATE INDEX "marketing_leads_email_created_at_idx" ON "marketing_leads"("email", "created_at");
