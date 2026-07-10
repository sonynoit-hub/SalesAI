# SalesAI Implementation Plan

This plan turns the product and database notes into a practical build sequence.

Core workflow:

```text
Search companies -> research company -> save lead -> qualify lead -> generate email -> send Gmail -> track follow-up
```

## Guiding Rule

Build one complete sales loop before adding advanced features.

The first useful version should let the user:

1. Create or find a company.
2. Research the company.
3. Save it as a lead.
4. Qualify the lead.
5. Generate an email draft.
6. Send or record the email.
7. Create a follow-up task.

## Phase 0: Planning Foundation

Status: mostly complete.

Goals:

- Define product purpose.
- Define MVP workflow.
- Define database plan.
- Define agent/build rules.

Files:

- `README.md`
- `DESIGN.md`
- `DATABASE.md`
- `AGENTS.md`
- `IMPLEMENTATION_PLAN.md`

Acceptance checks:

- The MVP workflow is clear.
- The first data models are clear.
- Out-of-scope features are documented.

## Phase 1: App Scaffold

Goal: create the base Next.js application.

Tasks:

- Scaffold Next.js with TypeScript.
- Add Tailwind CSS.
- Add basic app layout.
- Add placeholder navigation for MVP pages.
- Add lint/build scripts.
- Add `.gitignore`.
- Add `.env.example`.

Planned pages:

- Lead Search
- Company Research
- Lead CRM
- Email Composer
- Outreach History
- Follow-up Tasks
- Settings

Acceptance checks:

- App starts with `npm run dev`.
- `npm run lint` passes.
- `npm run build` passes.
- Navigation can move between placeholder MVP pages.

Avoid:

- Building final UI polish too early.
- Adding auth or team accounts.
- Adding analytics dashboards.

## Phase 2: Database And Prisma

Goal: implement the MVP schema from `DATABASE.md`.

Tasks:

- Add Prisma.
- Configure PostgreSQL connection.
- Create `prisma/schema.prisma`.
- Add enums.
- Add models:
  - `Company`
  - `Contact`
  - `Lead`
  - `CompanyResearch`
  - `LeadQualification`
  - `EmailDraft`
  - `SentEmail`
  - `FollowUpTask`
  - `SearchResult`
- Create first migration.
- Add Prisma client helper.
- Add seed data for local testing.

Acceptance checks:

- Prisma migration runs.
- Prisma client generates.
- Seed command creates sample companies/leads.
- App can read sample leads from the database.

Avoid:

- Multi-user schema unless needed later.
- Soft-delete complexity in the first build.
- Vector search before basic CRUD works.

## Phase 3: Manual Lead Loop

Goal: build a complete workflow without external search, AI, or Gmail yet.

This phase proves the app structure before adding integrations.

Tasks:

- Create company manually.
- Create contact manually.
- Save company as a lead.
- Update lead status and priority.
- Add notes and tags.
- Create a manual company research record.
- Create a manual qualification record.
- Create a manual email draft.
- Record a sent email manually.
- Create a follow-up task.

Pages involved:

- Lead CRM
- Company Research
- Email Composer
- Outreach History
- Follow-up Tasks

Acceptance checks:

- A user can complete the whole workflow manually.
- Lead status changes are saved.
- Outreach history shows recorded sent emails.
- Follow-up page shows open and overdue tasks.

Avoid:

- Depending on AI before the workflow is usable.
- Depending on Gmail before email history works.

## Phase 4: Company Research Automation

Goal: research a company from its website URL.

Tasks:

- Add website fetch/crawl service.
- Extract page title, description, visible text, and key links.
- Store raw or summarized crawl output.
- Generate structured company research:
  - summary
  - products/services
  - target customers
  - pain points
  - sales opportunities
  - research sources
  - confidence score
- Save research to `CompanyResearch`.
- Update lead status to `researched` when appropriate.

Recommended tools:

- Playwright or Crawlee for crawling
- Ollama or OpenAI-compatible API for summarization

Acceptance checks:

- User enters a company website.
- App produces a structured research record.
- Research sources are visible.
- Failed research returns a clear error.

Avoid:

- Crawling too many pages at once.
- Scraping private or login-protected pages.
- Treating AI output as guaranteed fact.

## Phase 5: Lead Qualification

Goal: score and explain lead quality.

Tasks:

- Add qualification service.
- Score:
  - fit score
  - need score
  - contactability score
  - total score
- Assign rating:
  - cold
  - warm
  - hot
