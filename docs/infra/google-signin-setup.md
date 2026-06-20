# Google Sign-In — Go-Live Checklist

**TL;DR:** The Google login code is fully built and your Google Cloud console is configured
correctly. Nothing is wrong with either. Login fails today (Google AND email/password)
because the API server isn't deployed yet — every sign-in method talks to
`api.alecrae.com`, and nothing is listening there. Complete the steps below and both
methods light up at once.

---

## What's already done ✅

| Piece | Status |
|---|---|
| "Sign in with Google" button on `/login` | Built (PR #48) |
| API routes `/v1/auth/google` + `/v1/auth/callback/google` | Built |
| Web callback page `/google/callback` (stores session, routes to inbox) | Built |
| Email + password login (`POST /v1/auth/login`) | Built |
| Passkey login (WebAuthn) | Built |
| Google Cloud OAuth client (ID `555087940429-p9qr1ds4pl7b21j8cvvm41itog7rf9qj`) | Created 9 June 2026 |
| Authorised JS origins: `https://mail.alecrae.com`, `https://api.alecrae.com` | ✅ matches code |
| Redirect URI: `https://api.alecrae.com/v1/auth/callback/google` (sign-in) | ✅ matches code default |
| Redirect URI: `https://api.alecrae.com/v1/connect/callback/gmail` (mailbox connect) | ✅ matches code default |

## What's blocking login ❌

1. **The API isn't running on the box.** `https://api.alecrae.com` doesn't respond. The web app's
   `NEXT_PUBLIC_API_URL` must be set in the box `.env`, so the login page reaches the right server.
   See `docs/infra/morning-setup.md` for the full env setup.
2. **No production database.** Login needs Postgres (`docs/infra/neon-setup.md` or local Postgres on the box).

---

## Step 1 — Recover the client secret (do this first, 2 min)

Google no longer lets you view a secret after creation (yours shows as `****1SgB`).
**If you didn't copy it on 9 June when you created the client:**

1. On the Client ID page you're already on → **Client secrets** → **Add secret**
2. Copy the new `GOCSPX-...` value IMMEDIATELY and store it in your password manager
3. Delete the old secret once the new one is deployed

The secret goes in the API's env as `GOOGLE_CLIENT_SECRET`. Never commit it.

## Step 2 — Provision the database

Follow `docs/infra/neon-setup.md` → gives you `DATABASE_URL`. Run `bun run db:migrate`.

## Step 3 — Deploy the API and point DNS

Follow `docs/infra/craig-go-live.md` Phase 5. Whatever host runs `apps/api`, point
`api.alecrae.com` at it in Cloudflare DNS. Minimum env vars for login to work:

```bash
DATABASE_URL=<from Neon>
JWT_SECRET=<random 64 bytes, base64>
WEB_URL=https://mail.alecrae.com
GOOGLE_CLIENT_ID=555087940429-p9qr1ds4pl7b21j8cvvm41itog7rf9qj.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=<from Step 1>
# Optional — defaults already match your console:
# GOOGLE_AUTH_REDIRECT_URI=https://api.alecrae.com/v1/auth/callback/google
```

Full list: `docs/infra/.env.production.template`.

## Step 4 — Tell the web app where the API lives

1. SSH to the box: `ssh root@149.28.119.158`
2. Edit `/opt/alecrae/.env` and add/confirm: `NEXT_PUBLIC_API_URL=https://api.alecrae.com`
3. Rebuild the web app and restart: `cd /opt/alecrae && bun run build:web && sudo systemctl restart alecrae-web`
   (`NEXT_PUBLIC_*` vars bake in at build time — a rebuild is required after changing them)

## Step 5 — Test

1. Open `https://mail.alecrae.com/login`
2. Click **Sign in with Google** → pick your account → should land in `/inbox`
3. Sign out, then test email + password

---

## Having BOTH Google and password login (your "just in case" setup)

Google sign-in matches accounts **by email address**, so both methods reach the same
account automatically:

- **If you register with email + password first**, then click "Sign in with Google"
  using the same address → Google signs into that same account. You now have both.
- **If your account was created BY Google sign-in**, it has no password yet
  (`passwordHash` is null) — there's currently no self-serve "set a password" screen.

**Recommended for your account:** once the API is live, register at `/register` with
your email + a password, then use "Sign in with Google" with the same address. From
then on, either method works, plus passkeys as a third fallback.

---

_Last updated: 2026-06-20 14:00 UTC_
