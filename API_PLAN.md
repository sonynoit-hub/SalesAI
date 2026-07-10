# SalesAI API Plan

This document defines the planned MVP API structure for SalesAI.

The API should support this workflow:

```text
Search companies -> research company -> save lead -> qualify lead -> generate email -> send Gmail -> track follow-up
```

## 1. API Style

Use Next.js Route Handlers under `app/api/`.

Recommended conventions:

- Use JSON request and response bodies.
- Validate all request bodies before writing to the database.
- Keep route handlers thin.
- Put business logic in service modules under `lib/`.
- Put database access behind Prisma helpers or repository-style modules.
- Return clear error messages for expected user-facing failures.

Suggested service folders:

```text
lib/
  db/
  companies/
  contacts/
  leads/
  research/
  qualification/
  email-drafts/
  gmail/
  follow-ups/
  search/
  validation/
```

## 2. Response Shape

Use a consistent response shape.

Success:

```json
{
  "data": {}
}
```

List success:

```json
{
  "data": [],
  "meta": {
    "total": 0
  }
}
```

Error:

```json
{
  "error": {
    "message": "Human readable error",
    "code": "ERROR_CODE"
  }
}
```

## 3. Core CRUD APIs

### Companies

Base path:

```text
/api/companies
```

Routes:

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/companies` | List companies |
| POST | `/api/companies` | Create company manually or from search result |
| GET | `/api/companies/:companyId` | Get company detail |
| PATCH | `/api/companies/:companyId` | Update company |
| DELETE | `/api/companies/:companyId` | Delete company with confirmation later |

MVP fields for create:

```json
{
  "name": "Example Company",
  "websiteUrl": "https://example.com",
  "industry": "Manufacturing",
  "location": "Tokyo",
  "description": "Optional short note",
  "source": "manual",
  "sourceUrl": "https://example.com"
}
```

Notes:

- Normalize website URLs before duplicate checks.
- Do not auto-delete related sent email history casually.

### Contacts

Base path:

```text
/api/contacts
```

Routes:

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/contacts?companyId=...` | List contacts, optionally by company |
| POST | `/api/contacts` | Create contact |
| GET | `/api/contacts/:contactId` | Get contact detail |
| PATCH | `/api/contacts/:contactId` | Update contact |
| DELETE | `/api/contacts/:contactId` | Delete contact |

MVP fields for create:

```json
{
  "companyId": "uuid",
  "name": "Optional Name",
  "title": "IT Manager",
  "email": "person@example.com",
  "snsUrl": "https://example.com/profile",
  "sourceUrl": "https://example.com/about"
}
```

Notes:

- Contacts are optional in the first workflow.
- Company-level leads should work even without a contact.

### Leads

Base path:

```text
/api/leads
```

Routes:

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/leads` | List leads with company/contact summary |
| POST | `/api/leads` | Create lead from company/contact |
| GET | `/api/leads/:leadId` | Get lead detail |
| PATCH | `/api/leads/:leadId` | Update status, priority, notes, tags, contact |
| DELETE | `/api/leads/:leadId` | Delete lead with confirmation later |

Common query filters:

```text
status
priority
rating
industry
location
tag
q
```

MVP fields for create:

```json
{
  "companyId": "uuid",
  "contactId": "uuid",
  "status": "new",
  "priority": "medium",
  "tags": [],
  "notes": "Optional note"
}
```

Notes:

- The lead detail response should include company, contact, latest research, latest qualification, email drafts, sent emails, and follow-up tasks when practical.

## 4. Workflow APIs

### Company Research

Base path:

```text
/api/company-research
```

Routes:

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/company-research?companyId=...` | List research records for a company |
| POST | `/api/company-research` | Create manual research record |
| POST | `/api/company-research/run` | Run automated research for a company |
| GET | `/api/company-research/:researchId` | Get research detail |

Manual create request:

```json
{
  "companyId": "uuid",
  "summary": "Short company summary",
  "painPoints": ["Possible issue"],
  "salesOpportunities": ["Possible sales angle"],
  "researchSources": ["https://example.com"],
  "confidenceScore": 80
}
```

Run automated research request:

```json
{
  "companyId": "uuid",
  "websiteUrl": "https://example.com"
}
```

Notes:

- The automated route should use a service module for crawling and AI.
- Store research sources.
- If research succeeds, consider updating related lead status to `researched`.

### Lead Qualification

Base path:

```text
/api/lead-qualification
```

Routes:

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/lead-qualification?leadId=...` | List qualification history |
| POST | `/api/lead-qualification` | Create manual qualification |
| POST | `/api/lead-qualification/run` | Generate qualification from latest research |
| GET | `/api/lead-qualification/:qualificationId` | Get qualification detail |

Manual create request:

```json
{
  "leadId": "uuid",
  "fitScore": 80,
  "needScore": 70,
  "contactabilityScore": 60,
  "totalScore": 70,
  "rating": "warm",
  "reasons": ["Good industry fit"],
  "risks": ["No known contact yet"],
  "suggestedApproach": "Start with business efficiency angle."
}
```

Run qualification request:

```json
{
  "leadId": "uuid"
}
```

Notes:

- Store every qualification as history.
- If qualification succeeds, consider updating lead status to `qualified`.

### Email Drafts

Base path:

```text
/api/email-drafts
```

Routes:

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/email-drafts?leadId=...` | List drafts for a lead |
| POST | `/api/email-drafts` | Create manual email draft |
| POST | `/api/email-drafts/generate` | Generate draft from lead context |
| GET | `/api/email-drafts/:draftId` | Get draft detail |
| PATCH | `/api/email-drafts/:draftId` | Update subject, body, tone, language, status |
| DELETE | `/api/email-drafts/:draftId` | Delete or discard draft |

