# Morning Setup — Get AlecRae Live Today

> **Last updated: 2026-07-13 12:10 UTC**

This is the single document you follow on the box. Every command is copy-pasteable. No options — one path, start to finish.

**Time to live:** ~45 minutes.

---

## Section 1: Production Box — Jarvis (66.42.121.161)

> Production compute is the **Jarvis box** (`66.42.121.161`, hostname `jarvis`).
> The old Vapron box (`149.28.119.158`, "158") is the **dedicated MAIL box**
> (MTA + inbound — Option A, decided 2026-07-13; see
> `docs/infra/multi-platform-mail-plan.md` §4). Coolify/Traefik owns
> ports 80/443 on Jarvis (route file: `/data/coolify/proxy/dynamic/alecrae.yaml`);
> `alecrae-api` (:4100) and `alecrae-web` (:4200) must bind `0.0.0.0`.

### 1a. SSH in

```bash
ssh root@jarvis        # via Tailscale SSH (or: ssh root@66.42.121.161)
```

(or substitute your operator username if not root)

### 1b. Pull latest main and migrate

```bash
cd /opt/alecrae
git pull --ff-only origin main
bun install
bun run -C packages/db build
bun run db:migrate
```

> **Box path is `/opt/alecrae`** — NOT `/root/AlecRae.com`.

### 1c. Set all required env vars

Edit the production `.env` file. Every variable below must be set. Generate `JWT_SECRET` first:

```bash
openssl rand -base64 48
```

Copy the output, then open the env file:

```bash
nano /opt/alecrae/.env
```

Paste and fill in every line:

```bash
NODE_ENV=production
PORT=4100

# Database (your local Postgres)
DATABASE_URL=postgresql://alecrae:YOUR_DB_PASSWORD@localhost:5432/alecrae

# Auth — REQUIRED, API will refuse to boot without these
JWT_SECRET=PASTE_THE_OPENSSL_OUTPUT_HERE
WEBAUTHN_RP_ID=alecrae.com
WEBAUTHN_ORIGIN=https://mail.alecrae.com

# Google OAuth — fill in after Section 2
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_AUTH_REDIRECT_URI=https://api.alecrae.com/v1/auth/callback/google
GOOGLE_REDIRECT_URI=https://api.alecrae.com/v1/connect/callback/gmail

# Vapron — get from https://dash.vapron.ai
VAPRON_API_KEY=vpk_YOUR_KEY_HERE
VAPRON_BASE_URL=https://api.vapron.ai/api/trpc
VAPRON_WELCOME_EMAIL=true

# Owner access — add your Gmail so you get owner/admin role
OWNER_EMAILS=ccantynz@gmail.com

# Email relay (Resend — domain alecrae.com must be verified in Resend dashboard)
RELAY_PROVIDER=smtp
SMTP_RELAY_HOST=smtp.resend.com
SMTP_RELAY_PORT=465
SMTP_RELAY_USERNAME=resend
SMTP_RELAY_PASSWORD=YOUR_RESEND_API_KEY
SMTP_RELAY_TLS=true

# Optional but strongly recommended
ANTHROPIC_API_KEY=sk-ant-YOUR_KEY
```

Save and close (`Ctrl+O`, `Enter`, `Ctrl+X` in nano).

### 1d. Restart services

```bash
sudo systemctl restart alecrae-api alecrae-web
```

Wait 5 seconds, then:

```bash
sudo systemctl status alecrae-api alecrae-web
```

Both should show `active (running)`.

### 1e. Test the API is up

```bash
curl https://api.alecrae.com/health
```

Expected: `{"status":"ok","version":"..."}` — if you see that, the box is live.

---

## Section 2: Google OAuth Setup (~10 minutes)

You need this so "Sign in with Google" works on the login page.

1. Go to **https://console.cloud.google.com**
2. Click the project dropdown (top bar) → **New Project**
   - Project name: `AlecRae`
   - Click **Create**
3. Make sure the new project is selected in the dropdown
4. Left sidebar → **APIs & Services** → **Library**
   - Search for `Gmail API` → click it → **Enable**
5. Left sidebar → **APIs & Services** → **OAuth consent screen**
   - User type: **External** → **Create**
   - App name: `AlecRae`
   - User support email: `ccantynz@gmail.com`
   - Developer contact: `ccantynz@gmail.com`
   - Click **Save and Continue** (skip Scopes, skip Test users)
   - Click **Back to Dashboard**
6. Left sidebar → **APIs & Services** → **Credentials**
   - Click **+ Create Credentials** → **OAuth 2.0 Client ID**
   - Application type: **Web application**
   - Name: `AlecRae Web`
   - Under **Authorized redirect URIs**, add BOTH:
     ```
     https://api.alecrae.com/v1/auth/callback/google
     https://api.alecrae.com/v1/connect/callback/gmail
     ```
   - Click **Create**
