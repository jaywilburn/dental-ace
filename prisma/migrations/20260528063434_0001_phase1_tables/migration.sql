-- CreateEnum
CREATE TYPE "Role" AS ENUM ('CUSTOMER', 'REVIEWER', 'ADMIN');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "BillingTransactionType" AS ENUM ('APP_CREDIT', 'CERT_BUNDLE', 'EXPEDITE', 'ADMIN_OVERRIDE');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'CUSTOMER',
    "company_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_login" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companies" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "stripe_customer_id" TEXT,
    "application_credits" INTEGER NOT NULL DEFAULT 0,
    "application_credits_expires_at" TIMESTAMP(3),
    "cert_balance" INTEGER NOT NULL DEFAULT 0,
    "cert_alert_threshold" INTEGER NOT NULL DEFAULT 25,
    "total_certs_issued" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_applications" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'DRAFT',
    "course_title" TEXT,
    "ce_hours" DECIMAL(5,2),
    "course_type" TEXT,
    "delivery_method" TEXT,
    "application_data" JSONB NOT NULL,
    "is_expedited" BOOLEAN NOT NULL DEFAULT false,
    "submitted_at" TIMESTAMP(3),
    "reviewed_by_id" UUID,
    "reviewer_notes" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "course_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accredited_courses" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "course_id_number" TEXT NOT NULL,
    "approved_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "attendee_link_token" UUID NOT NULL,
    "qr_code_url" TEXT,
    "approval_letter_url" TEXT,
    "quiz_questions" JSONB NOT NULL,
    "certs_issued_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accredited_courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issued_certificates" (
    "id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "attendee_name" TEXT NOT NULL,
    "attendee_email" TEXT NOT NULL,
    "license_number" TEXT,
    "license_type" TEXT,
    "license_states" TEXT[],
    "delivery_method" TEXT,
    "course_type" TEXT,
    "quiz_responses" JSONB NOT NULL,
    "score" INTEGER NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "cert_pdf_url" TEXT,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "issued_certificates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_transactions" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "type" "BillingTransactionType" NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "amount_cents" INTEGER NOT NULL,
    "stripe_payment_id" TEXT,
    "stripe_event_id" TEXT,
    "is_expedited" BOOLEAN NOT NULL DEFAULT false,
    "performed_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "companies_stripe_customer_id_key" ON "companies"("stripe_customer_id");

-- CreateIndex
CREATE INDEX "course_applications_company_id_status_idx" ON "course_applications"("company_id", "status");

-- CreateIndex
CREATE INDEX "course_applications_status_is_expedited_submitted_at_idx" ON "course_applications"("status", "is_expedited", "submitted_at");

-- CreateIndex
CREATE UNIQUE INDEX "accredited_courses_application_id_key" ON "accredited_courses"("application_id");

-- CreateIndex
CREATE UNIQUE INDEX "accredited_courses_course_id_number_key" ON "accredited_courses"("course_id_number");

-- CreateIndex
CREATE UNIQUE INDEX "accredited_courses_attendee_link_token_key" ON "accredited_courses"("attendee_link_token");

-- CreateIndex
CREATE INDEX "accredited_courses_company_id_idx" ON "accredited_courses"("company_id");

-- CreateIndex
CREATE INDEX "accredited_courses_expires_at_idx" ON "accredited_courses"("expires_at");

-- CreateIndex
CREATE INDEX "issued_certificates_company_id_issued_at_idx" ON "issued_certificates"("company_id", "issued_at");

-- CreateIndex
CREATE INDEX "issued_certificates_course_id_idx" ON "issued_certificates"("course_id");

-- CreateIndex
CREATE INDEX "issued_certificates_attendee_email_idx" ON "issued_certificates"("attendee_email");

-- CreateIndex
CREATE UNIQUE INDEX "billing_transactions_stripe_event_id_key" ON "billing_transactions"("stripe_event_id");

-- CreateIndex
CREATE INDEX "billing_transactions_company_id_created_at_idx" ON "billing_transactions"("company_id", "created_at");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_applications" ADD CONSTRAINT "course_applications_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_applications" ADD CONSTRAINT "course_applications_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accredited_courses" ADD CONSTRAINT "accredited_courses_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "course_applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accredited_courses" ADD CONSTRAINT "accredited_courses_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issued_certificates" ADD CONSTRAINT "issued_certificates_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "accredited_courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issued_certificates" ADD CONSTRAINT "issued_certificates_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_transactions" ADD CONSTRAINT "billing_transactions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
