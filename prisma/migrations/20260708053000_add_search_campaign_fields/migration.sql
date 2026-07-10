-- AlterTable
ALTER TABLE "search_goals" ADD COLUMN "reference_keyword" TEXT;
ALTER TABLE "search_goals" ADD COLUMN "exclude_keywords" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "search_goals" ADD COLUMN "generated_angles" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "search_goals" ADD COLUMN "generated_queries" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "search_candidates" ADD COLUMN "search_goal_id" TEXT;
ALTER TABLE "search_candidates" ADD COLUMN "query_used" TEXT;

-- CreateIndex
CREATE INDEX "search_candidates_search_goal_id_idx" ON "search_candidates"("search_goal_id");

-- AddForeignKey
ALTER TABLE "search_candidates" ADD CONSTRAINT "search_candidates_search_goal_id_fkey" FOREIGN KEY ("search_goal_id") REFERENCES "search_goals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
