-- AlterEnum
ALTER TYPE "AdminAuditAction" ADD VALUE 'LETTER_SETTINGS_UPDATED';

-- CreateTable
CREATE TABLE "platform_settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "president_name" TEXT NOT NULL DEFAULT 'Dr. Clifford Feingold, DDS',
    "president_title" TEXT NOT NULL DEFAULT 'President, American Association of Dental Boards',
    "signature_image_path" TEXT,
    "signature_image_mime" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_id" UUID,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "platform_settings" ADD CONSTRAINT "platform_settings_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
