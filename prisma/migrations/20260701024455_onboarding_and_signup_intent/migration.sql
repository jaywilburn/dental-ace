-- CreateEnum
CREATE TYPE "SignupIntent" AS ENUM ('INDIVIDUAL', 'COMPANY', 'STAFF');

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "onboarding_dismissed_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "signup_intent" "SignupIntent";
