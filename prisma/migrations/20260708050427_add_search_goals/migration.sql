-- CreateEnum
CREATE TYPE "search_goal_status" AS ENUM ('running', 'completed', 'partial', 'failed');

-- AlterTable
ALTER TABLE "search_runs" ADD COLUMN     "search_goal_id" TEXT;

-- CreateTable
CREATE TABLE "search_goals" (
    "id" TEXT NOT NULL,
    "opportunity_description" TEXT NOT NULL,
    "industry" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "target_lead_count" INTEGER NOT NULL,
    "qualified_saved_count" INTEGER NOT NULL DEFAULT 0,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "status" "search_goal_status" NOT NULL DEFAULT 'running',
    "auto_save_threshold" INTEGER NOT NULL DEFAULT 70,
    "diagnostics" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "search_goals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "search_goals_created_at_idx" ON "search_goals"("created_at");

-- CreateIndex
CREATE INDEX "search_goals_status_idx" ON "search_goals"("status");

-- CreateIndex
CREATE INDEX "search_goals_industry_idx" ON "search_goals"("industry");

-- CreateIndex
CREATE INDEX "search_goals_location_idx" ON "search_goals"("location");

-- CreateIndex
CREATE INDEX "search_runs_search_goal_id_idx" ON "search_runs"("search_goal_id");

-- AddForeignKey
ALTER TABLE "search_runs" ADD CONSTRAINT "search_runs_search_goal_id_fkey" FOREIGN KEY ("search_goal_id") REFERENCES "search_goals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
