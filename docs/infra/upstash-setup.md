# Upstash Redis Setup — AlecRae

Follow top to bottom. Every step is a URL to click or a command to paste. Values you fill in are marked `<like-this>`.

---

## 1. Signup

1. Go to https://console.upstash.com
2. Sign up with GitHub (recommended — matches our repo)
3. Free tier is fine to start. No credit card needed.

---

## 2. Create Redis database

1. Console → **Redis** → **Create Database**
2. Name: `alecrae-prod`
3. Type: **Regional** (NOT Global)
   - Regional = lowest latency to MTA on Fly.io
   - Global costs more and we don't need multi-region writes
4. Primary region: **us-east-1 (N. Virginia)**
   - Matches Fly.io `iad` and Neon `us-east-2` — all three sit in the same east-coast cluster
5. Click **Create**

---

## 3. Enable TLS + eviction

On the new database page:

1. **TLS/SSL:** already ON by default — confirm the toggle is green
2. **Eviction:** click **Configuration** → **Eviction** → set to `allkeys-lru`
   - When memory fills, Redis drops the least-recently-used keys
   - Required for our cache use case (we don't want writes to fail when full)
3. Click **Save**

---

## 4. Get credentials

On the database page, scroll to **REST API** section:

1. Copy **UPSTASH_REDIS_REST_URL** — looks like:
   ```
   https://<your-db-name>.upstash.io
   ```
2. Copy **UPSTASH_REDIS_REST_TOKEN** — long opaque string starting with `A...`

Save both in 1Password.

---

## 5. Environment variables

Paste into your local `.env` and into Vercel / Cloudflare Pages project settings:

```
UPSTASH_REDIS_REST_URL=<paste-url-here>
UPSTASH_REDIS_REST_TOKEN=<paste-token-here>
```

---

## 6. Verify

From any terminal:

```
curl -X POST <your-rest-url>/set/smoke/hello \
  -H "Authorization: Bearer <your-rest-token>"
```

Expected response:
```
{"result":"OK"}
```

Then read it back:

```
curl <your-rest-url>/get/smoke \
  -H "Authorization: Bearer <your-rest-token>"
```

Expected response:
```
{"result":"hello"}
```

Clean up:

```
curl -X POST <your-rest-url>/del/smoke \
  -H "Authorization: Bearer <your-rest-token>"
```

If all three return `{"result":...}`, Upstash is wired up correctly.

---

## 7. Usage in AlecRae

Redis powers four subsystems. The app already reads the two env vars above and routes everything through them.

1. **Rate limiting (6-tier)**
   - Per-IP, per-user, per-endpoint
   - Token bucket + sliding window
   - Keys: `rl:<tier>:<id>`
2. **Job queue** (MTA outbound, webhook delivery, AI triage overnight)
   - Keys: `queue:<name>`
3. **Cache** (hot inbox reads, thread summaries, sender reputation)
   - Keys: `cache:<resource>:<id>`
4. **Session store** (short-lived auth sessions, magic-link tokens, OTPs)
   - Keys: `session:<token>`

No manual setup — the app writes to the right prefixes automatically.

---

## 8. TTL strategy

Default TTLs per use case, set by the app:

| Use case | Key prefix | TTL |
|---|---|---|
| Rate limit counters | `rl:*` | 60s – 1h (per tier) |
| Job queue entries | `queue:*` | no TTL (consumed by worker) |
| Inbox cache | `cache:inbox:*` | 5 min |
| Thread summary cache | `cache:summary:*` | 24h |
| Sender reputation cache | `cache:sender:*` | 7d |
| Auth session | `session:*` | 30 min (rolling) |
| Magic link | `session:magic:*` | 15 min |
| OTP | `session:otp:*` | 5 min |

Don't change these without reviewing the relevant route code — TTL drift causes subtle bugs.

---

## 9. Cost expectations

**Free tier:**
- 10,000 commands/day
- 256 MB max data
- Single region
- Good for local dev + early beta (≤100 active users)

**Beyond free:**
- $0.20 per 100K commands
- $0.25/GB/month storage
- No per-second charges, no ingress fees

**Rough projection:**
- 1K active users → ~$5–10/mo
- 10K active users → ~$50–80/mo
- 100K active users → ~$300–500/mo

Set a budget alert: Console → **Account** → **Billing** → **Alerts** → $25/mo initial.

Ping Craig before approving any auto-upgrade — infra spend is a Boss-Rule item.
