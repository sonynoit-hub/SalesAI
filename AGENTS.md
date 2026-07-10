# SalesAI Agent Notes

## Project

SalesAI is a local-first sales workflow app for an IT salesperson.

The core MVP workflow is:

```text
Search companies -> research company -> save lead -> qualify lead -> generate email -> send Gmail -> track follow-up
```

Use `DESIGN.md` as the product blueprint before making architecture or feature decisions.

## Current Stage

The project has been scaffolded with Next.js, TypeScript, Tailwind CSS, and ESLint.

The current app reads the MVP workflow from PostgreSQL through Prisma. Local mock sample data has been removed; AI services, Gmail integration, and public search integration are still planned work.

## Recommended Tech Stack

- Next.js
- TypeScript
- PostgreSQL
- Prisma with `@prisma/adapter-pg`
- Tailwind CSS
- shadcn/ui
- SearXNG for public web search
- Playwright or Crawlee for website research
- Ollama or OpenAI-compatible API for company summaries, lead scoring, and email generation
- Gmail API for sending email
- BullMQ and Redis for background jobs later

## MVP Scope

Build only features that support the main workflow:

- Lead search
- Company research
- Lead saving and CRM status
- Lead qualification
- Email draft generation
- Gmail sending
- Outreach history
- Follow-up task tracking

## Out Of Scope For MVP

Avoid these unless the user explicitly asks:

- Analytics dashboard
- Team accounts
- Payment or subscription system
- Proposal workflow
- Meeting workflow
- Complex CRM reporting
- Fully automated bulk email sending
- Aggressive scraping of private or login-protected social networks

## Architecture Guidance

When the app is scaffolded:

- Keep UI pages and components simple and workflow-focused.
- Prefer typed data models that match `DESIGN.md`.
- Keep API routes small and purpose-specific.
- Keep provider integrations isolated behind service modules.
- Do not mix Gmail, AI, search, and persistence logic directly into UI components.
- Prefer structured parsing and validation over ad hoc string handling.

Suggested future structure:

```text
app/
  page.tsx
  api/
components/
lib/
  ai/
  gmail/
  search/
  research/
  stores/
prisma/
work/
```

## Data And Secrets

Use `.env.local` for local secrets and service URLs.

Never commit:

- `.env.local`
- Gmail tokens
- API keys
- OAuth client secrets
- local database dumps

If local runtime files are created, keep them under `work/`.

Do not delete files under `work/` unless the user explicitly asks to reset local data.

Expected Gmail-related environment variables:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `GOOGLE_GMAIL_SCOPE`

## External Data Rules

- Prefer public company websites, search results, directories, and user-provided URLs.
- Avoid scraping private, login-protected, or terms-restricted social pages.
- Do not build hidden bulk spam behavior.
- Emails should be reviewed or editable before sending in the MVP.

## Verification

After code changes, run the project checks available at that stage.

For a Next.js app, use:

```text
npm run lint
npm run build
```

If the app has a dev server, run:

```text
npm run dev
```

Then verify the changed workflow manually in the browser when relevant.

## Collaboration Notes

- Before large implementation work, update or reference `DESIGN.md`.
- Keep changes small and aligned with the current MVP workflow.
- Explain changed files and verification results after implementation.
- Do not introduce large new platforms or frameworks without a clear reason.
