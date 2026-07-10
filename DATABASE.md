# SalesAI Database Plan

This document defines the planned MVP database structure for SalesAI.

The database should support this workflow:

```text
Search companies -> research company -> save lead -> qualify lead -> generate email -> send Gmail -> track follow-up
```

## 1. Database Choice

Use PostgreSQL for the main application database.

Recommended app data layer:

- PostgreSQL for persisted data
- Prisma for schema, migrations, and typed queries
- Optional `pgvector` later if semantic search over company research becomes important

## 2. Design Principles

- Keep the MVP schema small but relational.
- Store sales workflow state on `Lead`, not `Company`.
- Allow one company to have multiple contacts and leads.
- Allow lead qualification and company research to be regenerated over time.
- Keep sent email records immutable after send.
- Store Gmail OAuth tokens outside normal business tables, preferably encrypted or in local runtime storage during early development.
- Do not store secrets in the database unless encryption is planned.

## 3. Enum Values

### CompanySource

```text
search
manual
import
```

### SearchSource

```text
searxng
manual
sns
directory
```

### LeadStatus

```text
new
researched
qualified
contacted
replied
follow_up
meeting
won
lost
```

### LeadPriority

```text
low
medium
high
```

### LeadRating

```text
cold
warm
hot
```

### EmailTone

```text
friendly
professional
direct
```

### EmailLanguage

```text
en
ja
```

### EmailDraftStatus

```text
draft
approved
sent
discarded
```

### SentEmailStatus

```text
sent
failed
```

### FollowUpStatus

```text
open
done
skipped
```

## 4. Tables

### companies

Stores organizations that may become customers.

| Field | Type | Required | Notes |
|---|---:|---:|---|
| id | uuid | yes | Primary key |
| name | text | yes | Company name |
| website_url | text | yes | Main website URL |
| industry | text | no | Example: healthcare, manufacturing, SaaS |
| location | text | no | City, region, or country |
| size | text | no | Free text for MVP, maybe enum later |
| description | text | no | Short company description |
| source | CompanySource | yes | `search`, `manual`, or `import` |
| source_url | text | no | Search result or directory URL |
| created_at | timestamp | yes | Created time |
| updated_at | timestamp | yes | Last update time |

Recommended constraints:

- Unique normalized `website_url` when possible.
- Index `name`.
- Index `industry`.
- Index `location`.

MVP required fields:

```text
name, website_url, source
```

### company_research

Stores AI/web research snapshots for a company.

| Field | Type | Required | Notes |
|---|---:|---:|---|
| id | uuid | yes | Primary key |
| company_id | uuid | yes | Foreign key to `companies.id` |
| summary | text | yes | Main company summary |
| products_or_services | text[] or jsonb | yes | What the company sells |
| target_customers | text[] or jsonb | yes | Who the company serves |
| pain_points | text[] or jsonb | yes | Possible business/IT pain points |
| sales_opportunities | text[] or jsonb | yes | Possible ways to sell IT services |
| technologies | text[] or jsonb | no | Detected tools/platforms |
| recent_signals | text[] or jsonb | no | News, hiring, expansion, etc. |
| research_sources | text[] or jsonb | yes | URLs used for research |
| confidence_score | integer | yes | 0-100 |
| raw_content | jsonb | no | Optional crawled/extracted data |
| created_at | timestamp | yes | Created time |

Recommended constraints:

- `confidence_score` should be between 0 and 100.
- Index `company_id`.
- Index `created_at`.

MVP required fields:

```text
company_id, summary, pain_points, sales_opportunities, research_sources, confidence_score
```

### contacts

Stores people connected to a company.

| Field | Type | Required | Notes |
|---|---:|---:|---|
| id | uuid | yes | Primary key |
| company_id | uuid | yes | Foreign key to `companies.id` |
| name | text | no | Contact name |
| title | text | no | Job title |
| email | text | no | Email address |
| phone | text | no | Phone number |
| sns_url | text | no | Public SNS/profile URL |
| source_url | text | no | Where the contact was found |
| confidence_score | integer | no | 0-100 |
| created_at | timestamp | yes | Created time |
| updated_at | timestamp | yes | Last update time |

Recommended constraints:

- Index `company_id`.
- Index `email`.
- Optional unique pair: `company_id + email` where email exists.

MVP required fields:

```text
company_id
```

For v1, contacts may be incomplete. The app should still support company-level leads when no person is known yet.

### leads

Stores the active sales opportunity.

