-- CreateEnum
CREATE TYPE "company_source" AS ENUM ('search', 'manual', 'import');

-- CreateEnum
CREATE TYPE "search_source" AS ENUM ('searxng', 'manual', 'sns', 'directory');

-- CreateEnum
CREATE TYPE "lead_status" AS ENUM ('new', 'researched', 'qualified', 'contacted', 'replied', 'follow_up', 'meeting', 'won', 'lost');

-- CreateEnum
CREATE TYPE "lead_priority" AS ENUM ('low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "lead_rating" AS ENUM ('cold', 'warm', 'hot');

-- CreateEnum
CREATE TYPE "email_tone" AS ENUM ('friendly', 'professional', 'direct');

-- CreateEnum
CREATE TYPE "email_language" AS ENUM ('en', 'ja');

-- CreateEnum
CREATE TYPE "email_draft_status" AS ENUM ('draft', 'approved', 'sent', 'discarded');

-- CreateEnum
CREATE TYPE "sent_email_status" AS ENUM ('sent', 'failed');

-- CreateEnum
CREATE TYPE "follow_up_status" AS ENUM ('open', 'done', 'skipped');

-- CreateEnum
CREATE TYPE "search_candidate_status" AS ENUM ('raw', 'verified', 'removed', 'duplicate', 'seen', 'saved');

-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "website_url" TEXT NOT NULL,
    "canonical_website_url" TEXT,
    "normalized_domain" TEXT,
    "company_key" TEXT,
    "industry" TEXT,
    "location" TEXT,
    "size" TEXT,
    "description" TEXT,
    "source" "company_source" NOT NULL DEFAULT 'manual',
    "source_url" TEXT,
    "seen_count" INTEGER NOT NULL DEFAULT 0,
    "last_seen_at" TIMESTAMP(3),
    "saved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_research" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "products_or_services" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "target_customers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "pain_points" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sales_opportunities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "technologies" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "recent_signals" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "research_sources" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "confidence_score" INTEGER NOT NULL DEFAULT 0,
    "raw_content" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_research_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" TEXT,
    "title" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "sns_url" TEXT,
    "source_url" TEXT,
    "confidence_score" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "contact_id" TEXT,
    "status" "lead_status" NOT NULL DEFAULT 'new',
    "priority" "lead_priority" NOT NULL DEFAULT 'medium',
    "owner" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_qualifications" (
    "id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "fit_score" INTEGER NOT NULL DEFAULT 0,
    "need_score" INTEGER NOT NULL DEFAULT 0,
    "contactability_score" INTEGER NOT NULL DEFAULT 0,
    "total_score" INTEGER NOT NULL DEFAULT 0,
    "rating" "lead_rating" NOT NULL,
    "reasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "risks" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "suggested_approach" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_qualifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_drafts" (
    "id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "contact_id" TEXT,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "tone" "email_tone" NOT NULL DEFAULT 'professional',
    "language" "email_language" NOT NULL DEFAULT 'en',
    "status" "email_draft_status" NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sent_emails" (
    "id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "contact_id" TEXT,
    "email_draft_id" TEXT,
    "gmail_message_id" TEXT,
    "to_email" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "sent_email_status" NOT NULL,
    "error_message" TEXT,

    CONSTRAINT "sent_emails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "follow_up_tasks" (
    "id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "sent_email_id" TEXT,
    "title" TEXT NOT NULL,
    "due_date" TIMESTAMP(3) NOT NULL,
    "status" "follow_up_status" NOT NULL DEFAULT 'open',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "follow_up_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "search_results" (
    "id" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "company_name" TEXT NOT NULL,
    "website_url" TEXT,
    "snippet" TEXT,
    "source" "search_source" NOT NULL,
    "source_url" TEXT NOT NULL,
    "saved_as_company_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "search_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "search_runs" (
    "id" TEXT NOT NULL,
    "opportunity_description" TEXT NOT NULL,
    "industry" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "result_limit" INTEGER NOT NULL,
    "search_plan" JSONB NOT NULL,
    "search_queries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "diagnostics" JSONB,
    "duration_ms" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "search_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "search_candidates" (
    "id" TEXT NOT NULL,
    "search_run_id" TEXT NOT NULL,
    "company_id" TEXT,
    "company_name" TEXT NOT NULL,
    "website_url" TEXT NOT NULL,
    "about_url" TEXT,
    "normalized_domain" TEXT,
    "company_key" TEXT,
    "source" TEXT,
    "status" "search_candidate_status" NOT NULL DEFAULT 'raw',
    "removed_reason" TEXT,
    "score" INTEGER NOT NULL DEFAULT 0,
    "evidence" JSONB,
    "sales_brief" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "search_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "companies_website_url_key" ON "companies"("website_url");

-- CreateIndex
CREATE UNIQUE INDEX "companies_normalized_domain_key" ON "companies"("normalized_domain");

-- CreateIndex
CREATE INDEX "companies_name_idx" ON "companies"("name");

-- CreateIndex
CREATE INDEX "companies_company_key_idx" ON "companies"("company_key");

-- CreateIndex
CREATE INDEX "companies_industry_idx" ON "companies"("industry");

-- CreateIndex
CREATE INDEX "companies_location_idx" ON "companies"("location");

-- CreateIndex
CREATE INDEX "companies_last_seen_at_idx" ON "companies"("last_seen_at");

-- CreateIndex
CREATE INDEX "company_research_company_id_idx" ON "company_research"("company_id");

-- CreateIndex
CREATE INDEX "company_research_created_at_idx" ON "company_research"("created_at");

-- CreateIndex
CREATE INDEX "contacts_company_id_idx" ON "contacts"("company_id");

-- CreateIndex
CREATE INDEX "contacts_email_idx" ON "contacts"("email");

-- CreateIndex
CREATE UNIQUE INDEX "contacts_company_id_email_key" ON "contacts"("company_id", "email");

-- CreateIndex
CREATE INDEX "leads_company_id_idx" ON "leads"("company_id");

-- CreateIndex
CREATE INDEX "leads_contact_id_idx" ON "leads"("contact_id");

-- CreateIndex
CREATE INDEX "leads_status_idx" ON "leads"("status");

-- CreateIndex
CREATE INDEX "leads_priority_idx" ON "leads"("priority");

-- CreateIndex
CREATE INDEX "leads_updated_at_idx" ON "leads"("updated_at");

-- CreateIndex
CREATE INDEX "lead_qualifications_lead_id_idx" ON "lead_qualifications"("lead_id");

-- CreateIndex
CREATE INDEX "lead_qualifications_rating_idx" ON "lead_qualifications"("rating");

-- CreateIndex
CREATE INDEX "lead_qualifications_total_score_idx" ON "lead_qualifications"("total_score");

-- CreateIndex
CREATE INDEX "lead_qualifications_created_at_idx" ON "lead_qualifications"("created_at");

-- CreateIndex
CREATE INDEX "email_drafts_lead_id_idx" ON "email_drafts"("lead_id");

-- CreateIndex
CREATE INDEX "email_drafts_contact_id_idx" ON "email_drafts"("contact_id");

-- CreateIndex
CREATE INDEX "email_drafts_status_idx" ON "email_drafts"("status");

-- CreateIndex
CREATE INDEX "email_drafts_updated_at_idx" ON "email_drafts"("updated_at");

-- CreateIndex
CREATE INDEX "sent_emails_lead_id_idx" ON "sent_emails"("lead_id");

-- CreateIndex
CREATE INDEX "sent_emails_contact_id_idx" ON "sent_emails"("contact_id");

-- CreateIndex
CREATE INDEX "sent_emails_email_draft_id_idx" ON "sent_emails"("email_draft_id");

-- CreateIndex
CREATE INDEX "sent_emails_gmail_message_id_idx" ON "sent_emails"("gmail_message_id");

-- CreateIndex
CREATE INDEX "sent_emails_sent_at_idx" ON "sent_emails"("sent_at");

-- CreateIndex
CREATE INDEX "sent_emails_status_idx" ON "sent_emails"("status");

-- CreateIndex
CREATE INDEX "follow_up_tasks_lead_id_idx" ON "follow_up_tasks"("lead_id");

-- CreateIndex
CREATE INDEX "follow_up_tasks_sent_email_id_idx" ON "follow_up_tasks"("sent_email_id");

-- CreateIndex
CREATE INDEX "follow_up_tasks_due_date_idx" ON "follow_up_tasks"("due_date");

-- CreateIndex
CREATE INDEX "follow_up_tasks_status_idx" ON "follow_up_tasks"("status");

-- CreateIndex
CREATE INDEX "search_results_query_idx" ON "search_results"("query");

-- CreateIndex
CREATE INDEX "search_results_website_url_idx" ON "search_results"("website_url");

-- CreateIndex
CREATE INDEX "search_results_source_idx" ON "search_results"("source");

-- CreateIndex
CREATE INDEX "search_results_created_at_idx" ON "search_results"("created_at");

-- CreateIndex
CREATE INDEX "search_results_saved_as_company_id_idx" ON "search_results"("saved_as_company_id");

-- CreateIndex
CREATE INDEX "search_runs_created_at_idx" ON "search_runs"("created_at");

-- CreateIndex
CREATE INDEX "search_runs_industry_idx" ON "search_runs"("industry");

-- CreateIndex
CREATE INDEX "search_runs_location_idx" ON "search_runs"("location");

-- CreateIndex
CREATE INDEX "search_candidates_search_run_id_idx" ON "search_candidates"("search_run_id");

-- CreateIndex
CREATE INDEX "search_candidates_company_id_idx" ON "search_candidates"("company_id");

-- CreateIndex
CREATE INDEX "search_candidates_normalized_domain_idx" ON "search_candidates"("normalized_domain");

-- CreateIndex
CREATE INDEX "search_candidates_company_key_idx" ON "search_candidates"("company_key");

-- CreateIndex
CREATE INDEX "search_candidates_status_idx" ON "search_candidates"("status");

-- CreateIndex
CREATE INDEX "search_candidates_created_at_idx" ON "search_candidates"("created_at");

-- AddForeignKey
ALTER TABLE "company_research" ADD CONSTRAINT "company_research_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_qualifications" ADD CONSTRAINT "lead_qualifications_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_drafts" ADD CONSTRAINT "email_drafts_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_drafts" ADD CONSTRAINT "email_drafts_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sent_emails" ADD CONSTRAINT "sent_emails_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sent_emails" ADD CONSTRAINT "sent_emails_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sent_emails" ADD CONSTRAINT "sent_emails_email_draft_id_fkey" FOREIGN KEY ("email_draft_id") REFERENCES "email_drafts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_up_tasks" ADD CONSTRAINT "follow_up_tasks_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_up_tasks" ADD CONSTRAINT "follow_up_tasks_sent_email_id_fkey" FOREIGN KEY ("sent_email_id") REFERENCES "sent_emails"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_results" ADD CONSTRAINT "search_results_saved_as_company_id_fkey" FOREIGN KEY ("saved_as_company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_candidates" ADD CONSTRAINT "search_candidates_search_run_id_fkey" FOREIGN KEY ("search_run_id") REFERENCES "search_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_candidates" ADD CONSTRAINT "search_candidates_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
