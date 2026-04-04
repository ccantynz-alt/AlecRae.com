# Emailed

Emailed is an AI-native email infrastructure platform built with TypeScript. It provides a complete email stack -- sending, receiving, JMAP access, spam filtering, reputation management, and analytics -- with AI integrated at every layer. It competes with Mailgun, SendGrid, and Google Workspace but goes further by using AI for spam classification, deliverability prediction, content analysis, and autonomous operations.

## Quick Start

```bash
# 1. Clone the repo
git clone https://github.com/your-org/emailed.git && cd emailed

# 2. Run the setup script (installs deps, starts infra, migrates DB, seeds data)
./scripts/setup.sh

# 3. Start all dev servers
./scripts/dev.sh
```

That's it. The setup script checks prerequisites, starts Docker infrastructure, runs migrations, and seeds test data. The dev script launches all application services with hot reload.

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| [Bun](https://bun.sh) | >= 1.2 | Package manager and runtime |
| [Docker](https://docker.com) | >= 24 | Infrastructure services (Postgres, Redis, etc.) |
| [Git](https://git-scm.com) | any | Version control |

## Architecture

```
                          +-------------------+
                          |    Web App :3000   |  Next.js 15 (App Router)
                          +--------+----------+
                                   |
                          +--------v----------+
          +-------------->|    API :3001       |  Hono (REST)
          |               +---+------+----+---+
          |                   |      |    |
          |            +------+  +---+  +-+--------+
          |            |         |       |          |
  +-------+---+  +----v----+ +--v--+ +--v------+ +-v---------+
  |Admin :3002|  |MTA :587 | |JMAP | |Inbound  | |Reputation |
  +-----------+  |  :25    | |:8080| |:2525    | |:3005      |
                 +---------+ +-----+ +---------+ +-----------+
                       |        |         |            |
               +-------+--------+---------+------------+-----+
               |                                              |
        +------v------+  +-----+  +----------+  +-----+  +---v--+
        |Postgres :5432|  |Redis|  |ClickHouse|  |Meili|  |MinIO |
        |              |  |:6379|  |:8123     |  |:7700|  |:9002 |
        +--------------+  +-----+  +----------+  +-----+  +------+
```

### Monorepo Structure

```
emailed/
  apps/
    web/          Next.js 15 web application (port 3000)
    api/          Hono REST API gateway (port 3001)
    admin/        Admin dashboard (port 3002)
  services/
    mta/          Mail Transfer Agent -- SMTP sending + queue worker (ports 25, 587, 465)
    inbound/      Inbound email processing -- SMTP receiver + parser (ports 2525, 8025)
    jmap/         JMAP protocol server for client access (port 8080)
    reputation/   IP/domain reputation + warm-up orchestrator (port 3005)
    sentinel/     AI validation pipeline (library, no port)
    ai-engine/    AI/ML engine -- spam, content, priority (library, no port)
    dns/          DNS management service
    analytics/    Analytics and reporting
    support/      AI-powered customer support
  packages/
    shared/       Shared types, utilities, constants
    db/           Database schema (Drizzle ORM), migrations, seed
    ui/           Design system and component library (Radix UI)
    email-parser/ MIME/header parsing library
    crypto/       DKIM, TLS, encryption utilities
    sdk/          Public developer SDK (@emailed/sdk)
```

## Service Ports

| Service | Port | Protocol | Description |
|---------|------|----------|-------------|
| Web App | 3000 | HTTP | Main web application (Next.js) |
| API | 3001 | HTTP | REST API gateway (Hono) |
| Admin | 3002 | HTTP | Admin dashboard (Next.js) |
| MTA (SMTP) | 25 | SMTP | Mail Transfer Agent |
| MTA (Submission) | 587 | SMTP | Mail submission (STARTTLS) |
| MTA (SMTPS) | 465 | SMTPS | Mail submission (implicit TLS) |
| Inbound SMTP | 2525 | SMTP | Inbound email receiver |
| Inbound HTTP | 8025 | HTTP | Inbound webhook receiver |
| JMAP | 8080 | HTTP | JMAP protocol server |
| Reputation | 3005 | HTTP | Reputation management API |
| Postgres | 5432 | TCP | Primary database |
| Redis | 6379 | TCP | Cache, queues, sessions |
| ClickHouse | 8123 | HTTP | Analytics database |
| Meilisearch | 7700 | HTTP | Full-text email search |
| MinIO S3 | 9002 | HTTP | Object storage (S3 API) |
| MinIO Console | 9001 | HTTP | MinIO web console |

## Environment Variables

Copy `.env.example` to `.env` before starting. The setup script does this automatically and configures `DATABASE_URL` for local Docker Postgres.

### Required for Local Development

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgres://emailed:dev_password@localhost:5432/emailed` | PostgreSQL connection string |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection string |
| `PORT` | `3001` | API server port |
| `JWT_SECRET` | `change_me_in_production` | JWT signing secret |

### Infrastructure Services (auto-configured by Docker)

| Variable | Default | Description |
|----------|---------|-------------|
| `CLICKHOUSE_URL` | `http://localhost:8123` | ClickHouse HTTP endpoint |
| `MEILI_URL` | `http://localhost:7700` | Meilisearch endpoint |
| `MEILI_MASTER_KEY` | `dev_master_key` | Meilisearch admin key |
| `S3_ENDPOINT` | `http://localhost:9002` | MinIO S3 endpoint |
| `S3_ACCESS_KEY` | `emailed` | MinIO access key |
| `S3_SECRET_KEY` | `dev_password` | MinIO secret key |

### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | (none) | Enables AI spam classification and content analysis |
| `RELAY_PROVIDER` | (none) | Outbound relay: `ses`, `mailchannels`, or `smtp` |
| `STRIPE_SECRET_KEY` | (none) | Enables billing integration |
| `OTEL_ENABLED` | `false` | Enable OpenTelemetry tracing |

See `.env.example` for the complete list with documentation.

## API Endpoints

All authenticated endpoints require an `Authorization: Bearer <api_key>` header or `X-API-Key: <api_key>` header.

### Messages

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/v1/messages/send` | Send an email |
| `GET` | `/v1/messages` | List messages |
| `GET` | `/v1/messages/:id` | Get message details |
| `GET` | `/v1/messages/search` | Full-text search |

### Domains

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/v1/domains` | Add a domain |
| `GET` | `/v1/domains` | List domains |
| `GET` | `/v1/domains/:id` | Get domain details |
| `POST` | `/v1/domains/:id/verify` | Verify domain DNS records |
| `DELETE` | `/v1/domains/:id` | Remove a domain |

### Webhooks

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/v1/webhooks` | Create a webhook endpoint |
| `GET` | `/v1/webhooks` | List webhook endpoints |
| `PUT` | `/v1/webhooks/:id` | Update a webhook endpoint |
| `DELETE` | `/v1/webhooks/:id` | Delete a webhook endpoint |

### Other

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Liveness probe |
| `GET` | `/v1/health` | Deep health check (all dependencies) |
| `GET` | `/v1/analytics/*` | Delivery and engagement analytics |
| `GET` | `/v1/bounces` | Bounce event log |
| `*` | `/v1/suppressions/*` | Suppression list management |
| `*` | `/v1/api-keys/*` | API key management |
| `*` | `/v1/account/*` | Account settings |
| `*` | `/v1/billing/*` | Billing and subscription management |
| `*` | `/v1/templates/*` | Email template CRUD |
| `POST` | `/v1/auth/login` | User authentication |

## Development Commands

```bash
# Setup and infrastructure
./scripts/setup.sh          # First-time setup (install, docker, migrate, seed)
./scripts/dev.sh            # Start all dev servers with hot reload
./scripts/reset-db.sh       # Drop DB, re-migrate, re-seed

# Package scripts (via Turborepo)
bun run dev                 # Start all workspaces in dev mode
bun run build               # Build all packages and apps
bun run test                # Run all tests
bun run lint                # Lint all packages
bun run typecheck           # Type-check all packages
bun run format              # Format code with Prettier

# Database
bun run db:migrate          # Run pending migrations
bun run db:seed             # Seed development data
bun run db:generate         # Generate migration from schema changes
bun run db:studio           # Open Drizzle Studio (visual DB browser)
```

## Test Credentials

After running `./scripts/setup.sh`, the seed script creates:

| Resource | Value |
|----------|-------|
| Admin email | `admin@test.emailed.dev` |
| Admin password | `password123` |
| Test domain | `test.emailed.dev` (pre-verified) |
| API key | Printed once during seed -- copy it from the terminal output |

## Deployment

### Docker Compose (Production)

The full-stack `docker-compose.yml` builds and runs all services:

```bash
# Build and start everything
docker compose -f infrastructure/docker/docker-compose.yml up -d --build

# View logs
docker compose -f infrastructure/docker/docker-compose.yml logs -f

# Stop
docker compose -f infrastructure/docker/docker-compose.yml down
```

### Docker Compose (Development -- Infra Only)

Run infrastructure in Docker, application services locally with hot reload:

```bash
# Start infrastructure only
docker compose -f infrastructure/docker/docker-compose.dev.yml up -d

# Start app services locally
bun run dev

# Or start infra + apps all in Docker (with source mounts for hot reload)
docker compose -f infrastructure/docker/docker-compose.dev.yml --profile apps up -d
```

### Kubernetes

Kubernetes manifests are in `infrastructure/kubernetes/`. See `infrastructure/pulumi/` for Infrastructure as Code (Pulumi, TypeScript).

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Language | TypeScript (full stack) |
| Runtime | Bun + Node.js |
| Frontend | Next.js 15 (App Router), Radix UI, Tailwind CSS |
| API | Hono |
| Database | PostgreSQL (Drizzle ORM) |
| Cache/Queue | Redis (BullMQ) |
| Analytics | ClickHouse |
| Search | Meilisearch |
| Storage | S3-compatible (MinIO) |
| AI | Claude API (Anthropic) |
| Auth | JWT + API keys |
| Monitoring | OpenTelemetry |

## License

Proprietary. All rights reserved.
