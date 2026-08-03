# SalesAI Design Structure Note

## 1. App Purpose

SalesAI helps an IT salesperson find potential customers from public web sources, research those companies, generate personalized outreach, send emails through Gmail, and track replies and follow-up work.

The app should focus on one practical AI-assisted outreach workflow first, not a large enterprise CRM. Lead and research records are internal system memory; the primary user experience should feel like an AI outreach queue.

## 2. Target User

- IT salesperson
- Solo sales operator
- Small IT service business
- Founder doing outbound sales

## 3. Core MVP Workflow

The first version of the app focuses on this workflow:

1. Search companies from public web sources.
2. Research each company website and collect useful sales context.
3. Confirm the active outreach contact for the company.
4. Generate a personalized outreach email draft.
5. Review, approve, and send through Gmail or a manual send step.
6. Track sent emails, lead status, and follow-up reminders.

Short version:

```text
Search companies -> research -> contact ready -> draft -> approve/send -> follow up
```

Internal workflow:

```text
Company -> CompanyResearch -> Contact -> Lead -> EmailDraft -> SentEmail -> FollowUpTask
```

## 4. Main Pages

- Lead Search
- Companies / AI Outreach Queue
- Company Research
- Lead CRM
- Email Composer
- Outreach History
- Follow-up Tasks
- Settings

## 5. Lead Status

Leads should move through a simple pipeline:

```text
New -> Researched -> Qualified -> Contacted -> Replied -> Follow Up -> Meeting -> Won / Lost
```

Recommended status values:

- `new`
- `researched`
- `qualified`
- `contacted`
- `replied`
- `follow_up`
- `meeting`
- `won`
- `lost`

In the UI, lead statuses may be grouped into outreach-oriented AI states:

- `Needs research`
- `Contact ready`
- `Needs draft`
- `Draft ready`
- `Approved`
- `Sent`
- `Follow-up due`
- `Closed`

## 6. Data Models

### Company

Stores the organization the salesperson may sell to.

```ts
type Company = {
  id: string;
  name: string;
  websiteUrl: string;
  industry?: string;
  location?: string;
  size?: string;
  description?: string;
  source: "search" | "manual" | "import";
  sourceUrl?: string;
  createdAt: string;
  updatedAt: string;
};
```

### CompanyResearch

Stores AI and web research about a company.

```ts
type CompanyResearch = {
  id: string;
  companyId: string;
  summary: string;
  productsOrServices: string[];
  targetCustomers: string[];
  painPoints: string[];
  salesOpportunities: string[];
  technologies?: string[];
  recentSignals?: string[];
  researchSources: string[];
  confidenceScore: number;
  createdAt: string;
};
```

### Contact

Stores people connected to the company.

```ts
type Contact = {
  id: string;
  companyId: string;
  name?: string;
  title?: string;
  email?: string;
  phone?: string;
  snsUrl?: string;
  sourceUrl?: string;
  confidenceScore?: number;
  createdAt: string;
  updatedAt: string;
};
```

### Lead

Stores the sales opportunity.

```ts
type Lead = {
  id: string;
  companyId: string;
  contactId?: string;
  status:
    | "new"
    | "researched"
    | "qualified"
    | "contacted"
    | "replied"
    | "follow_up"
    | "meeting"
    | "won"
    | "lost";
  priority: "low" | "medium" | "high";
  owner?: string;
  tags: string[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
};
```

### EmailDraft

Stores generated outreach emails before sending.

```ts
type EmailDraft = {
  id: string;
  leadId: string;
  contactId?: string;
  subject: string;
  body: string;
  tone: "friendly" | "professional" | "direct";
  language: "en" | "ja";
  status: "draft" | "approved" | "sent" | "discarded";
  createdAt: string;
  updatedAt: string;
};
```

### SentEmail

Stores Gmail sending history.

```ts
type SentEmail = {
  id: string;
  leadId: string;
  contactId?: string;
  emailDraftId?: string;
  gmailMessageId?: string;
  toEmail: string;
  subject: string;
  body: string;
  sentAt: string;
  status: "sent" | "failed";
  errorMessage?: string;
};
```

### FollowUpTask

Stores the next sales action after outreach.

```ts
type FollowUpTask = {
  id: string;
  leadId: string;
  sentEmailId?: string;
  title: string;
  dueDate: string;
  status: "open" | "done" | "skipped";
  notes?: string;
  createdAt: string;
  updatedAt: string;
};
```

### SearchResult

Stores search results before they are saved as companies.

```ts
type SearchResult = {
  id: string;
  query: string;
  companyName: string;
  websiteUrl?: string;
  snippet?: string;
  source: "searxng" | "manual" | "sns" | "directory";
  sourceUrl: string;
  savedAsCompanyId?: string;
  createdAt: string;
};
```

## 7. Data Relationships

```text
Company
  -> has many Contacts
  -> has many CompanyResearch records
  -> has one or many Leads

Lead
  -> belongs to Company
  -> optionally belongs to Contact
  -> has many LeadQualifications
  -> has many EmailDrafts
  -> has many SentEmails
  -> has many FollowUpTasks
```

## 8. Minimum MVP Fields

Start with these fields first:

```text
Company:
name, websiteUrl, industry, location, description

Lead:
companyId, status, priority, notes

CompanyResearch:
summary, painPoints, salesOpportunities, sources

LeadQualification:
totalScore, rating, reasons

EmailDraft:
subject, body, language, status

SentEmail:
toEmail, subject, body, sentAt, status

FollowUpTask:
title, dueDate, status
```

## 9. Recommended Tech Stack

- Next.js
- TypeScript
- PostgreSQL
- Prisma
- Tailwind CSS
- shadcn/ui
- SearXNG for web search
- Playwright or Crawlee for website research
- Ollama or OpenAI-compatible AI API for summarization, lead scoring, and email generation
- Gmail API for sending email
- BullMQ and Redis for background jobs later

## 10. Not In MVP

Avoid these in the first version:

- Analytics dashboard
- Team accounts
- Payment or subscription system
- Proposal workflow
- Meeting workflow
- Complex CRM reporting
- Aggressive scraping of private or login-protected social networks
- Fully automated bulk email sending

## 11. MVP Success Criteria

The MVP is successful when a salesperson can:

1. Search or enter a company.
2. Research the company.
3. Save it as a lead.
4. See a qualification score and reasons.
5. Generate a personalized email.
6. Send it through Gmail.
7. See the sent email in outreach history.
8. Create or view the next follow-up task.
