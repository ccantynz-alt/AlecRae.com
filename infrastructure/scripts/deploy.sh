#!/usr/bin/env bash
# ─── deploy.sh ───────────────────────────────────────────────────────────────
# Production deployment script for the AlecRae platform.
# Builds Docker images, pushes to container registry, and applies
# Kubernetes manifests.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
K8S_DIR="${PROJECT_ROOT}/infrastructure/kubernetes"
DOCKER_DIR="${PROJECT_ROOT}/infrastructure/docker"

# ─── Configuration ───────────────────────────────────────────────────────────

REGISTRY="${REGISTRY:-registry.alecrae.dev}"
NAMESPACE="${NAMESPACE:-alecrae}"
ENVIRONMENT="${ENVIRONMENT:-staging}"
TAG="${TAG:-$(git -C "${PROJECT_ROOT}" rev-parse --short HEAD)}"
TIMESTAMP="$(date +%Y%m%d%H%M%S)"
FULL_TAG="${TAG}-${TIMESTAMP}"

# Services to build and deploy
SERVICES=("web" "api" "mta")

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
    echo "  -e, --environment   Target environment (dev|staging|prod). Default: staging"
    echo "  -t, --tag           Docker image tag. Default: git short SHA"
    echo "  -r, --registry      Container registry. Default: registry.alecrae.dev"
    echo "  -s, --service       Deploy specific service only (web|api|mta)"
    echo "  --dry-run           Print commands without executing"
    echo "  -h, --help          Show this help"
    exit 0
}

DRY_RUN=false
SINGLE_SERVICE=""

while [[ $# -gt 0 ]]; do
    case $1 in
        -e|--environment) ENVIRONMENT="$2"; shift 2 ;;
        -t|--tag)         TAG="$2"; FULL_TAG="$2"; shift 2 ;;
        -r|--registry)    REGISTRY="$2"; shift 2 ;;
        -s|--service)     SINGLE_SERVICE="$2"; shift 2 ;;
        --dry-run)        DRY_RUN=true; shift ;;
        -h|--help)        usage ;;
        *)                log_error "Unknown option: $1"; usage ;;
    esac
done

if [[ -n "$SINGLE_SERVICE" ]]; then
    SERVICES=("$SINGLE_SERVICE")
fi

run_cmd() {
    if [[ "$DRY_RUN" == "true" ]]; then
        echo -e "${YELLOW}[DRY-RUN]${NC} $*"
    else
        "$@"
    fi
}

# ─── Pre-flight checks ──────────────────────────────────────────────────────

log_info "Pre-flight checks..."

for cmd in docker kubectl; do
    if ! command -v "$cmd" &>/dev/null; then
        log_error "$cmd is required but not installed."
        exit 1
    fi
done

# Verify kubectl context
CURRENT_CONTEXT=$(kubectl config current-context 2>/dev/null || echo "none")
log_info "Kubernetes context: ${CURRENT_CONTEXT}"

if [[ "$ENVIRONMENT" == "prod" ]]; then
    echo ""
    echo -e "${RED}WARNING: You are deploying to PRODUCTION.${NC}"
    echo -e "Context: ${CURRENT_CONTEXT}"
    echo ""
    read -rp "Type 'yes' to continue: " CONFIRM
    if [[ "$CONFIRM" != "yes" ]]; then
        log_info "Deployment cancelled."
        exit 0
    fi
fi

log_ok "Pre-flight checks passed."

# ─── Run tests ───────────────────────────────────────────────────────────────

if [[ "$ENVIRONMENT" == "prod" ]]; then
    log_info "Running test suite before production deployment..."
    cd "${PROJECT_ROOT}"
    run_cmd bun run test
    log_ok "All tests passed."
fi

# ─── Build Docker images ────────────────────────────────────────────────────

log_info "Building Docker images (tag: ${FULL_TAG})..."

cd "${PROJECT_ROOT}"

