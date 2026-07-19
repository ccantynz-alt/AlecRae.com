# Box Deploy — the pull ritual, one command (or one tap)

> **Last updated:** 2026-07-20 00:00 UTC

Production **compute** is the **Jarvis box at `66.42.121.161`** (hostname `jarvis`;
serves `mail.alecrae.com` + `api.alecrae.com`). SSH access is via Tailscale:
`ssh root@jarvis`. The old Vapron box (`149.28.119.158`) is no longer web/api
compute — per Craig's 2026-07-13 decision (Option A,
`docs/infra/multi-platform-mail-plan.md` §4) it is now the **dedicated MAIL
box** (MTA + inbound; SSH via Tailscale peer `vapron-158`, 100.89.227.39:
`ssh root@vapron-158`). **This runbook covers web/api deploys to Jarvis only**
— mail-box (MTA) deployment lives in `docs/infra/mta-box-setup.md`. "Deployed"
means **merged to main AND pulled + rebuilt on the box**. This runbook covers
the three ways to do that, from most to least convenient.

## Option A — One tap from GitHub (iPad-friendly) ✦ recommended

After the one-time setup below, every deploy is:

1. Open the repo on GitHub (app or Safari) → **Actions** → **Deploy to Box**
2. Tap **Run workflow** → **Run workflow**
3. Watch the job — green check = live, with health checks confirmed

**One-time setup** (needs a single terminal session on the box — see Option C
for reaching it from an iPad):

```bash
# On the box: create a deploy key and authorize it
ssh-keygen -t ed25519 -f ~/.ssh/deploy_key -N ""
cat ~/.ssh/deploy_key.pub >> ~/.ssh/authorized_keys
cat ~/.ssh/deploy_key        # ← copy this output
```

Then on GitHub (works from iPad): repo → Settings → Secrets and variables →
Actions → New repository secret, and add:

| Secret | Value |
|---|---|
| `BOX_SSH_KEY` | the private key printed above (the whole block) |
| `BOX_HOST` | `66.42.121.161` (GitHub runners are not on the tailnet, so use the public IP — `jarvis` only resolves via Tailscale) |
| `BOX_USER` | the operator user on the box |
| `BOX_REPO_PATH` | absolute path of the AlecRae.com checkout on the box |

## Option B — One command on the box

```bash
cd /path/to/AlecRae.com && git pull --ff-only origin main && bash scripts/box-deploy.sh
```

`scripts/box-deploy.sh` runs the full ritual with fail-fast ordering:
git pull (ff-only) → `bun install` → `bun run db:migrate` → web build →
restart `alecrae-api` + `alecrae-web` → health-check both (`:4100/health`,
`:4200/api/version`). If any step fails, services are **not** restarted, so
the box keeps serving the previous working build.

Requires `DATABASE_URL` in the shell (the script tells you if it's missing).
Unit names / ports / health URLs are overridable via `ALECRAE_*` env vars —
see the script header.

## Option C — No computer? SSH from the iPad

The iPad can be a terminal: install **Termius** (free, App Store) — or Blink
Shell. Add a host: `66.42.121.161`, your operator username + password/key
(or install Tailscale on the iPad and connect to `jarvis` over the tailnet).
Connect, then paste the Option B one-liner. Five minutes, total.

## Verifying what's live

`https://mail.alecrae.com/api/version` returns the deployed commit — compare
it to `main` on GitHub. If they differ, the box hasn't pulled.

`https://api.alecrae.com/health` also reports its own `commit`, plus a
`deployDrift` object computed by a scheduled on-box check that compares HEAD
to `origin/main` automatically — see `docs/infra/deploy-drift-check.md`
(Known Issue #78). No more comparing SHAs by hand to catch a stuck deploy.

Also verify:
```bash
curl -s https://api.alecrae.com/health   # should return {"status":"ok","commit":"...",...}
curl -s https://alecrae.com              # should return landing page HTML
```

**Gateway routing note:** On Jarvis, **Coolify/Traefik owns ports 80/443** (not Caddy, not vapron-bun-gateway — those live on the 149 box, which still runs `vapron-bun-gateway` on 80/443 in its new role as the dedicated mail box; the Coolify/Traefik collision caveat applies to Jarvis only, and the MTA's `HEALTH_PORT` default of 8082 on 158 is documented in `mta-box-setup.md`). Routing for alecrae lives in the append-only Traefik dynamic route file:

```
/data/coolify/proxy/dynamic/alecrae.yaml
```

It routes `alecrae.com` / `mail.alecrae.com` / `www` → `10.0.1.1:4200` and `api.alecrae.com` → `10.0.1.1:4100`. The services (`alecrae-api` :4100, `alecrae-web` :4200) must bind `0.0.0.0` (a `127.0.0.1` bind in `/opt/alecrae/.env` overrides the systemd unit because Bun auto-loads `.env` — this caused the 2026-07-07..11 outage). The same Next.js app (port 4200) serves both the landing page (at `/`) and the mail app, so routing `alecrae.com` to 4200 is correct. If `https://alecrae.com` returns a 503, check the Traefik route file exists and the services are bound to `0.0.0.0`.