7. A dialog appears with **Client ID** and **Client Secret** — copy both
8. Go back to the box:

```bash
nano /opt/alecrae/.env
```

Fill in:

```bash
GOOGLE_CLIENT_ID=PASTE_CLIENT_ID_HERE
GOOGLE_CLIENT_SECRET=PASTE_CLIENT_SECRET_HERE
```

Save, then restart:

```bash
sudo systemctl restart alecrae-api
```

---

## Section 3: DNS Fixes (~5 minutes in Cloudflare)

Go to **https://dash.cloudflare.com** → click `alecrae.com` → **DNS** → **Records**.

> **Current state (verified 2026-07-13):** `alecrae.com`, `mail.alecrae.com`, and
> `api.alecrae.com` resolve via Cloudflare **proxied** (orange cloud) to the Jarvis
> box and serve 200 OK — the web side is done. **Mail decision made (Option A,
> 2026-07-13):** the 158 box (`149.28.119.158`) stays as the dedicated mail box, so
> the mail records below target `149.28.119.158`. The live SPF already authorizes
> 149 and the PTR on 149 → `mail.alecrae.com` is already set; the still-missing
> records (mx1/mx2 A, `_spf` TXT, grey-clouding `mail.alecrae.com`) await Craig's
> Cloudflare execution — see `docs/infra/multi-platform-mail-plan.md`.

### Fix the apex A record

Find the existing `A` record for `alecrae.com` (update if it still points anywhere other than the box). Click **Edit**:
- Type: `A`
- Name: `@`
- IPv4 address: `66.42.121.161`
- Proxy status: proxied (orange) is fine for web traffic — this is the current working state
- Click **Save**

### Fix www.alecrae.com

If a `CNAME` for `www` exists pointing anywhere other than the box, delete it, then add:
- Type: `A`
- Name: `www`
- IPv4 address: `66.42.121.161`

### Add MX host records — ⚠ pending DNS change (Option A decided; awaiting Cloudflare execution)

