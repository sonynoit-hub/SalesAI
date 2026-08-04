CREATE TABLE IF NOT EXISTS "company_blocklist" (
  "id" TEXT NOT NULL,
  "normalized_domain" TEXT,
  "website_url" TEXT,
  "company_name" TEXT NOT NULL,
  "reason" TEXT NOT NULL DEFAULT 'not_a_fit',
  "source" TEXT NOT NULL DEFAULT 'manual',
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "company_blocklist_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "company_blocklist_normalized_domain_key"
  ON "company_blocklist"("normalized_domain");

CREATE INDEX IF NOT EXISTS "company_blocklist_company_name_idx"
  ON "company_blocklist"("company_name");
