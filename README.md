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

Run the local development server:

```bash
npm run dev
```

Run verification:

```bash
npm run lint
npm run build
```

Copy `.env.example` to `.env.local` when local services and secrets are ready.

Run local search services:

```bash
docker run -d --name salesai-searxng -p 8080:8080 -v "$(pwd)/services/searxng:/etc/searxng" searxng/searxng
docker run -d --name salesai-crawl4ai -p 11235:11235 --shm-size=1g unclecode/crawl4ai:latest
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
```

The current local `DATABASE_URL` expects a PostgreSQL database named `salesai`.

## Database-backed UI

The current UI reads workflow data from PostgreSQL through Prisma. Use
`npm run db:seed` to create or refresh local development records.
