#!/usr/bin/env bash
# ─── health-check.sh ─────────────────────────────────────────────────────────
# Health check script for all AlecRae platform services.
# Checks both infrastructure services and application services.
# Supports local (Docker) and Kubernetes environments.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ─── Configuration ───────────────────────────────────────────────────────────

MODE="${MODE:-local}"  # "local" for Docker, "k8s" for Kubernetes
NAMESPACE="${NAMESPACE:-alecrae}"
VERBOSE="${VERBOSE:-false}"

# Local service endpoints
POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_USER="${POSTGRES_USER:-alecrae}"
REDIS_HOST="${REDIS_HOST:-localhost}"
REDIS_PORT="${REDIS_PORT:-6379}"
CLICKHOUSE_HOST="${CLICKHOUSE_HOST:-localhost}"
CLICKHOUSE_PORT="${CLICKHOUSE_PORT:-8123}"
MEILI_HOST="${MEILI_HOST:-localhost}"
MEILI_PORT="${MEILI_PORT:-7700}"
MINIO_HOST="${MINIO_HOST:-localhost}"
MINIO_PORT="${MINIO_PORT:-9002}"
WEB_HOST="${WEB_HOST:-localhost}"
WEB_PORT="${WEB_PORT:-3001}"
API_HOST="${API_HOST:-localhost}"
API_PORT="${API_PORT:-3000}"
MTA_HOST="${MTA_HOST:-localhost}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PASS=0
FAIL=0
WARN=0

# ─── Helpers ─────────────────────────────────────────────────────────────────

usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -m, --mode       Check mode: local (Docker) or k8s (Kubernetes). Default: local"
    echo "  -n, --namespace  Kubernetes namespace. Default: alecrae"
    echo "  -v, --verbose    Show detailed output"
    echo "  --help           Show this help"
    exit 0
}

while [[ $# -gt 0 ]]; do
    case $1 in
        -m|--mode)      MODE="$2"; shift 2 ;;
        -n|--namespace) NAMESPACE="$2"; shift 2 ;;
        -v|--verbose)   VERBOSE=true; shift ;;
        --help)         usage ;;
        *)              echo "Unknown option: $1"; usage ;;
    esac
done

check_pass() {
    echo -e "  ${GREEN}[PASS]${NC}  $*"
    PASS=$((PASS + 1))
}

check_fail() {
    echo -e "  ${RED}[FAIL]${NC}  $*"
    FAIL=$((FAIL + 1))
}

check_warn() {
    echo -e "  ${YELLOW}[WARN]${NC}  $*"
    WARN=$((WARN + 1))
}

check_tcp() {
    local host="$1"
    local port="$2"
    local name="$3"
    if timeout 3 bash -c "echo >/dev/tcp/${host}/${port}" 2>/dev/null; then
        check_pass "${name} — ${host}:${port} is reachable"
        return 0
    else
        check_fail "${name} — ${host}:${port} is not reachable"
        return 1
    fi
}

check_http() {
    local url="$1"
    local name="$2"
    local expected_code="${3:-200}"
    local response_code
    response_code=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 3 --max-time 5 "$url" 2>/dev/null || echo "000")
    if [[ "$response_code" == "$expected_code" ]]; then
        check_pass "${name} — ${url} returned ${response_code}"
        return 0
    elif [[ "$response_code" != "000" ]]; then
        check_warn "${name} — ${url} returned ${response_code} (expected ${expected_code})"
        return 1
    else
        check_fail "${name} — ${url} is not reachable"
        return 1
    fi
}

# ─── Local (Docker) Health Checks ────────────────────────────────────────────

run_local_checks() {
    echo ""
    echo -e "${BLUE}=== Infrastructure Services ===${NC}"
    echo ""

    # PostgreSQL
    if check_tcp "$POSTGRES_HOST" "$POSTGRES_PORT" "PostgreSQL"; then
        if command -v pg_isready &>/dev/null; then
            if pg_isready -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" &>/dev/null; then
                check_pass "PostgreSQL — accepting connections"
            else
                check_warn "PostgreSQL — port open but not accepting connections"
            fi
        fi
    fi

    # Redis
    if check_tcp "$REDIS_HOST" "$REDIS_PORT" "Redis"; then
        if command -v redis-cli &>/dev/null; then
            PONG=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ping 2>/dev/null || echo "")
            if [[ "$PONG" == "PONG" ]]; then
                check_pass "Redis — responding to PING"
            else
                check_warn "Redis — port open but not responding to PING"
            fi
        fi
    fi

    # ClickHouse
    check_http "http://${CLICKHOUSE_HOST}:${CLICKHOUSE_PORT}/ping" "ClickHouse"

    # Meilisearch
    check_http "http://${MEILI_HOST}:${MEILI_PORT}/health" "Meilisearch"

    # MinIO
    check_http "http://${MINIO_HOST}:${MINIO_PORT}/minio/health/live" "MinIO"

    echo ""
    echo -e "${BLUE}=== Application Services ===${NC}"
    echo ""

    # Web
    check_http "http://${WEB_HOST}:${WEB_PORT}/api/health" "Web App" || \
        check_tcp "$WEB_HOST" "$WEB_PORT" "Web App (TCP fallback)"

    # API
    check_http "http://${API_HOST}:${API_PORT}/health" "API Server"

    # MTA
    check_tcp "$MTA_HOST" 587 "MTA (submission/587)"
    check_tcp "$MTA_HOST" 25 "MTA (SMTP/25)" || true
    check_tcp "$MTA_HOST" 465 "MTA (submissions/465)" || true
}

