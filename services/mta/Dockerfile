# ─── Dockerfile ──────────────────────────────────────────────────────────────
# Fly.io image for the AlecRae Mail Transfer Agent.
#
# Build context: monorepo root (fly builds from the root — fly.toml here
# is picked up and the build context is inferred from the workspace).
#
# Multi-stage:
#   1. deps    — install workspace deps with bun (uses bun.lock)
#   2. builder — compile TS for MTA + its workspace deps
#   3. runner  — slim runtime, non-root user, healthcheck, 5 exposed ports
#
# Runtime: Bun 1.2 (per CLAUDE.md §Aggressive Stack — Bun over Node).
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: Dependencies ───────────────────────────────────────────────────
FROM oven/bun:1.2-alpine AS deps

WORKDIR /app

# Copy only the manifests needed to resolve the MTA's workspace graph.
# This maximises Docker layer cache hits on unrelated code changes.
COPY package.json bun.lock ./
COPY packages/shared/package.json         ./packages/shared/
COPY packages/crypto/package.json         ./packages/crypto/
COPY packages/email-parser/package.json   ./packages/email-parser/
COPY packages/db/package.json             ./packages/db/
COPY services/mta/package.json            ./services/mta/

# --frozen-lockfile = fail if bun.lock disagrees with package.json
RUN bun install --frozen-lockfile

# ── Stage 2: Build ──────────────────────────────────────────────────────────
FROM oven/bun:1.2-alpine AS builder

WORKDIR /app

# Bring in the resolved node_modules trees from the deps stage
COPY --from=deps /app/node_modules                         ./node_modules
COPY --from=deps /app/packages/shared/node_modules         ./packages/shared/node_modules
COPY --from=deps /app/packages/crypto/node_modules         ./packages/crypto/node_modules
COPY --from=deps /app/packages/email-parser/node_modules   ./packages/email-parser/node_modules
COPY --from=deps /app/packages/db/node_modules             ./packages/db/node_modules
COPY --from=deps /app/services/mta/node_modules            ./services/mta/node_modules

# Now copy source (the previous layer is cache-safe unless manifests change)
COPY . .

# Build workspace deps in dependency order, then the MTA itself
RUN bun run --filter @alecrae/shared       build
RUN bun run --filter @alecrae/crypto       build
RUN bun run --filter @alecrae/email-parser build
RUN bun run --filter @alecrae/db           build
RUN bun run --filter @alecrae/mta          build

# ── Stage 3: Runtime ────────────────────────────────────────────────────────
FROM oven/bun:1.2-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# ca-certificates — outbound TLS validation of recipient servers
# bind-tools   — dig for MX lookup debugging (used by delivery optimizer
#                when DNS over Node's resolver is stale)
# openssl      — manual cert inspection during incidents
# curl         — healthcheck + support diagnostics
RUN apk add --no-cache \
      ca-certificates \
      bind-tools \
      openssl \
      curl \
      tini

# Non-root runtime user. uid/gid 1001 matches the existing
# infrastructure/docker/Dockerfile.mta for consistency.
RUN addgroup --system --gid 1001 alecrae && \
    adduser  --system --uid 1001 --ingroup alecrae mta

# Copy built artifacts + node_modules. Only the compiled output and its
# runtime deps land in the final image — source is NOT shipped.
COPY --from=builder --chown=mta:alecrae /app/services/mta/dist           ./services/mta/dist
COPY --from=builder --chown=mta:alecrae /app/services/mta/package.json   ./services/mta/
COPY --from=builder --chown=mta:alecrae /app/packages/shared/dist        ./packages/shared/dist
COPY --from=builder --chown=mta:alecrae /app/packages/shared/package.json ./packages/shared/
COPY --from=builder --chown=mta:alecrae /app/packages/crypto/dist        ./packages/crypto/dist
COPY --from=builder --chown=mta:alecrae /app/packages/crypto/package.json ./packages/crypto/
COPY --from=builder --chown=mta:alecrae /app/packages/email-parser/dist  ./packages/email-parser/dist
COPY --from=builder --chown=mta:alecrae /app/packages/email-parser/package.json ./packages/email-parser/
COPY --from=builder --chown=mta:alecrae /app/packages/db/dist            ./packages/db/dist
COPY --from=builder --chown=mta:alecrae /app/packages/db/package.json    ./packages/db/
COPY --from=builder --chown=mta:alecrae /app/node_modules                ./node_modules
COPY --from=builder --chown=mta:alecrae /app/package.json                ./

# Fly mounts the persistent volume at /data. Pre-create the subdirs that
# TLS_CERTS_DIR / DKIM_KEYS_DIR / MAIL_SPOOL_DIR point at (see fly.toml)
# so startup doesn't fail when the volume is fresh.
RUN mkdir -p /data/tls /data/dkim /data/spool /data/logs && \
    chown -R mta:alecrae /data

USER mta

# Exposed ports (documentation — Fly wires these via [[services]] in fly.toml):
#   25   SMTP inbound (MX)
#   465  SMTPS submission (implicit TLS)
#   587  SMTP submission (STARTTLS)
#   2525 SMTP submission backup (for blocked 587)
#   8080 HTTP healthcheck + /metrics (NEVER used for mail)
EXPOSE 25 465 587 2525 8080

# tini as PID 1 — reaps zombies, forwards signals correctly to Bun so
# SIGTERM from Fly triggers the graceful shutdown path in index.ts.
ENTRYPOINT ["/sbin/tini", "--"]

CMD ["bun", "run", "services/mta/dist/index.js"]
