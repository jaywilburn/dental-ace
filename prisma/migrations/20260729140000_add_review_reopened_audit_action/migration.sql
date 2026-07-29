-- AlterEnum
-- Own migration: Postgres will not let a newly added enum value be USED in the
-- same transaction that adds it, and Prisma wraps each migration in one.
ALTER TYPE "AdminAuditAction" ADD VALUE 'REVIEW_REOPENED';
