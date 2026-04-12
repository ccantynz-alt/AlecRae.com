#!/usr/bin/env bash
# ─── backup-db.sh ────────────────────────────────────────────────────────────
# Database backup script for the AlecRae platform.
# Creates a pg_dump backup and uploads it to S3 with encryption.
# Supports both local (Docker) and production (RDS) databases.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# ─── Configuration ───────────────────────────────────────────────────────────

ENVIRONMENT="${ENVIRONMENT:-dev}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-alecrae}"
DB_USER="${DB_USER:-alecrae}"
DB_PASSWORD="${DB_PASSWORD:-dev_password}"
S3_BUCKET="${S3_BUCKET:-alecrae-${ENVIRONMENT}-backups}"
S3_PREFIX="${S3_PREFIX:-database}"
S3_ENDPOINT="${S3_ENDPOINT:-}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
BACKUP_DIR="${BACKUP_DIR:-/tmp/alecrae-backups}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_FILE="alecrae_${ENVIRONMENT}_${TIMESTAMP}.sql.gz"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info()  { echo -e "${BLUE}[INFO]${NC}  $*"; }
log_ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }

usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -e, --environment   Environment (dev|staging|prod). Default: dev"
    echo "  -h, --host          Database host. Default: localhost"
    echo "  -p, --port          Database port. Default: 5432"
    echo "  -d, --database      Database name. Default: alecrae"
    echo "  -u, --user          Database user. Default: alecrae"
    echo "  -b, --bucket        S3 bucket name. Default: alecrae-{env}-backups"
    echo "  --no-upload         Create backup locally without S3 upload"
    echo "  --retention         Days to keep backups (for cleanup). Default: 30"
    echo "  --help              Show this help"
    exit 0
}

NO_UPLOAD=false

while [[ $# -gt 0 ]]; do
    case $1 in
        -e|--environment) ENVIRONMENT="$2"; shift 2 ;;
        -h|--host)        DB_HOST="$2"; shift 2 ;;
        -p|--port)        DB_PORT="$2"; shift 2 ;;
        -d|--database)    DB_NAME="$2"; shift 2 ;;
        -u|--user)        DB_USER="$2"; shift 2 ;;
        -b|--bucket)      S3_BUCKET="$2"; shift 2 ;;
        --no-upload)      NO_UPLOAD=true; shift ;;
        --retention)      RETENTION_DAYS="$2"; shift 2 ;;
        --help)           usage ;;
        *)                log_error "Unknown option: $1"; usage ;;
    esac
done

# ─── Pre-flight checks ──────────────────────────────────────────────────────

log_info "Starting database backup..."
log_info "Environment: ${ENVIRONMENT}"
log_info "Database:    ${DB_USER}@${DB_HOST}:${DB_PORT}/${DB_NAME}"

if ! command -v pg_dump &>/dev/null; then
    log_error "pg_dump is not installed. Install postgresql-client."
    exit 1
fi

if [[ "$NO_UPLOAD" == "false" ]]; then
    if ! command -v aws &>/dev/null; then
        log_error "AWS CLI is not installed. Install aws-cli or use --no-upload."
        exit 1
    fi
fi

# Create backup directory
mkdir -p "${BACKUP_DIR}"

# ─── Create backup ───────────────────────────────────────────────────────────

log_info "Creating backup: ${BACKUP_FILE}..."

export PGPASSWORD="${DB_PASSWORD}"

pg_dump \
    --host="${DB_HOST}" \
    --port="${DB_PORT}" \
    --username="${DB_USER}" \
    --dbname="${DB_NAME}" \
    --format=custom \
    --compress=9 \
    --verbose \
    --no-owner \
    --no-privileges \
    --file="${BACKUP_DIR}/${BACKUP_FILE%.gz}" \
    2>&1 | tail -5

# Compress with gzip for additional compression on custom format
gzip -f "${BACKUP_DIR}/${BACKUP_FILE%.gz}"

unset PGPASSWORD

