# Postmortem — alecrae.com full 503 outage, 2026-07-07 → 2026-07-11

Last updated: 2026-07-13 05:30 UTC

**Status:** Resolved 2026-07-11. Written 2026-07-13 per CLAUDE.md Emergency Protocol
(postmortem within 24h was missed — see "What went wrong in the process" below).

## Impact

- `alecrae.com`, `mail.alecrae.com`, and `status.alecrae.com` returned **HTTP 503**
  from at latest 2026-07-07 09:25 UTC until 2026-07-11 — roughly **4 days of full
  outage** for the landing page and web app.
- No paying customers yet (pre-launch beta), so no customer-facing SLA breach —
  but the outage went **undetected for ~3 days** despite the box's own
  `fleet-check.sh` logging the 503s the whole time.

## Timeline

| When (UTC) | What |
|---|---|
| ≤ 2026-07-07 09:25 | Outage begins — box journal (`fleet-check.sh`) shows 503s from this point |
| 2026-07-07 | `alecrae-api` / `alecrae-web` systemd services stopped **and disabled** on Jarvis |
| 2026-07-10 | Outage discovered during unrelated session; root-cause investigation begins |
| 2026-07-11 | Full resolution; all four domains verified 200 externally |

## Root cause — three stacked failures on the Jarvis box (66.42.121.161)

1. **No Traefik route existed for alecrae.** When Coolify/Traefik took over ports
   80/443 on the box, no route for the alecrae domains was ever created — every
   request hit Traefik's default 503 catch-all, so the site was down *even while
   the services were running*.
2. **Services stopped and disabled.** `alecrae-api` and `alecrae-web` were stopped
   and disabled on Jul 7, so even a correct route would have found nothing to
   proxy to.
3. **Services bound to 127.0.0.1.** `HOST=127.0.0.1` in `/opt/alecrae/.env`
   silently overrode the systemd unit's `HOST=` (Bun auto-loads `.env`), making
   the services unreachable from the proxy container regardless.

## Resolution (2026-07-11)

- Services re-enabled and started.
- Append-only Traefik route added: `/data/coolify/proxy/dynamic/alecrae.yaml`
  (web/mail/www → `10.0.1.1:4200`, api → `10.0.1.1:4100`, same pattern as the
  working gatetest services).
- Bind changed to `0.0.0.0` in `.env` **and** the unit files.
- Two ufw allows added scoped to the proxy network only (4100/4200 stay publicly
  firewalled).
- All four domains verified 200 externally. `status.alecrae.com` remains 503 —
  no status app is deployed on 161 and no route exists (known, low priority).

## What went wrong in the process

- **No alerting.** `fleet-check.sh` recorded the 503s for three days and nothing
  paged anyone. A check that only writes a journal is a diary, not monitoring.
- **No staging.** Production is a single box with a manual `git pull` ritual;
  every infra change on the box is live immediately with nothing in between
  (DEVOPS_TRACKER §1.7).
- **Config split-brain.** The same setting (`HOST`) lived in both the systemd unit
  and `/opt/alecrae/.env`, with the `.env` silently winning. Nobody knew which
  was authoritative.
- **Postmortem SLA missed.** CLAUDE.md requires a written postmortem within 24
  hours; this one landed T+2 days after resolution.

## Prevention actions

| # | Action | Status |
|---|---|---|
| 1 | Wire `fleet-check.sh` 503 detections to an actual alert (email/push), not just a journal | OPEN |
| 2 | Make `/opt/alecrae/.env` vs systemd-unit precedence explicit: units set `EnvironmentFile=` deliberately, and `.env` documents that it wins | OPEN |
| 3 | When any new proxy (Coolify/Traefik/other) takes 80/443 on the box, adding routes for ALL hosted domains is part of that change — add to box runbook | DONE (noted in `docs/infra/box-deploy.md`) |
| 4 | Design a staging tier (separate conversation — spans more than this repo) | OPEN (flagged in DEVOPS_TRACKER §1.7) |
| 5 | Deploy the status app + Traefik route on 161 so `status.alecrae.com` stops 503ing | OPEN (low priority) |