These records do **not exist in DNS yet**. Target state — mail box `149.28.119.158` (mail records must be **DNS only** — grey cloud — SMTP cannot go through Cloudflare's HTTP proxy):

| Type | Name | IPv4 address | Proxy |
|------|------|-------------|-------|
| A | `mx1` | `149.28.119.158` | DNS only |
| A | `mx2` | `149.28.119.158` | DNS only |

### Add MX routing record (replace Cloudflare Email Routing if present)

Remove the `route1/route2/route3.mx.cloudflare.net` MX records if they exist, then add:

| Type | Name | Mail server | Priority |
|------|------|-------------|----------|
| MX | `@` | `mx1.alecrae.com` | `10` |
| MX | `@` | `mx2.alecrae.com` | `20` |

### Add SPF records — ⚠ `_spf` still pending (Option A decided; awaiting Cloudflare execution)

**Current reality:** the live SPF (`spf.alecrae.com` TXT) **already authorizes the 149 mail box** — correct under Option A, no IP churn needed. `_spf.alecrae.com` does not exist yet. Target state (mail box `149.28.119.158`) below; the `_spf` record awaits Craig's Cloudflare execution.

Two SPF records are required — one for `alecrae.com` itself, one for customer domains:

| Type | Name | Content | TTL | Purpose |
|------|------|---------|-----|---------|
| TXT | `@` | `v=spf1 ip4:149.28.119.158 include:spf.resend.com ~all` | Auto | Outbound from alecrae.com (direct from the mail box or via Resend) |
| TXT | `_spf` | `v=spf1 ip4:149.28.119.158 ~all` | Auto | Included by customer domain SPF records |

The `_spf.alecrae.com` record is what the DNS auto-config service tells customers to include in their SPF (`include:_spf.alecrae.com`). Without it, customer domain SPF verification fails.

(If an SPF record already exists on `@`, edit it — there can only be one.)

### Resend domain verification

If you haven't already:
1. Go to **https://resend.com/domains** → your `alecrae.com` domain
2. Add the DNS records shown (DKIM TXT + MX for bounces)
3. Click **Verify Domain** — must show green ✓ before outbound email works

### Reverse DNS (PTR) — ✅ ALREADY SET (Option A)

The PTR for the mail box (`149.28.119.158`) already reads `mail.alecrae.com` — nothing to do. (Jarvis's PTR stays the generic choopa.net one; Jarvis doesn't send mail.)

### Port 25 — outbound ✅ done, inbound pending Phase 2

- **Outbound port 25 on `149.28.119.158` is already unblocked by Vultr** — no ticket needed.
- **Inbound port 25 on 158 is currently closed** — it gets opened via ufw + the `alecrae-inbound` service in Phase 2 of `docs/infra/multi-platform-mail-plan.md`. Until then, Resend relay on port 465 handles outbound.

---

## Section 4: Uninstall Vercel GitHub App (if not done already)

This stops Vercel from trying to deploy on every push (Vercel is no longer the host — the Jarvis box is).

1. Go to **https://github.com/ccantynz-alt/AlecRae.com**
2. Click **Settings** → left sidebar → **Integrations** → **GitHub Apps**
3. Find **Vercel** → click **Configure**
4. Scroll to the bottom → **Danger zone** → **Uninstall**

Alternatively, from vercel.com:
1. Go to **https://vercel.com** → your project
2. **Settings** → **General** → scroll to bottom → **Delete Project** → confirm

If already done, skip this section.

---

## Section 5: First Business Email Mailbox

Wait ~15 minutes after the DNS changes for propagation, then:

1. Go to **https://mail.alecrae.com**
2. Sign in with Google (your ccantynz@gmail.com account)
3. You should land in the **Onboarding** wizard → **Connect a Gmail account** to link your existing Gmail inbox, OR skip straight to the sidebar
4. Sidebar → **Workspace** → **Domains** tab
5. Click **Add Domain** → enter your domain (e.g., `alecrae.com` or your business domain)
6. Follow the DNS verification steps shown (add a TXT record)
7. Once verified, go to the **Mailboxes** tab → **Create Mailbox**
   - Username: `craig` (or whatever prefix you want)
   - Domain: your verified domain
   - Display name: `Craig`
   - Click **Create**

Your new address is live. Send a test email to it from any external mailbox.

**Backup — curl commands if the UI isn't cooperating:**

```bash
# Get your auth token first (replace with your actual token from the browser)
TOKEN="paste_token_from_browser_devtools_here"

# Add a domain
curl -X POST https://api.alecrae.com/v1/domains \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"domain":"yourdomain.com","provider":"alecrae"}'

# Create a mailbox (replace DOMAIN_ID with the id from the response above)
curl -X POST https://api.alecrae.com/v1/mailboxes \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"username":"craig","domainId":"DOMAIN_ID","displayName":"Craig"}'
```

---

## Section 6: Test Checklist

Work through these top to bottom. Stop at the first failure and fix it before moving on.

- [ ] `curl https://api.alecrae.com/health` returns `{"status":"ok",...}`
- [ ] `curl https://mail.alecrae.com/api/version` returns a commit hash
- [ ] Visit `https://mail.alecrae.com/login` — page loads without errors
- [ ] Click **Sign in with Google** — completes and redirects to `/onboarding` or `/inbox`
- [ ] Inbox loads (may show "Connect an account" if no Gmail linked yet — that's correct)
- [ ] Sidebar shows **Workspace** and **Admin** items (confirms owner role assigned)
- [ ] Workspace → **Add Domain** → enter a domain → DNS records page appears
- [ ] Send a test email from Gmail to your new `craig@yourdomain.com` mailbox → it appears in the inbox within 30 seconds
- [ ] Reply from AlecRae → appears in Gmail inbox (confirms outbound SMTP working)

---

## Section 7: Start the MTA Worker (outbound email)

Email sending requires Redis + the MTA worker. **As of 2026-07-13 the MTA is NOT running on any box** — set it up on the **mail box (`149.28.119.158`; `ssh root@vapron-158` via Tailscale)** per `docs/infra/mta-box-setup.md`. Note `vapron-bun-gateway` owns 80/443 on the 158 box (Coolify/Traefik does NOT run there), so keep the MTA health port at the default `HEALTH_PORT=8082`. Short version (run on the mail box):

```bash
# Install Redis (if not already installed)
apt-get install -y redis-server && systemctl enable redis-server && systemctl start redis-server

# Create and start the MTA service (see mta-box-setup.md for the full service file)
systemctl enable alecrae-mta && systemctl start alecrae-mta
```

Until the MTA is running, emails compose and queue fine but are never delivered.

---

## Quick Reference: Useful Commands on the Box

```bash
# Check service logs
sudo journalctl -u alecrae-api -f --since "5 minutes ago"
sudo journalctl -u alecrae-web -f --since "5 minutes ago"
sudo journalctl -u alecrae-mta -f --since "5 minutes ago"

# Check which build is running
curl http://localhost:4200/api/version

# Run DB migrations manually
cd /opt/alecrae && bun run db:migrate

# Restart everything (+ MTA if it exists)
sudo systemctl restart alecrae-api alecrae-web
if systemctl is-enabled alecrae-mta 2>/dev/null; then sudo systemctl restart alecrae-mta; fi

# Check the health endpoint directly (bypasses Coolify/Traefik)
curl http://localhost:4100/health

# Check Redis (BullMQ queue)
redis-cli ping
redis-cli LLEN "bull:alecrae-outbound:wait"
```