Generate request:

```json
{
  "leadId": "uuid",
  "contactId": "uuid",
  "tone": "professional",
  "language": "en"
}
```

Notes:

- Generated drafts must be editable before sending.
- Do not send from this route.

### Sent Emails And Outreach History

Base path:

```text
/api/outreach
```

Routes:

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/outreach/sent-emails` | List sent email records |
| POST | `/api/outreach/sent-emails` | Manually record a sent email |
| GET | `/api/outreach/sent-emails/:sentEmailId` | Get sent email detail |

Manual record request:

```json
{
  "leadId": "uuid",
  "contactId": "uuid",
  "emailDraftId": "uuid",
  "toEmail": "person@example.com",
  "subject": "Hello",
  "body": "Email body",
  "status": "sent"
}
```

Notes:

- Sent email records should be treated as audit history.
- Gmail sending should create records here after success or failure.

### Follow-Ups

Base path:

```text
/api/follow-ups
```

Routes:

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/follow-ups` | List follow-up tasks |
| POST | `/api/follow-ups` | Create follow-up task |
| GET | `/api/follow-ups/:taskId` | Get task detail |
| PATCH | `/api/follow-ups/:taskId` | Update task, mark done/skipped |
| DELETE | `/api/follow-ups/:taskId` | Delete task |

Common filters:

```text
status
leadId
dueBefore
dueAfter
overdue
```

Create request:

```json
{
  "leadId": "uuid",
  "sentEmailId": "uuid",
  "title": "Follow up with Example Company",
  "dueDate": "2026-07-07T09:00:00.000Z",
  "notes": "Check whether they replied."
}
```

Notes:

- The default follow-up after Gmail send can be created automatically.

## 5. Integration APIs

### Public Search

Base path:

```text
/api/search
```

Routes:

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/search/companies` | Search public web sources for companies |
| GET | `/api/search/results` | List stored search results |
| POST | `/api/search/results/:resultId/save-company` | Save result as company |

Search request:

```json
{
  "query": "manufacturing companies Tokyo IT support",
  "industry": "Manufacturing",
  "location": "Tokyo"
}
```

Notes:

- SearXNG should be isolated in `lib/search/`.
- Do not scrape private or login-protected social pages.
- Do not automatically save every result.

### Gmail

Base path:

```text
/api/gmail
```

Routes:

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/gmail/status` | Check Gmail connection status |
| GET | `/api/gmail/auth-url` | Create OAuth authorization URL |
| GET | `/api/gmail/callback` | Handle OAuth callback |
| POST | `/api/gmail/send` | Send an approved email draft |
| POST | `/api/gmail/disconnect` | Remove local Gmail token |

Send request:

```json
{
  "emailDraftId": "uuid",
  "toEmail": "person@example.com"
}
```

Notes:

- Use `.env.local` for Google client configuration.
- Store Gmail token outside committed files.
- Sending must be an explicit user action.
- After successful send:
  - create `SentEmail`
  - mark draft as `sent`
  - update lead status to `contacted`
  - create default follow-up task

## 6. Route Implementation Order

Implement APIs in this order:

### Step 1: Manual CRM

```text
/api/companies
/api/contacts
/api/leads
/api/follow-ups
```

Purpose:

- Create the manual lead loop.
- Verify database relationships.

### Step 2: Manual Email History

```text
/api/email-drafts
/api/outreach/sent-emails
```

Purpose:

- Draft and record outreach without Gmail.

### Step 3: AI Workflow

```text
/api/company-research
/api/company-research/run
/api/lead-qualification
/api/lead-qualification/run
/api/email-drafts/generate
```

Purpose:

- Add research, scoring, and email generation.

### Step 4: Integrations

```text
/api/gmail/*
/api/search/*
```

Purpose:

- Add Gmail sending and public company search after the manual workflow works.

## 7. Validation Notes

Use schema validation for request bodies.

Recommended validation rules:

- IDs must be valid UUIDs.
- URLs must be valid URLs.
- Email addresses must be valid email format.
- Scores must be integers between 0 and 100.
- Enum values must match `DATABASE.md`.
- Required fields must be present.
- Free-text fields should have reasonable max lengths.

## 8. Error Codes

Recommended starter error codes:

```text
VALIDATION_ERROR
NOT_FOUND
DUPLICATE_COMPANY
SEARCH_FAILED
RESEARCH_FAILED
QUALIFICATION_FAILED
EMAIL_GENERATION_FAILED
GMAIL_NOT_CONNECTED
GMAIL_SEND_FAILED
DATABASE_ERROR
```

## 9. MVP API Done Criteria

The API plan is implemented enough for MVP when:

1. The UI can create and update companies, contacts, leads, drafts, sent emails, and follow-ups.
2. The UI can run company research and save the result.
3. The UI can qualify a lead and save the score.
4. The UI can generate an editable email draft.
5. The UI can send an approved draft through Gmail.
6. The UI can search public company sources and save selected companies.
7. The full workflow works from company search to follow-up task.
