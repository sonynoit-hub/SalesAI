-- Remove qualification/scoring data from the active SalesAI model.

UPDATE "leads"
SET "status" = 'researched'
WHERE "status" = 'qualified';

ALTER TYPE "lead_status" RENAME TO "lead_status_old";

CREATE TYPE "lead_status" AS ENUM (
  'new',
  'researched',
  'contacted',
  'replied',
  'follow_up',
  'meeting',
  'won',
  'lost'
);

ALTER TABLE "leads"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "lead_status" USING "status"::text::"lead_status",
  ALTER COLUMN "status" SET DEFAULT 'new';

DROP TYPE "lead_status_old";

DROP TABLE IF EXISTS "lead_qualifications";
DROP TYPE IF EXISTS "lead_rating";

ALTER TABLE "company_research" DROP COLUMN IF EXISTS "confidence_score";
ALTER TABLE "contacts" DROP COLUMN IF EXISTS "confidence_score";
ALTER TABLE "search_candidates" DROP COLUMN IF EXISTS "score";
ALTER TABLE "search_goals" DROP COLUMN IF EXISTS "auto_save_threshold";
ALTER TABLE "search_goals" RENAME COLUMN "target_lead_count" TO "target_company_count";
ALTER TABLE "search_goals" RENAME COLUMN "qualified_saved_count" TO "found_company_count";
