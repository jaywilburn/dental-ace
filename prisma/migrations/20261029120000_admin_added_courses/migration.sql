-- Admin "Add approved course" (lib/admin/course-add.ts), its drafts, and
-- "Edit details" (lib/admin/course-details.ts). First use: DA236 for Emme
-- Sanders RDH, a course approved before DentalACE One that was never in the
-- legacy export. RLS for admin_course_drafts is in
-- sql-migrations/0017_admin_course_drafts_rls.sql; apply both together.

-- AlterEnum
ALTER TYPE "AdminAuditAction" ADD VALUE 'COURSE_ADDED';
ALTER TYPE "AdminAuditAction" ADD VALUE 'COURSE_DETAILS_UPDATED';

-- CreateTable
CREATE TABLE "admin_course_drafts" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "values" JSONB NOT NULL,
    "created_by_id" UUID NOT NULL,
    "updated_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_course_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "admin_course_drafts_company_id_idx" ON "admin_course_drafts"("company_id");

-- AddForeignKey
ALTER TABLE "admin_course_drafts" ADD CONSTRAINT "admin_course_drafts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_course_drafts" ADD CONSTRAINT "admin_course_drafts_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_course_drafts" ADD CONSTRAINT "admin_course_drafts_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