BACKUP_SIZE=$(du -sh "${BACKUP_DIR}/${BACKUP_FILE}" 2>/dev/null | cut -f1)
log_ok "Backup created: ${BACKUP_DIR}/${BACKUP_FILE} (${BACKUP_SIZE})"

# ─── Generate checksum ──────────────────────────────────────────────────────

log_info "Generating SHA-256 checksum..."
CHECKSUM=$(sha256sum "${BACKUP_DIR}/${BACKUP_FILE}" | awk '{print $1}')
echo "${CHECKSUM}  ${BACKUP_FILE}" > "${BACKUP_DIR}/${BACKUP_FILE}.sha256"
log_ok "Checksum: ${CHECKSUM}"

# ─── Upload to S3 ───────────────────────────────────────────────────────────

if [[ "$NO_UPLOAD" == "false" ]]; then
    S3_PATH="s3://${S3_BUCKET}/${S3_PREFIX}/${ENVIRONMENT}/${BACKUP_FILE}"
    S3_CHECKSUM_PATH="s3://${S3_BUCKET}/${S3_PREFIX}/${ENVIRONMENT}/${BACKUP_FILE}.sha256"

    AWS_OPTS=""
    if [[ -n "$S3_ENDPOINT" ]]; then
        AWS_OPTS="--endpoint-url ${S3_ENDPOINT}"
    fi

    log_info "Uploading backup to ${S3_PATH}..."

    # shellcheck disable=SC2086
    aws s3 cp ${AWS_OPTS} \
        "${BACKUP_DIR}/${BACKUP_FILE}" \
        "${S3_PATH}" \
        --storage-class STANDARD_IA \
        --sse aws:kms

    # shellcheck disable=SC2086
    aws s3 cp ${AWS_OPTS} \
        "${BACKUP_DIR}/${BACKUP_FILE}.sha256" \
        "${S3_CHECKSUM_PATH}"

    log_ok "Backup uploaded to S3."

    # ─── Cleanup old backups in S3 ───────────────────────────────────────────

    log_info "Cleaning up backups older than ${RETENTION_DAYS} days..."
    CUTOFF_DATE=$(date -d "-${RETENTION_DAYS} days" +%Y-%m-%d 2>/dev/null || date -v-${RETENTION_DAYS}d +%Y-%m-%d)

    # shellcheck disable=SC2086
    aws s3 ls ${AWS_OPTS} \
        "s3://${S3_BUCKET}/${S3_PREFIX}/${ENVIRONMENT}/" 2>/dev/null | while read -r line; do
        FILE_DATE=$(echo "$line" | awk '{print $1}')
        FILE_NAME=$(echo "$line" | awk '{print $4}')
        if [[ "$FILE_DATE" < "$CUTOFF_DATE" && -n "$FILE_NAME" ]]; then
            log_info "Removing old backup: ${FILE_NAME}"
            # shellcheck disable=SC2086
            aws s3 rm ${AWS_OPTS} "s3://${S3_BUCKET}/${S3_PREFIX}/${ENVIRONMENT}/${FILE_NAME}"
        fi
    done

    log_ok "Old backups cleaned up."
fi

# ─── Clean up local backup ──────────────────────────────────────────────────

if [[ "$NO_UPLOAD" == "false" ]]; then
    log_info "Removing local backup file..."
    rm -f "${BACKUP_DIR}/${BACKUP_FILE}" "${BACKUP_DIR}/${BACKUP_FILE}.sha256"
    log_ok "Local cleanup complete."
else
    log_info "Backup retained at: ${BACKUP_DIR}/${BACKUP_FILE}"
fi

# ─── Summary ─────────────────────────────────────────────────────────────────

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Database backup complete!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo "  File:        ${BACKUP_FILE}"
echo "  Size:        ${BACKUP_SIZE}"
echo "  Checksum:    ${CHECKSUM}"
if [[ "$NO_UPLOAD" == "false" ]]; then
    echo "  S3 Location: ${S3_PATH}"
fi
echo ""
