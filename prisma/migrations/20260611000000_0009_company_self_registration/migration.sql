-- Self-serve company (CE provider) registration: companies created from the
-- /company/register form carry their own contact info, and company names are
-- unique (duplicates are rejected with a contact-AADB message). Live data was
-- checked for case-insensitive duplicate names before adding the constraint.
ALTER TABLE "public"."companies"
  ADD COLUMN "contact_email" TEXT,
  ADD COLUMN "contact_phone" TEXT,
  ADD COLUMN "address_line1" TEXT,
  ADD COLUMN "address_line2" TEXT,
  ADD COLUMN "city" TEXT,
  ADD COLUMN "state" CHAR(2),
  ADD COLUMN "zip" TEXT;

CREATE UNIQUE INDEX "companies_name_key" ON "public"."companies"("name");