| Field | Type | Required | Notes |
|---|---:|---:|---|
| id | uuid | yes | Primary key |
| company_id | uuid | yes | Foreign key to `companies.id` |
| contact_id | uuid | no | Optional foreign key to `contacts.id` |
| status | LeadStatus | yes | Current pipeline state |
| priority | LeadPriority | yes | Sales priority |
| owner | text | no | Owner name/email for future team support |
| tags | text[] or jsonb | yes | Simple labels |
| notes | text | no | Manual notes |
| created_at | timestamp | yes | Created time |
| updated_at | timestamp | yes | Last update time |

Recommended constraints:

- Index `company_id`.
- Index `contact_id`.
- Index `status`.
- Index `priority`.
- Index `updated_at`.

MVP required fields:

```text
company_id, status, priority, tags
```

Default values:

```text
status = new
priority = medium
tags = []
```

### lead_qualifications

Stores scoring history for a lead.

| Field | Type | Required | Notes |
|---|---:|---:|---|
| id | uuid | yes | Primary key |
| lead_id | uuid | yes | Foreign key to `leads.id` |
| fit_score | integer | yes | 0-100 |
| need_score | integer | yes | 0-100 |
| contactability_score | integer | yes | 0-100 |
| total_score | integer | yes | 0-100 |
| rating | LeadRating | yes | `cold`, `warm`, or `hot` |
| reasons | text[] or jsonb | yes | Why this lead is rated this way |
| risks | text[] or jsonb | yes | Concerns or blockers |
| suggested_approach | text | no | Sales angle |
| created_at | timestamp | yes | Created time |

Recommended constraints:

- All score fields should be between 0 and 100.
- Index `lead_id`.
- Index `rating`.
- Index `total_score`.
- Index `created_at`.

MVP required fields:

```text
lead_id, total_score, rating, reasons
```

Use multiple rows instead of overwriting so the app can show how qualification changed over time.

### email_drafts

Stores generated outreach emails before sending.

| Field | Type | Required | Notes |
|---|---:|---:|---|
| id | uuid | yes | Primary key |
| lead_id | uuid | yes | Foreign key to `leads.id` |
| contact_id | uuid | no | Optional foreign key to `contacts.id` |
| subject | text | yes | Email subject |
| body | text | yes | Email body |
| tone | EmailTone | yes | Email style |
| language | EmailLanguage | yes | Email language |
| status | EmailDraftStatus | yes | Draft lifecycle |
| created_at | timestamp | yes | Created time |
| updated_at | timestamp | yes | Last update time |

Recommended constraints:

- Index `lead_id`.
- Index `contact_id`.
- Index `status`.
- Index `updated_at`.

MVP required fields:

```text
lead_id, subject, body, language, status
```

Default values:

```text
tone = professional
language = en
status = draft
```

### sent_emails

Stores Gmail sending history.

Sent email rows should be treated as immutable audit records. If a follow-up email is sent, create a new row.

| Field | Type | Required | Notes |
|---|---:|---:|---|
| id | uuid | yes | Primary key |
| lead_id | uuid | yes | Foreign key to `leads.id` |
| contact_id | uuid | no | Optional foreign key to `contacts.id` |
| email_draft_id | uuid | no | Optional foreign key to `email_drafts.id` |
| gmail_message_id | text | no | Gmail API message ID |
| to_email | text | yes | Recipient address |
| subject | text | yes | Sent subject |
| body | text | yes | Sent body |
| sent_at | timestamp | yes | Send attempt time |
| status | SentEmailStatus | yes | `sent` or `failed` |
| error_message | text | no | Failure detail if any |

Recommended constraints:

- Index `lead_id`.
- Index `contact_id`.
- Index `email_draft_id`.
- Index `gmail_message_id`.
- Index `sent_at`.
- Index `status`.

MVP required fields:

```text
lead_id, to_email, subject, body, sent_at, status
```

### follow_up_tasks

Stores future sales tasks.

| Field | Type | Required | Notes |
|---|---:|---:|---|
| id | uuid | yes | Primary key |
| lead_id | uuid | yes | Foreign key to `leads.id` |
| sent_email_id | uuid | no | Optional foreign key to `sent_emails.id` |
| title | text | yes | Task title |
| due_date | timestamp | yes | When to follow up |
| status | FollowUpStatus | yes | `open`, `done`, or `skipped` |
| notes | text | no | Manual notes |
| created_at | timestamp | yes | Created time |
| updated_at | timestamp | yes | Last update time |

