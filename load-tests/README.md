# AlecRae Load-Test Harness

k6-based load tests and smoke tests for the AlecRae API.
All scripts are plain JavaScript — no extra Node/Bun dependencies.
The only prerequisite is the [k6 binary](https://k6.io/docs/get-started/installation/).

---

## Prerequisites

```bash
# macOS
brew install k6

# Linux (Debian/Ubuntu)
sudo apt-get install k6

# Docker (no install required)
docker run --rm -i grafana/k6 run - < load-tests/smoke.js
```

Verify: `k6 version`

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `BASE_URL` | yes | `http://localhost:3001` | Full URL of the target API, no trailing slash. |
| `AUTH_TOKEN` | yes | *(fails if absent)* | Valid Bearer JWT for authenticated scenarios. |
| `REFRESH_TOKEN` | auth scenario only | falls back to `AUTH_TOKEN` | Refresh token for the `token_refresh` scenario. |
| `TEST_EMAIL` | auth scenario only | `loadtest@alecrae.com` | Email address of a pre-seeded test account. |
| `TEST_PASSWORD` | auth scenario only | `LoadTest1234!` | Password for the test account. |
| `SEED_MESSAGE_ID` | inbox scenario only | *(skips if absent)* | A known message ID in the target environment. |
| `FROM_EMAIL` | compose-send only | `loadtest@alecrae.com` | Sender address for test emails. |
| `TO_EMAIL` | compose-send only | `sink@alecrae.com` | Recipient for test emails (use a safe sink). |
| `SKIP_REAL_SEND` | compose-send only | `0` | Set to `1` to skip actual email sends. |
| `SKIP_ADMIN` | read-heavy + smoke | `0` | Set to `1` when `AUTH_TOKEN` is non-admin. |

**Never hardcode secrets.** Pass all credentials via `-e` flags or a `.env` file:

```bash
# .env (not committed — add to .gitignore)
BASE_URL=https://api.alecrae.com
AUTH_TOKEN=eyJhbGci...
```

```bash
k6 run --env-file .env load-tests/smoke.js
```

---

## Running Scenarios

### Post-deploy smoke test

Run immediately after every deployment.  Exits non-zero on any failure.

```bash
k6 run \
  -e BASE_URL=https://api.alecrae.com \
  -e AUTH_TOKEN=<token> \
  load-tests/smoke.js
```

Pass `SKIP_ADMIN=1` if your token is not admin-scoped:

```bash
k6 run -e BASE_URL=... -e AUTH_TOKEN=... -e SKIP_ADMIN=1 load-tests/smoke.js
```

Using the npm/bun script shortcut (after setting env vars):

```bash
BASE_URL=https://api.alecrae.com AUTH_TOKEN=<token> bun run load-test:smoke
```

---

### Auth scenario

Tests login, token refresh, and `/v1/auth/me` at realistic concurrency.
Auth endpoints have a 10 req/min per-IP rate limit — the scenario includes
per-VU sleeps to respect this.

```bash
k6 run \
  -e BASE_URL=https://api.alecrae.com \
  -e AUTH_TOKEN=<token> \
  -e TEST_EMAIL=loadtest@alecrae.com \
  -e TEST_PASSWORD=LoadTest1234! \
  load-tests/scenarios/auth.js
```

---

### Inbox scenario

Tests the critical inbox load path — the one with the strictest budget
(`< 100 ms cached`, `< 1 500 ms cold`).

```bash
k6 run \
  -e BASE_URL=https://api.alecrae.com \
  -e AUTH_TOKEN=<token> \
  [-e SEED_MESSAGE_ID=<message_id>] \
  load-tests/scenarios/inbox.js
```

---

### Search scenario

Tests Meilisearch performance under concurrent search load.
Budget: p99 `< 200 ms`.

```bash
k6 run \
  -e BASE_URL=https://api.alecrae.com \
  -e AUTH_TOKEN=<token> \
  load-tests/scenarios/search.js
```

---

### Compose & send scenario

Tests the email enqueue path.  Budget: p99 `< 2 000 ms`.

> Use a test domain or `SKIP_REAL_SEND=1` on staging.

```bash
k6 run \
  -e BASE_URL=https://api.alecrae.com \
  -e AUTH_TOKEN=<token> \
  -e FROM_EMAIL=loadtest@alecrae.com \
  -e TO_EMAIL=sink@alecrae.com \
  load-tests/scenarios/compose-send.js

# AI draft only (no MTA touch)
k6 run \
  -e BASE_URL=https://api.alecrae.com \
  -e AUTH_TOKEN=<token> \
  -e SKIP_REAL_SEND=1 \
  load-tests/scenarios/compose-send.js
```

---

### Read-heavy scenario

Tests aggregate/admin endpoints and the list-emails path at high concurrency.

```bash
# With an admin token
k6 run \
  -e BASE_URL=https://api.alecrae.com \
  -e AUTH_TOKEN=<admin_token> \
  load-tests/scenarios/read-heavy.js

# With a regular user token
k6 run \
  -e BASE_URL=https://api.alecrae.com \
  -e AUTH_TOKEN=<token> \
  -e SKIP_ADMIN=1 \
  load-tests/scenarios/read-heavy.js
```

---

### Full suite (mixed workload)

Realistic mixed-traffic simulation: auth, inbox, search, list, and compose
running simultaneously.  Best for pre-launch capacity testing.

```bash
k6 run \
  -e BASE_URL=https://api.alecrae.com \
  -e AUTH_TOKEN=<token> \
  load-tests/scenarios/full-suite.js
```

---

## Reading Results

k6 prints a summary table at the end of every run.  Key columns:

| Metric | What it tells you |
|---|---|
| `http_req_duration p(95)/p(99)` | Latency at the 95th/99th percentile. **Must stay under the thresholds.** |
| `http_req_failed rate` | Fraction of requests that returned a non-2xx or network error. Must be `< 1 %` (smoke: `0 %`). |
| `checks` | Pass/fail count for explicit `.check()` assertions. |
| Custom counters (e.g. `login_failures`) | Scenario-specific error tracking. |

A run **passes** (exit 0) when every threshold is met.
A run **fails** (exit 1) when any threshold is violated.

### Useful CLI flags

```bash
# More granular output
k6 run --http-debug=full ...

# Save results to JSON for later analysis
k6 run --out json=results.json ...

# Send to Grafana Cloud
k6 run --out cloud ...

# Run only specific scenarios in a multi-scenario file
k6 run --scenario login ...
```

---

## Performance Budgets (from CLAUDE.md)

These thresholds are encoded directly in `lib/thresholds.js` and are
enforced by each scenario file:

| Endpoint / Path | p95 | p99 |
|---|---|---|
| Inbox (cached) | 100 ms | 200 ms |
| Inbox (cold) | 1 000 ms | 1 500 ms |
| Search (server) | 150 ms | 200 ms |
| Auth /me | 100 ms | 200 ms |
| Auth login | 500 ms | 800 ms (Argon2id) |
| Auth token refresh | 100 ms | 200 ms |
| Admin stats | 150 ms | 200 ms |
| Email send enqueue | 1 500 ms | 2 000 ms |
| Compose assist (AI) | 1 000 ms | 2 000 ms |
| Error rate (all) | — | < 1 % |
| Error rate (smoke) | — | 0 % |

---

## File Layout

```
load-tests/
├── README.md                  ← you are here
├── smoke.js                   ← post-deploy smoke test (1 VU, 1 iteration)
├── lib/
│   ├── helpers.js             ← shared HTTP helpers, env var accessors
│   └── thresholds.js          ← all CLAUDE.md performance budgets as k6 thresholds
└── scenarios/
    ├── auth.js                ← login, token refresh, /me
    ├── inbox.js               ← list messages, single message, inbox metadata
    ├── search.js              ← AI search, smart filter, search status
    ├── compose-send.js        ← email send enqueue, AI compose assist
    ├── read-heavy.js          ← admin stats, admin messages, list emails, heatmap
    └── full-suite.js          ← combined mixed-traffic simulation
```

---

_Last updated: 2026-06-08 23:35 UTC_
