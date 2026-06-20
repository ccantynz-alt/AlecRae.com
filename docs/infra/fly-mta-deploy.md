# MTA Deployment — Vapron Box (systemd)

> **This document supersedes the former Fly.io MTA deployment runbook.**
> Fly.io is no longer used. The MTA runs as a systemd service on the
> dedicated Vapron box at `149.28.119.158`.

---

The AlecRae MTA (`alecrae-mta`) is managed by systemd on the production box.
For the full setup runbook — including the systemd unit file, Redis installation,
DKIM key wiring, outbound relay configuration, and smoke-test checklist — see:

**[`docs/infra/mta-box-setup.md`](./mta-box-setup.md)**

That document covers:
- Installing Redis on the box
- Creating the `alecrae-mta` systemd service
- Setting required env vars (`RELAY_PROVIDER`, `SMTP_RELAY_*`, `DKIM_PRIVATE_KEY`, etc.)
- Verifying the service is running and draining the outbound queue
- PTR / rDNS setup in the Vultr control panel (replaces the former Fly.io rDNS request)
- IP warmup — see also [`docs/infra/deliverability.md`](./deliverability.md)

---

_Last updated: 2026-06-20 14:00 UTC_
**Owner:** Craig (escalate infra changes per CLAUDE.md Boss Rule)