- Generate reasons, risks, and suggested approach.
- Save qualification history.
- Show latest qualification on lead detail and CRM list.
- Update lead status to `qualified` when appropriate.

Acceptance checks:

- A researched lead can be qualified.
- Qualification is stored as history.
- Lead CRM can show rating and score.
- User can understand why the score was assigned.

Avoid:

- Auto-deleting old qualification records.
- Overcomplicated scoring settings in MVP.

## Phase 6: Email Draft Generation

Goal: generate editable personalized outreach emails.

Tasks:

- Add email generation service.
- Use company, contact, latest research, and latest qualification as context.
- Generate subject and body.
- Support language:
  - English
  - Japanese
- Support tone:
  - friendly
  - professional
  - direct
- Save draft to `EmailDraft`.
- Allow user to edit before sending.
- Mark draft status as `approved`, `sent`, or `discarded`.

Acceptance checks:

- User can generate an email draft for a lead.
- Draft is personalized using company research.
- Draft can be edited and saved.
- No email is sent automatically without review.

Avoid:

- Fully automated bulk sending.
- Hardcoding one email style.

## Phase 7: Gmail Sending

Goal: send reviewed email drafts through Gmail.

Tasks:

- Add Gmail OAuth setup.
- Add Gmail connection page under Settings.
- Store local token securely for development.
- Send an approved draft through Gmail.
- Save Gmail message ID when available.
- Create `SentEmail` record.
- Mark `EmailDraft` as `sent`.
- Update lead status to `contacted`.
- Create default follow-up task after send.

Required environment variables:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `GOOGLE_GMAIL_SCOPE`

Acceptance checks:

- User can connect Gmail.
- User can send one reviewed email.
- Sent email appears in Outreach History.
- Lead status updates after successful send.
- A follow-up task is created.
- Failed send records a clear error.

Avoid:

- Mass email sending.
- Storing Gmail client secret in code.
- Sending without explicit user action.

## Phase 8: Public Lead Search

Goal: find candidate companies from public web sources.

Tasks:

- Add search form:
  - keyword
  - industry
  - location
  - optional service/problem terms
- Connect SearXNG.
- Store results in `SearchResult`.
- Allow saving a search result as a `Company`.
- Prevent obvious duplicate websites.
- Allow researching selected search results.

Acceptance checks:

- User can search for companies.
- Search results are stored.
- User can save selected result as a company.
- Saved company can enter the existing research/lead workflow.

Avoid:

- Private social scraping.
- Huge unattended search jobs.
- Saving every result automatically.

## Phase 9: Follow-Up Workflow Polish

Goal: make daily sales work easy.

Tasks:

- Show open follow-up tasks ordered by due date.
- Highlight overdue tasks.
- Let user mark task as done or skipped.
- Let user create a follow-up email draft from a task.
- Add basic lead activity summary using existing records.

Acceptance checks:

- User can see what needs attention today.
- Follow-up tasks link back to lead/company.
- Follow-up completion is saved.

Avoid:

- Full calendar integration.
- Complex automation rules.

## Phase 10: MVP Hardening

Goal: make the MVP reliable enough for daily local use.

Tasks:

- Improve empty states.
- Improve loading and error states.
- Add validation for forms and API inputs.
- Add duplicate company handling.
- Add safer URL normalization.
- Add basic tests for data services.
- Review secrets and local runtime storage.
- Run full lint/build verification.

Acceptance checks:

- `npm run lint` passes.
- `npm run build` passes.
- Main workflow works from start to finish.
- Errors are understandable.
- Local secrets are not committed.

Avoid:

- Large refactors without clear payoff.
- Adding major features before the MVP loop is stable.

## Recommended Build Order

Use this order once coding starts:

1. Scaffold app.
2. Add Prisma and database schema.
3. Build manual lead loop.
4. Add company research automation.
5. Add lead qualification.
6. Add email draft generation.
7. Add Gmail sending.
8. Add public lead search.
9. Polish follow-ups.
10. Harden MVP.

## First Coding Target

The first coding milestone should be:

```text
Manual company -> manual lead -> manual email draft -> manual sent email -> follow-up task
```

This creates a working sales CRM skeleton before external services are added.

## Definition Of MVP Done

The MVP is done when the user can:

1. Search or enter a company.
2. Research the company.
3. Save it as a lead.
4. Qualify the lead.
5. Generate and edit an email draft.
6. Send the email through Gmail.
7. See the sent email in outreach history.
8. See and complete the next follow-up task.
