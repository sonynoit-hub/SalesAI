# SalesAI

SalesAI is a local-first sales workflow app for IT sales.

The app helps a salesperson find potential customers from public web sources, research companies, save promising leads, qualify them, generate personalized outreach emails, send those emails through Gmail, and track follow-up tasks.

## Core MVP Workflow

```text
Search companies -> research company -> save lead -> qualify lead -> generate email -> send Gmail -> track follow-up
```

## MVP Features

- Search for potential customer companies from public web sources
- Research company websites and collect sales context
- Save companies as leads
- Qualify leads with scores, reasons, risks, and suggested approach
- Generate personalized outreach email drafts
- Send outreach emails through Gmail
- Track sent emails and outreach history
- Create and manage follow-up tasks

## Planned Pages

- Lead Search
- Company Research
- Lead CRM
- Email Composer
- Outreach History
- Follow-up Tasks
- Settings

## Planned Tech Stack

- Next.js
- TypeScript
- PostgreSQL
- Prisma
- Tailwind CSS
- shadcn/ui
- SearXNG for public web search
- Playwright or Crawlee for website research
- Ollama or OpenAI-compatible API for AI research, scoring, and email generation
- Gmail API for sending email
- BullMQ and Redis for background jobs later

## Project Documents

- `DESIGN.md` contains the product blueprint, workflow, data models, and MVP boundaries.
- `DATABASE.md` contains the planned PostgreSQL and Prisma schema.
- `API_PLAN.md` contains the planned Next.js API route structure.
- `IMPLEMENTATION_PLAN.md` contains the build phases.
- `AGENTS.md` contains implementation guidance for Codex and future coding agents.

## Current Status

This project has been scaffolded with Next.js, TypeScript, Tailwind CSS, and ESLint.

The current app reads the MVP workflow from PostgreSQL through Prisma. Lead Search can call SearXNG, Ollama, and optionally Crawl4AI, then save selected companies into PostgreSQL. Gmail integration is still planned work.

## MVP Boundaries

The first version should stay focused on the main sales workflow.

Out of scope for MVP:

- Analytics dashboard
- Team accounts
- Payment or subscription system
- Proposal workflow
- Meeting workflow
- Complex CRM reporting
- Fully automated bulk email sending
- Aggressive scraping of private or login-protected social networks

## Development

Start the full local stack (Docker Desktop, Postgres, SearXNG, Crawl4AI, Ollama, Next.js):

```bash
npm run dev:up
```

Useful variants:

```bash
npm run dev:up -- --with-queue   # also poll the auto-send queue
npm run dev:up -- --skip-seed    # keep existing data untouched
npm run dev:up -- --containers   # containers + Ollama only
npm run dev:down                 # stop Docker services
```

Or start only the Next.js app if services are already running:

```bash
npm run dev
```

Run verification:

```bash
npm run lint
npm run build
```

Copy `.env.example` to `.env.local` when local services and secrets are ready. `dev:up` will create `.env.local` from the example if it is missing.

Manual local search services (also covered by `dev:up`):

```bash
docker compose up -d
ollama serve
```

Lead Search works without Crawl4AI, but when `CRAWL4AI_URL` is set and the container is running, the backend crawls the top candidate websites before AI analysis.

## Database

Prisma is configured for PostgreSQL.

Useful commands:

```bash
npm run db:generate
npm run db:migrate
npm run db:push
npm run db:seed
npm run db:studio
npm run db:backup
npm run db:restore -- work/backups/<backup-file>.sql.gz
```

The current local `DATABASE_URL` expects a PostgreSQL database named `salesai`.

### Backup and restore runbook (pilot-safe)

Before migrations, large imports, or bulk edits, create a backup:

```bash
npm run db:backup
```

This writes a compressed SQL backup under `work/backups/` by default.
You can also specify a custom output path:

```bash
npm run db:backup -- work/backups/pre-import.sql.gz
```

Restore from a backup (overwrites current local data):

```bash
npm run db:restore -- work/backups/pre-import.sql.gz
```

Safety rules for pilot data:

- Never commit `.env.local`, OAuth tokens, or backup dumps.
- Keep backup files under `work/backups/`.
- Run a backup before schema changes and before importing external lead lists.
- After restore, run `npm run db:generate` and restart the app (`npm run dev:up`).

## Database-backed UI

The current UI reads workflow data from PostgreSQL through Prisma. Use
`npm run db:seed` to create or refresh local development records.

## Internal pilot checklist (1-3 users)

- [ ] Docker and PostgreSQL are healthy (`npm run dev:up`)
- [ ] A fresh backup exists (`npm run db:backup`)
- [ ] OAuth/email provider path tested with one real send
- [ ] Follow-up queue actions tested (`完了 / スキップ / 再設定`)
- [ ] Contact actions tested (`架電済みにする / 返信ありにする`)
- [ ] Outreach history reflects status and contact channel labels
- [ ] Lint and tests pass (`npm run lint`, `npm test`)