for service in "${SERVICES[@]}"; do
    IMAGE="${REGISTRY}/alecrae/${service}:${FULL_TAG}"
    IMAGE_LATEST="${REGISTRY}/alecrae/${service}:latest"
    DOCKERFILE="${DOCKER_DIR}/Dockerfile.${service}"

    if [[ ! -f "$DOCKERFILE" ]]; then
        log_error "Dockerfile not found: ${DOCKERFILE}"
        exit 1
    fi

    log_info "Building ${service}..."
    run_cmd docker build \
        -f "$DOCKERFILE" \
        -t "$IMAGE" \
        -t "$IMAGE_LATEST" \
        --build-arg BUILD_TAG="${FULL_TAG}" \
        --build-arg BUILD_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        .

    log_ok "Built ${IMAGE}"
done

# ─── Push to registry ───────────────────────────────────────────────────────

log_info "Pushing images to ${REGISTRY}..."

for service in "${SERVICES[@]}"; do
    IMAGE="${REGISTRY}/alecrae/${service}:${FULL_TAG}"
    IMAGE_LATEST="${REGISTRY}/alecrae/${service}:latest"

    log_info "Pushing ${service}..."
    run_cmd docker push "$IMAGE"
    run_cmd docker push "$IMAGE_LATEST"
    log_ok "Pushed ${IMAGE}"
done

# ─── Apply Kubernetes manifests ──────────────────────────────────────────────

log_info "Applying Kubernetes manifests to namespace '${NAMESPACE}'..."

# Ensure namespace exists
run_cmd kubectl apply -f "${K8S_DIR}/namespace.yml"

# Apply configs and secrets (secrets should already exist with real values)
run_cmd kubectl apply -f "${K8S_DIR}/configmap.yml"

# Apply network policies
run_cmd kubectl apply -f "${K8S_DIR}/network-policy.yml"

# Apply stateful services (only if not using managed services like RDS)
if [[ "$ENVIRONMENT" == "dev" ]]; then
    run_cmd kubectl apply -f "${K8S_DIR}/postgres-statefulset.yml"
    run_cmd kubectl apply -f "${K8S_DIR}/redis-deployment.yml"
fi

# Update image tags in deployments and apply
for service in "${SERVICES[@]}"; do
    MANIFEST="${K8S_DIR}/${service}-deployment.yml"
    IMAGE="${REGISTRY}/alecrae/${service}:${FULL_TAG}"

    if [[ ! -f "$MANIFEST" ]]; then
        log_warn "Manifest not found: ${MANIFEST}. Skipping."
        continue
    fi

    log_info "Deploying ${service} with image ${IMAGE}..."
    run_cmd kubectl set image "deployment/${service}" \
        "${service}=${IMAGE}" \
        -n "$NAMESPACE" 2>/dev/null || {
        # If the deployment doesn't exist yet, apply the manifest first
        run_cmd kubectl apply -f "$MANIFEST"
        run_cmd kubectl set image "deployment/${service}" \
            "${service}=${IMAGE}" \
            -n "$NAMESPACE"
    }
done

# Apply HPAs
run_cmd kubectl apply -f "${K8S_DIR}/hpa.yml"

# ─── Wait for rollouts ──────────────────────────────────────────────────────

log_info "Waiting for rollouts to complete..."

for service in "${SERVICES[@]}"; do
    log_info "Waiting for ${service} rollout..."
    run_cmd kubectl rollout status "deployment/${service}" \
        -n "$NAMESPACE" \
        --timeout=300s || {
        log_error "${service} rollout failed!"
        log_info "Rolling back ${service}..."
        run_cmd kubectl rollout undo "deployment/${service}" -n "$NAMESPACE"
        exit 1
    }
    log_ok "${service} rollout complete."
done

# ─── Post-deployment verification ────────────────────────────────────────────

log_info "Running post-deployment health checks..."

for service in "${SERVICES[@]}"; do
    READY=$(kubectl get deployment "$service" -n "$NAMESPACE" -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
    DESIRED=$(kubectl get deployment "$service" -n "$NAMESPACE" -o jsonpath='{.spec.replicas}' 2>/dev/null || echo "?")
    log_info "${service}: ${READY}/${DESIRED} pods ready"
done

# ─── Summary ─────────────────────────────────────────────────────────────────

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Deployment complete!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo "  Environment:  ${ENVIRONMENT}"
echo "  Tag:          ${FULL_TAG}"
echo "  Registry:     ${REGISTRY}"
echo "  Services:     ${SERVICES[*]}"
echo ""