# ─── Kubernetes Health Checks ────────────────────────────────────────────────

run_k8s_checks() {
    if ! command -v kubectl &>/dev/null; then
        echo -e "${RED}kubectl is not installed.${NC}"
        exit 1
    fi

    echo ""
    echo -e "${BLUE}=== Kubernetes Cluster ===${NC}"
    echo ""

    # Cluster connectivity
    if kubectl cluster-info &>/dev/null; then
        check_pass "Kubernetes cluster — reachable"
    else
        check_fail "Kubernetes cluster — not reachable"
        exit 1
    fi

    # Namespace exists
    if kubectl get namespace "$NAMESPACE" &>/dev/null; then
        check_pass "Namespace '${NAMESPACE}' — exists"
    else
        check_fail "Namespace '${NAMESPACE}' — does not exist"
        exit 1
    fi

    echo ""
    echo -e "${BLUE}=== Deployments ===${NC}"
    echo ""

    # Check all deployments
    kubectl get deployments -n "$NAMESPACE" -o json 2>/dev/null | \
        jq -r '.items[] | "\(.metadata.name) \(.status.readyReplicas // 0) \(.spec.replicas)"' | \
        while read -r name ready desired; do
            if [[ "$ready" == "$desired" && "$desired" != "0" ]]; then
                check_pass "Deployment ${name} — ${ready}/${desired} replicas ready"
            elif [[ "$ready" == "0" ]]; then
                check_fail "Deployment ${name} — 0/${desired} replicas ready"
            else
                check_warn "Deployment ${name} — ${ready}/${desired} replicas ready"
            fi
        done

    echo ""
    echo -e "${BLUE}=== StatefulSets ===${NC}"
    echo ""

    kubectl get statefulsets -n "$NAMESPACE" -o json 2>/dev/null | \
        jq -r '.items[] | "\(.metadata.name) \(.status.readyReplicas // 0) \(.spec.replicas)"' | \
        while read -r name ready desired; do
            if [[ "$ready" == "$desired" && "$desired" != "0" ]]; then
                check_pass "StatefulSet ${name} — ${ready}/${desired} replicas ready"
            else
                check_fail "StatefulSet ${name} — ${ready}/${desired} replicas ready"
            fi
        done

    echo ""
    echo -e "${BLUE}=== Pods ===${NC}"
    echo ""

    # Check for pods not in Running/Completed state
    NOT_READY=$(kubectl get pods -n "$NAMESPACE" --no-headers 2>/dev/null | \
        grep -v -E "(Running|Completed)" || true)

    if [[ -z "$NOT_READY" ]]; then
        TOTAL_PODS=$(kubectl get pods -n "$NAMESPACE" --no-headers 2>/dev/null | wc -l)
        check_pass "All ${TOTAL_PODS} pods are Running/Completed"
    else
        echo "$NOT_READY" | while read -r line; do
            POD_NAME=$(echo "$line" | awk '{print $1}')
            POD_STATUS=$(echo "$line" | awk '{print $3}')
            check_fail "Pod ${POD_NAME} — status: ${POD_STATUS}"
        done
    fi

    # Check for pod restarts
    echo ""
    echo -e "${BLUE}=== Pod Restarts ===${NC}"
    echo ""

    HIGH_RESTARTS=$(kubectl get pods -n "$NAMESPACE" -o json 2>/dev/null | \
        jq -r '.items[] | .metadata.name as $name | .status.containerStatuses[]? | select(.restartCount > 5) | "\($name) \(.restartCount)"' || true)

    if [[ -z "$HIGH_RESTARTS" ]]; then
        check_pass "No pods with excessive restarts (>5)"
    else
        echo "$HIGH_RESTARTS" | while read -r name count; do
            check_warn "Pod ${name} — ${count} restarts"
        done
    fi

    # Check PVCs
    echo ""
    echo -e "${BLUE}=== Persistent Volume Claims ===${NC}"
    echo ""

    kubectl get pvc -n "$NAMESPACE" --no-headers 2>/dev/null | while read -r line; do
        PVC_NAME=$(echo "$line" | awk '{print $1}')
        PVC_STATUS=$(echo "$line" | awk '{print $2}')
        if [[ "$PVC_STATUS" == "Bound" ]]; then
            check_pass "PVC ${PVC_NAME} — Bound"
        else
            check_fail "PVC ${PVC_NAME} — ${PVC_STATUS}"
        fi
    done

    # Check HPAs
    if [[ "$VERBOSE" == "true" ]]; then
        echo ""
        echo -e "${BLUE}=== Horizontal Pod Autoscalers ===${NC}"
        echo ""
        kubectl get hpa -n "$NAMESPACE" 2>/dev/null || check_warn "No HPAs found"
    fi
}

# ─── Run checks ──────────────────────────────────────────────────────────────

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  AlecRae Platform Health Check${NC}"
echo -e "${BLUE}  Mode: ${MODE} | $(date)${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"

case "$MODE" in
    local)  run_local_checks ;;
    k8s)    run_k8s_checks ;;
    *)      echo "Invalid mode: ${MODE}. Use 'local' or 'k8s'."; exit 1 ;;
esac

# ─── Summary ─────────────────────────────────────────────────────────────────

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "  ${GREEN}Passed: ${PASS}${NC}  |  ${YELLOW}Warnings: ${WARN}${NC}  |  ${RED}Failed: ${FAIL}${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""

if [[ "$FAIL" -gt 0 ]]; then
    exit 1
elif [[ "$WARN" -gt 0 ]]; then
    exit 0
else
    exit 0
fi
