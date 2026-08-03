ALTER TABLE "companies" ADD COLUMN "primary_email" TEXT;
ALTER TABLE "companies" ADD COLUMN "contact_form_url" TEXT;

UPDATE "companies"
SET "primary_email" = company_contacts."email"
FROM (
    SELECT DISTINCT ON ("company_id")
        "company_id",
        "email"
    FROM "contacts"
    WHERE "email" IS NOT NULL
      AND "name" IS NULL
      AND "title" IS NULL
    ORDER BY "company_id", "updated_at" DESC
) AS company_contacts
WHERE "companies"."id" = company_contacts."company_id"
  AND "companies"."primary_email" IS NULL;

CREATE INDEX "companies_primary_email_idx" ON "companies"("primary_email");
