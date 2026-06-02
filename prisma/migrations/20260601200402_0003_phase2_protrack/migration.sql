-- CreateEnum
CREATE TYPE "PlanTier" AS ENUM ('FREE', 'PRO');

-- CreateEnum
CREATE TYPE "LicenseType" AS ENUM ('DDS_DMD', 'RDH', 'DA');

-- CreateEnum
CREATE TYPE "CertSource" AS ENUM ('ACE', 'ADA_CERP', 'AGD_PACE', 'UPLOADED');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('AUTO', 'ADA_CERP_ACCEPTED', 'AGD_PACE_ACCEPTED', 'PENDING', 'ADMIN_VERIFIED');

-- CreateEnum
CREATE TYPE "DeliveryFormat" AS ENUM ('IN_PERSON', 'ONLINE', 'HYBRID');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'PAST_DUE', 'CANCELED', 'INCOMPLETE', 'TRIALING');

-- CreateEnum
CREATE TYPE "SubscriptionInterval" AS ENUM ('MONTH', 'YEAR');

-- CreateEnum
CREATE TYPE "RequirementStatus" AS ENUM ('PROVISIONAL', 'CONFIRMED');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'LICENSEE';

-- CreateTable
CREATE TABLE "licensees" (
    "user_id" UUID NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "plan_tier" "PlanTier" NOT NULL DEFAULT 'FREE',
    "pro_expires_at" TIMESTAMP(3),
    "reminder_settings" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "licensees_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "user_licenses" (
    "id" UUID NOT NULL,
    "licensee_id" UUID NOT NULL,
    "state" CHAR(2) NOT NULL,
    "license_type" "LicenseType" NOT NULL,
    "license_number" TEXT NOT NULL,
    "renewal_date" TIMESTAMP(3) NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_licenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ce_certificates" (
    "id" UUID NOT NULL,
    "licensee_id" UUID NOT NULL,
    "course_title" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "source" "CertSource" NOT NULL,
    "category" TEXT NOT NULL,
    "hours" DECIMAL(5,2) NOT NULL,
    "delivery_format" "DeliveryFormat",
    "completed_at" TIMESTAMP(3) NOT NULL,
    "verification_status" "VerificationStatus" NOT NULL,
    "file_url" TEXT,
    "cert_number" TEXT,
    "issued_certificate_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ce_certificates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "state_requirements" (
    "id" UUID NOT NULL,
    "state" CHAR(2) NOT NULL,
    "license_type" "LicenseType" NOT NULL,
    "total_hours" DECIMAL(5,2) NOT NULL,
    "cycle_months" INTEGER NOT NULL,
    "renewal_month" INTEGER,
    "categories" JSONB NOT NULL,
    "status" "RequirementStatus" NOT NULL DEFAULT 'PROVISIONAL',
    "source" TEXT,
    "last_updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "state_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pro_subscriptions" (
    "licensee_id" UUID NOT NULL,
    "stripe_customer_id" TEXT NOT NULL,
    "stripe_subscription_id" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL,
    "interval" "SubscriptionInterval" NOT NULL,
    "current_period_end" TIMESTAMP(3) NOT NULL,
    "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pro_subscriptions_pkey" PRIMARY KEY ("licensee_id")
);

-- CreateTable
CREATE TABLE "board_invites" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "state" CHAR(2) NOT NULL,
    "license_type" "LicenseType",
    "email" TEXT,
    "used_by_user_id" UUID,
    "used_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "board_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "protrack_reminder_log" (
    "id" UUID NOT NULL,
    "licensee_id" UUID NOT NULL,
    "license_id" UUID NOT NULL,
    "threshold" TEXT NOT NULL,
    "cycle_renewal_date" TIMESTAMP(3) NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "protrack_reminder_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_licenses_licensee_id_idx" ON "user_licenses"("licensee_id");

-- CreateIndex
CREATE INDEX "user_licenses_state_license_type_idx" ON "user_licenses"("state", "license_type");

-- CreateIndex
CREATE INDEX "user_licenses_license_number_idx" ON "user_licenses"("license_number");

-- CreateIndex
CREATE UNIQUE INDEX "user_licenses_licensee_id_state_license_type_key" ON "user_licenses"("licensee_id", "state", "license_type");

-- CreateIndex
CREATE UNIQUE INDEX "ce_certificates_issued_certificate_id_key" ON "ce_certificates"("issued_certificate_id");

-- CreateIndex
CREATE INDEX "ce_certificates_licensee_id_completed_at_idx" ON "ce_certificates"("licensee_id", "completed_at");

-- CreateIndex
CREATE INDEX "ce_certificates_licensee_id_category_idx" ON "ce_certificates"("licensee_id", "category");

-- CreateIndex
CREATE UNIQUE INDEX "state_requirements_state_license_type_key" ON "state_requirements"("state", "license_type");

-- CreateIndex
CREATE UNIQUE INDEX "pro_subscriptions_stripe_subscription_id_key" ON "pro_subscriptions"("stripe_subscription_id");

-- CreateIndex
CREATE INDEX "pro_subscriptions_stripe_customer_id_idx" ON "pro_subscriptions"("stripe_customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "board_invites_code_key" ON "board_invites"("code");

-- CreateIndex
CREATE INDEX "board_invites_code_idx" ON "board_invites"("code");

-- CreateIndex
CREATE UNIQUE INDEX "protrack_reminder_log_licensee_id_license_id_threshold_cycl_key" ON "protrack_reminder_log"("licensee_id", "license_id", "threshold", "cycle_renewal_date");

-- AddForeignKey
ALTER TABLE "licensees" ADD CONSTRAINT "licensees_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_licenses" ADD CONSTRAINT "user_licenses_licensee_id_fkey" FOREIGN KEY ("licensee_id") REFERENCES "licensees"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ce_certificates" ADD CONSTRAINT "ce_certificates_licensee_id_fkey" FOREIGN KEY ("licensee_id") REFERENCES "licensees"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ce_certificates" ADD CONSTRAINT "ce_certificates_issued_certificate_id_fkey" FOREIGN KEY ("issued_certificate_id") REFERENCES "issued_certificates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pro_subscriptions" ADD CONSTRAINT "pro_subscriptions_licensee_id_fkey" FOREIGN KEY ("licensee_id") REFERENCES "licensees"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;
