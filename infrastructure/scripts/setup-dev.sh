#!/usr/bin/env bash
# ─── setup-dev.sh ────────────────────────────────────────────────────────────
# Development environment setup for the AlecRae platform.
# Installs dependencies, starts infrastructure via Docker Compose,
# runs database migrations, and seeds initial data.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
DOCKER_DIR="${PROJECT_ROOT}/infrastructure/docker"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info()  { echo -e "${BLUE}[INFO]${NC}  $*"; }
log_ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }

# ─── Pre-flight checks ──────────────────────────────────────────────────────

check_command() {
    if ! command -v "$1" &>/dev/null; then
        log_error "$1 is not installed. Please install it first."
        return 1
    fi
}

log_info "Running pre-flight checks..."

MISSING=0
for cmd in docker bun node git; do
    if ! check_command "$cmd"; then
        MISSING=1
    fi
done

if ! docker compose version &>/dev/null && ! docker-compose version &>/dev/null; then
    log_error "Docker Compose is not available. Install Docker Desktop or the compose plugin."
    MISSING=1
fi

if [[ "$MISSING" -eq 1 ]]; then
    log_error "Missing required tools. Aborting."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node --version | sed 's/v//' | cut -d. -f1)
if [[ "$NODE_VERSION" -lt 22 ]]; then
    log_error "Node.js >= 22 is required (found v${NODE_VERSION}). Please upgrade."
    exit 1
fi

log_ok "All pre-flight checks passed."

# ─── Environment file ───────────────────────────────────────────────────────

if [[ ! -f "${PROJECT_ROOT}/.env" ]]; then
    log_info "Creating .env file from .env.example..."
    if [[ -f "${PROJECT_ROOT}/.env.example" ]]; then
        cp "${PROJECT_ROOT}/.env.example" "${PROJECT_ROOT}/.env"
    else
        cat > "${PROJECT_ROOT}/.env" <<'ENVEOF'
# AlecRae Development Environment
POSTGRES_PASSWORD=dev_password
CLICKHOUSE_PASSWORD=dev_password
MEILI_MASTER_KEY=dev_master_key
MINIO_ROOT_USER=alecrae
MINIO_ROOT_PASSWORD=dev_password
JWT_SECRET=dev_jwt_secret_change_in_production
MTA_HOSTNAME=mail.localhost
DKIM_SELECTOR=default
ENVEOF
    fi
    log_ok "Created .env file."
else
    log_ok ".env file already exists."
fi

# ─── Install dependencies ───────────────────────────────────────────────────

log_info "Installing dependencies with bun..."
cd "${PROJECT_ROOT}"
bun install
log_ok "Dependencies installed."

# ─── Start infrastructure services ──────────────────────────────────────────

log_info "Starting infrastructure services (PostgreSQL, Redis, ClickHouse, Meilisearch, MinIO)..."

COMPOSE_CMD="docker compose"
if ! docker compose version &>/dev/null; then
    COMPOSE_CMD="docker-compose"
fi

cd "${DOCKER_DIR}"
$COMPOSE_CMD -f docker-compose.dev.yml up -d

log_info "Waiting for services to be healthy..."

# Wait for PostgreSQL
MAX_RETRIES=30
RETRY=0
until docker exec "$(docker ps -qf "ancestor=postgres:15-alpine" -f "ancestor=postgres:17-alpine" | head -1)" pg_isready -U alecrae &>/dev/null 2>&1; do
    RETRY=$((RETRY + 1))
    if [[ "$RETRY" -ge "$MAX_RETRIES" ]]; then
        log_error "PostgreSQL failed to start within ${MAX_RETRIES} attempts."
        exit 1
    fi
    sleep 1
done
log_ok "PostgreSQL is ready."

# Wait for Redis
RETRY=0
until docker exec "$(docker ps -qf "ancestor=redis:7-alpine" | head -1)" redis-cli ping &>/dev/null 2>&1; do
    RETRY=$((RETRY + 1))
    if [[ "$RETRY" -ge "$MAX_RETRIES" ]]; then
        log_error "Redis failed to start within ${MAX_RETRIES} attempts."
        exit 1
    fi
    sleep 1
done
log_ok "Redis is ready."

log_ok "All infrastructure services are running."

# ─── Run database migrations ────────────────────────────────────────────────

log_info "Running database migrations..."
cd "${PROJECT_ROOT}"

if [[ -d "packages/db" ]]; then
    bun run --filter @alecrae/db migrate 2>/dev/null || {
        log_warn "Migration command not found or failed. You may need to run migrations manually."
    }
else
    log_warn "packages/db not found. Skipping migrations."
fi

# ─── Seed data ───────────────────────────────────────────────────────────────

log_info "Seeding development data..."
if [[ -d "packages/db" ]]; then
    bun run --filter @alecrae/db seed 2>/dev/null || {
        log_warn "Seed command not found or failed. You may need to seed data manually."
    }
else
    log_warn "packages/db not found. Skipping seed."
fi

# ─── Create MinIO buckets ───────────────────────────────────────────────────

log_info "Creating MinIO buckets..."
sleep 2
docker exec "$(docker ps -qf "ancestor=minio/minio:latest" | head -1)" \
    mc alias set local http://localhost:9000 alecrae dev_password 2>/dev/null || true
docker exec "$(docker ps -qf "ancestor=minio/minio:latest" | head -1)" \
    mc mb --ignore-existing local/alecrae-attachments 2>/dev/null || {
    log_warn "Could not create MinIO bucket. You may need to create it manually via http://localhost:9001"
}
log_ok "MinIO buckets configured."

# ─── Build shared packages ──────────────────────────────────────────────────

log_info "Building shared packages..."
cd "${PROJECT_ROOT}"
bun run --filter @alecrae/shared build 2>/dev/null || log_warn "Could not build @alecrae/shared."
bun run --filter @alecrae/db build 2>/dev/null || log_warn "Could not build @alecrae/db."
bun run --filter @alecrae/ui build 2>/dev/null || log_warn "Could not build @alecrae/ui."
log_ok "Shared packages built."

# ─── Summary ─────────────────────────────────────────────────────────────────

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  AlecRae development environment is ready!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo "  Services:"
echo "    PostgreSQL:   localhost:5432"
echo "    Redis:        localhost:6379"
echo "    ClickHouse:   localhost:8123 (HTTP) / localhost:9000 (native)"
echo "    Meilisearch:  localhost:7700"
echo "    MinIO:        localhost:9002 (S3) / localhost:9001 (console)"
echo ""
echo "  To start the development servers:"
echo "    bun run dev"
echo ""
echo "  To stop infrastructure services:"
echo "    cd infrastructure/docker && docker compose -f docker-compose.dev.yml down"
echo ""
