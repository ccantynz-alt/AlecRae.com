# Getting Started with AlecRae

This guide walks you through setting up your local development environment for the AlecRae platform.

## Prerequisites

Before you begin, make sure you have the following installed:

- **Bun** (v1.1+) - [Install Bun](https://bun.sh)
- **Node.js** (v20+) - [Install Node.js](https://nodejs.org)
- **Docker** and **Docker Compose** - [Install Docker](https://docs.docker.com/get-docker/)
- **PostgreSQL** (v16+) - Provided via Docker, or install locally
- **Git** - [Install Git](https://git-scm.com)

## Clone and Install

```bash
# Clone the repository
git clone git@github.com:your-org/alecrae.git
cd alecrae

# Install all dependencies (monorepo workspaces)
bun install
```

## Environment Setup

Copy the example environment file and configure it for your local setup:

```bash
cp .env.example .env
```

Edit `.env` and set the following values at minimum:

```env
# Database
DATABASE_URL=postgresql://alecrae:alecrae@localhost:5432/alecrae

# Redis
REDIS_URL=redis://localhost:6379

# AI Engine
ANTHROPIC_API_KEY=your-api-key-here

# Application
APP_URL=http://localhost:3000
API_URL=http://localhost:4000
```

## Start the Development Environment

Start the infrastructure services (PostgreSQL, Redis, Meilisearch, MinIO) with Docker Compose:

```bash
docker-compose up -d
```

Run database migrations to create the schema:

```bash
bun run db:migrate
```

Seed the database with development data (optional):

```bash
bun run db:seed
```

## Run the Application

Start all services in development mode:

```bash
bun run dev
```

This starts:

- **Web app** at `http://localhost:3000`
- **API gateway** at `http://localhost:4000`
- **Admin dashboard** at `http://localhost:3001`

To start a specific service only:

```bash
bun run dev --filter=@alecrae/web
bun run dev --filter=@alecrae/api
bun run dev --filter=@alecrae/mta
```

## Run Tests

```bash
# Run all tests
bun run test

# Run tests for a specific package
bun run test --filter=@alecrae/mta

# Run tests in watch mode
bun run test:watch

# Run tests with coverage
bun run test:coverage
```

## Project Structure Overview

```
alecrae/
├── apps/
│   ├── web/          # Next.js 15 web application
│   ├── api/          # REST/GraphQL API gateway
│   └── admin/        # Admin dashboard
│
├── services/
│   ├── sentinel/     # AI validation pipeline
│   ├── mta/          # Mail Transfer Agent (SMTP)
│   ├── inbound/      # Inbound email processing
│   ├── ai-engine/    # Core AI/ML engine
│   ├── dns/          # DNS management
│   ├── jmap/         # JMAP protocol server
│   ├── reputation/   # IP & domain reputation
│   ├── support/      # AI-powered support
│   └── analytics/    # Analytics & reporting
│
├── packages/
│   ├── shared/       # Shared types, utilities, constants
│   ├── db/           # Database schema, migrations, client
│   ├── ui/           # Design system & component library
│   ├── email-parser/ # Email parsing library
│   ├── crypto/       # Cryptography utilities
│   └── sdk/          # Public developer SDK
│
├── infrastructure/   # Docker, Kubernetes, Pulumi configs
└── docs/             # Documentation
```

## Common Tasks

### Add a New Service

1. Create a new directory under `services/`:
   ```bash
   mkdir -p services/my-service/src
   ```
2. Add a `package.json` with the workspace name `@alecrae/my-service`.
3. Add TypeScript config extending `../../tsconfig.base.json`.
4. Register the service in `turbo.json` if it has custom build/dev tasks.
5. Run `bun install` to link the workspace.

### Add a Database Migration

1. Create a new SQL file in `packages/db/src/migrations/` with the next sequential number:
   ```bash
   touch packages/db/src/migrations/0008_create_my_table.sql
   ```
2. Write idempotent SQL (`CREATE TABLE IF NOT EXISTS`, etc.).
3. If adding new Drizzle schema, create or update the relevant file in `packages/db/src/schema/`.
4. Export the new schema from `packages/db/src/index.ts`.
5. Run the migration: `bun run db:migrate`.

### Add an API Endpoint

1. Create a new route file in `apps/api/routes/`.
2. Define request/response types in `packages/shared/src/types/`.
3. Add input validation using Zod schemas.
4. Write tests covering success and error cases.
5. Update the OpenAPI spec if applicable.

## Next Steps

- Read the [Deployment Guide](./deployment.md) for production setup.
- Read the [Contributing Guide](./contributing.md) for development workflow.
- Review the architecture in `CLAUDE.md` at the repository root.
