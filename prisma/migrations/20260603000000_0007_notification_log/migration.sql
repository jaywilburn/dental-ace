-- CreateTable
CREATE TABLE "notification_log" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "ref_id" UUID NOT NULL,
    "period_key" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notification_log_company_id_kind_sent_at_idx" ON "notification_log"("company_id", "kind", "sent_at");

-- CreateIndex
CREATE UNIQUE INDEX "notification_log_company_id_kind_ref_id_period_key_key" ON "notification_log"("company_id", "kind", "ref_id", "period_key");