Recommended constraints:

- Index `lead_id`.
- Index `sent_email_id`.
- Index `due_date`.
- Index `status`.

MVP required fields:

```text
lead_id, title, due_date, status
```

Default values:

```text
status = open
```

### search_results

Stores company search results before the user saves them as companies.

| Field | Type | Required | Notes |
|---|---:|---:|---|
| id | uuid | yes | Primary key |
| query | text | yes | Original search query |
| company_name | text | yes | Search result company name |
| website_url | text | no | Candidate website |
| snippet | text | no | Search result text |
| source | SearchSource | yes | Search provider/type |
| source_url | text | yes | Result URL |
| saved_as_company_id | uuid | no | Foreign key to `companies.id` after save |
| created_at | timestamp | yes | Created time |

Recommended constraints:

- Index `query`.
- Index `website_url`.
- Index `source`.
- Index `created_at`.
- Index `saved_as_company_id`.

MVP required fields:

```text
query, company_name, source, source_url
```

## 5. Relationship Summary

```text
companies
  -> contacts
  -> company_research
  -> leads

leads
  -> lead_qualifications
  -> email_drafts
  -> sent_emails
  -> follow_up_tasks

contacts
  -> leads
  -> email_drafts
  -> sent_emails

search_results
  -> optionally links to companies after save
```

## 6. Delete Behavior

Recommended MVP behavior:

- Deleting a company should be rare and require confirmation.
- If a company is deleted, related leads, contacts, research, drafts, sent emails, and follow-up tasks should be deleted with it only if the user confirms.
- Sent email records should not be casually deleted because they are sales history.

Recommended Prisma relation behavior:

- `Company -> Contact`: cascade delete is acceptable for MVP.
- `Company -> CompanyResearch`: cascade delete is acceptable for MVP.
- `Company -> Lead`: cascade delete only if delete confirmation is explicit.
- `Lead -> EmailDraft`: cascade delete is acceptable before sending.
- `Lead -> SentEmail`: prefer restrict or soft delete later.
- `Lead -> FollowUpTask`: cascade delete is acceptable for MVP.

For MVP simplicity, hard deletes are acceptable, but add a later improvement for soft deletes:

```text
deleted_at timestamp nullable
```

## 7. MVP Query Needs

The schema should support these common queries:

### Lead Search Page

- List recent search results.
- Save a search result as a company.
- Avoid saving duplicate websites when possible.

### Company Research Page

- Load a company by website URL.
- Show latest research for a company.
- Show research history later.

### Lead CRM Page

- List leads by status.
- Filter leads by priority, rating, tag, industry, and location.
- Show company, contact, latest qualification, and next follow-up.

### Email Composer Page

- Load lead, company, contact, latest research, and latest qualification.
- Save generated draft.
- Mark draft as sent after Gmail send succeeds.

### Outreach History Page

- List sent emails by date.
- Filter by lead, company, contact, and status.

### Follow-up Tasks Page

- List open tasks ordered by due date.
- Show overdue tasks.
- Mark task done or skipped.

## 8. Later Additions

These are useful but should wait until the MVP workflow works:

- `users` table for multi-user/team support
- `accounts` or `workspaces` for SaaS structure
- `email_threads` for Gmail reply sync
- `email_events` for opens/clicks if tracking is added
- `lead_activity` event log for timeline view
- `saved_searches` for recurring searches
- `ai_jobs` for background research and generation jobs
- `attachments` for proposals or files
- `deleted_at` soft delete fields
- `pgvector` embeddings for semantic research search

## 9. Prisma Naming Recommendation

Use Prisma model names in PascalCase and map them to snake_case table names if desired.

Example:

```prisma
model Company {
  id         String   @id @default(uuid())
  name       String
  websiteUrl String   @unique
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@map("companies")
}
```

Recommended model names:

- `Company`
- `CompanyResearch`
- `Contact`
- `Lead`
- `LeadQualification`
- `EmailDraft`
- `SentEmail`
- `FollowUpTask`
- `SearchResult`

## 10. First Implementation Order

Build the schema in this order:

1. Enums
2. `Company`
3. `Contact`
4. `Lead`
5. `CompanyResearch`
6. `LeadQualification`
7. `EmailDraft`
8. `SentEmail`
9. `FollowUpTask`
10. `SearchResult`

Then build the first app workflow:

```text
Create company manually -> research company -> create lead -> qualify lead -> generate email draft -> record sent email -> create follow-up task
```

After that works, add public web search through SearXNG.
