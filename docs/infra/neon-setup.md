# Neon Postgres Setup — AlecRae

Follow top to bottom. Every step is a URL to click or a command to paste. Values you fill in are marked `<like-this>`.

---

## 1. Signup

1. Go to https://console.neon.tech
2. Sign up with GitHub (recommended — matches our repo)
3. Free tier is fine to start. No credit card needed.

---

## 2. Create project

1. Click **New Project**
2. Project name: `alecrae-prod`
3. Postgres version: **16** (latest stable)
4. Region: **US East (Ohio) — aws-us-east-2**
   - This matches Fly.io `iad` so MTA latency stays low.
5. Click **Create Project**

---

## 3. Database + role

Neon creates these by default — leave them as-is:

- Database: `neondb`
- Role: `neondb_owner`

No action needed. Skip to step 4.

---

## 4. Get connection strings

From the project **Dashboard → Connection Details** panel:

1. **Pooled connection** (for web app / edge / serverless)
   - Toggle **Pooled connection** to **ON**
   - Copy the string. It will look like:
     ```
     postgresql://neondb_owner:<password>@ep-xxx-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require
     ```
   - Note the `-pooler` in the host — that's how you know it's pooled.

2. **Direct connection** (for migrations only)
   - Toggle **Pooled connection** to **OFF**
   - Copy the string. It will look like:
     ```
     postgresql://neondb_owner:<password>@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require
     ```
   - No `-pooler` — this is the direct endpoint.

Save both somewhere safe (1Password). You'll paste them in step 5.

---

## 5. Environment variables

Paste into your local `.env` and into Vercel / Cloudflare Pages project settings:

```
DATABASE_URL=<paste-pooled-connection-string-here>
DIRECT_URL=<paste-direct-connection-string-here>
```

- `DATABASE_URL` — used by the app at runtime (pooled, serverless-friendly)
- `DIRECT_URL` — used by Drizzle for migrations (direct, no pooler)

---

## 6. Run the setup SQL

Pick ONE of these three paths.

### Path A — Neon SQL Editor (easiest, dashboard)

1. In the Neon dashboard, click **SQL Editor** in the left sidebar
2. Open `/home/user/AlecRae.com/infra/neon-setup.sql` locally, copy the full contents
3. Paste into the editor
4. Click **Run**

### Path B — psql CLI (if you have psql installed)

```
psql "<your-direct-url>" -f infra/neon-setup.sql
```

### Path C — Drizzle push (recommended for developers)

```
cd packages/db
bun install
bun run db:push
```

This uses `DIRECT_URL` and pushes our Drizzle schemas directly — no SQL file needed.

---

## 7. Verify

In the Neon SQL Editor (or via psql), run:

```sql
SELECT version();
```

You should see `PostgreSQL 16.x ...`

List tables:

```sql
\dt
```

Or in the Neon editor (no psql shortcuts):

```sql
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
```

Smoke test an insert/select:

```sql
CREATE TABLE IF NOT EXISTS _smoke (id serial primary key, note text);
INSERT INTO _smoke (note) VALUES ('hello alecrae');
SELECT * FROM _smoke;
DROP TABLE _smoke;
```

If all four statements succeed, Neon is wired up correctly.

---

## 8. Branching (staging)

Neon branches are like git branches for your database. Use one for staging.

1. Dashboard → **Branches** → **New Branch**
2. Name: `develop`
3. Parent: `main`
4. Click **Create Branch**
5. Copy the branch's pooled + direct connection strings the same way you did in step 4
6. Set them as `DATABASE_URL` / `DIRECT_URL` in the staging environment (Vercel preview, etc.)

Branches copy data at creation time and are free on the free tier (up to 10).

---

## 9. Point-in-time recovery

If data is lost or corrupted:

1. Dashboard → **Branches** → click `main`
2. Click **Restore** (top right)
3. Pick a timestamp (free tier: last 24h; Scale plan: last 7–30 days)
4. Neon creates a new branch at that point in time
5. Inspect it, and if it looks right, either:
   - Swap your `DATABASE_URL` to the new branch, OR
   - Promote the restored branch to `main` (dashboard → branch settings → Set as primary)

No destructive overwrite of current data happens unless you explicitly promote.

---

## 10. Scale-to-zero

Neon suspends compute after 5 minutes of inactivity (free tier default). First request after idle = ~500ms cold start.

**Keep the MTA warm:**

The MTA on Fly.io holds a long-lived connection via the Neon pooler. As long as the pooler sees traffic, the compute stays awake. If MTA traffic is sparse:

1. Dashboard → **Settings** → **Compute**
2. Set **Suspend compute after** to a higher value (or disable on paid plans)
3. OR run a tiny heartbeat job on Fly.io that does `SELECT 1` every 60s

The pooler endpoint (`-pooler` in the host) handles connection multiplexing so scale-to-zero behaves well with serverless + long-lived clients side by side.

---

## 11. Cost expectations

**Free tier:**
- 0.5 GB storage
- 190 compute hours/month (one always-on branch)
- 10 branches
- 24h point-in-time recovery

**When to upgrade to Scale ($19/mo):**
- Storage approaches 500 MB (~200K emails at full fidelity)
- You want >24h PITR
- You need autoscaling beyond 0.25 CU
- You want to run multiple always-on branches (staging + prod)

**Beyond Scale:** Usage-based. Budget alerts live under **Billing → Alerts**. Set one at $50/mo to start.

Ping Craig before moving to any paid tier — infra spend is a Boss-Rule item.
