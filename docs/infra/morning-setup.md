# Morning Setup — Get AlecRae Live Today

> **Last updated: 2026-06-15 04:30 UTC**

This is the single document you follow tomorrow morning. Every command is copy-pasteable. No options — one path, start to finish.

**Time to live:** ~45 minutes.

---

## Section 1: Production Box (149.28.119.158)

### 1a. SSH in

```bash
ssh root@149.28.119.158
```

(or substitute your operator username if not root)

### 1b. Pull latest main and migrate

```bash
cd /root/AlecRae.com   # adjust if your checkout is elsewhere
git pull --ff-only origin main
bun install
bun run -C packages/db build
bun run db:migrate
```

### 1c. Set all required env vars

Edit the production `.env` file. Every variable below must be set. Generate `JWT_SECRET` first:

```bash
openssl rand -base64 48
```

Copy the output, then open the env file:

```bash
nano /root/AlecRae.com/.env
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
nano /root/AlecRae.com/.env
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

### Change the apex A record

Find the existing `A` record for `alecrae.com` (currently pointing at Vercel). Click **Edit**:
- Type: `A`
- Name: `@`
- IPv4 address: `149.28.119.158`
- Proxy status: **DNS only** (grey cloud — NOT orange)
- Click **Save**

### Add MX host records

Click **Add record** for each:

| Type | Name | IPv4 address | Proxy |
|------|------|-------------|-------|
| A | `mx1` | `149.28.119.158` | DNS only |
| A | `mx2` | `149.28.119.158` | DNS only |

### Add MX routing record

| Type | Name | Mail server | Priority |
|------|------|-------------|----------|
| MX | `@` | `mx1.alecrae.com` | `10` |
| MX | `@` | `mx2.alecrae.com` | `20` |

### Add SPF record

| Type | Name | Content | TTL |
|------|------|---------|-----|
| TXT | `@` | `v=spf1 ip4:149.28.119.158 ~all` | Auto |

(If an SPF record already exists, edit it — there can only be one.)

### Set reverse DNS (PTR) in Vultr

1. Log in to **https://my.vultr.com**
2. Click your VPS instance → **Settings** → **IPv4**
3. Find `149.28.119.158` → click the pencil icon next to rDNS
4. Set it to: `mail.alecrae.com`
5. Click **Update**

### Unblock port 25 in Vultr

1. In the Vultr control panel → **Network** → **Firewall** (or the instance firewall)
2. Add a rule: Protocol `TCP`, Port `25`, Source `0.0.0.0/0` → **Add**
3. If there's a banner saying "Port 25 is blocked for spam prevention", open a support ticket:
   > "Please unblock port 25 on instance 149.28.119.158. I'm running AlecRae, a business email service. Outbound SMTP is required for our MTA."
   Vultr typically unblocks within a few hours.

---

## Section 4: Uninstall Vercel GitHub App

This stops Vercel from trying to deploy on every push (and failing because Vercel is no longer the host).

1. Go to **https://github.com/ccantynz-alt/AlecRae.com**
2. Click **Settings** → left sidebar → **Integrations** → **GitHub Apps**
3. Find **Vercel** → click **Configure**
4. Scroll to the bottom → **Danger zone** → **Uninstall**

Alternatively, from vercel.com:
1. Go to **https://vercel.com** → your project
2. **Settings** → **General** → scroll to bottom → **Delete Project** → confirm

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

## Quick Reference: Useful Commands on the Box

```bash
# Check service logs
sudo journalctl -u alecrae-api -f --since "5 minutes ago"
sudo journalctl -u alecrae-web -f --since "5 minutes ago"

# Check which build is running
curl http://localhost:4200/api/version

# Run DB migrations manually
cd /root/AlecRae.com && bun run db:migrate

# Restart everything
sudo systemctl restart alecrae-api alecrae-web

# Check the health endpoint directly (bypasses vapron-bun-gateway)
curl http://localhost:4100/health
```
