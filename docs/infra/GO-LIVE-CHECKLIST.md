# AlecRae — Business Email Go-Live Checklist

> **The single tickable path to real mail flowing on your own domains.** Work top to bottom;
> each phase depends on the ones above it. This supersedes the mail sections of
> `craig-go-live.md` (which predates the local-Postgres/local-Redis reality and the business-email
> path). Detailed procedures live in the linked sibling runbooks — this page is the ordered index.
>
> **Legend:** `[CODE ✓]` done in the codebase already · `[BOX]` you run it on a server (Boss Rule #5) ·
> `[DNS]` a DNS change · `[DECIDE]` a call only you can make · `[AUTO]` happens on its own.

**Last updated:** 2026-08-08 05:10 UTC

---

## The shape of it

Two clocks. **Keyboard time** (a few hours of box + DNS work) and **calendar time** (IP warm-up).
The relay-overflow mode (below) collapses the calendar clock to *zero wait* — you send at full
volume from day one while the IP warms underneath. So realistically: **do the box steps, run one
smoke test, and you're live for your own platforms the same day.**

What "live" means here: a platform (say Gluecron) has an org, `gluecron.com` verified, mailboxes
like `info@`/`support@` provisioned, mail **sends** (SPF/DKIM/DMARC pass into Gmail) and mail
**arrives** back into the AlecRae inbox, per-mailbox.

---

## Phase 0 — Deploy current `main` to the box  `[BOX]`

Production is **many commits behind `main`** — everything from the whole audit campaign through the
new mailbox-aware inbox, setup wizard, and relay-overflow mode is merged but **not running**. Until
this is done, none of it exists for real users.

- [ ] `[BOX]` `ssh root@jarvis` → run the deploy ritual (`docs/infra/box-deploy.md` / `scripts/box-deploy.sh`):
      `git pull --ff-only origin main && bun install && bun run -C packages/db build && bun run db:migrate`
      → `sudo systemctl restart alecrae-api alecrae-web`
- [ ] `[BOX]` Before restarting the API, confirm `/opt/alecrae/.env` has **`API_URL=https://api.alecrae.com`**
      — the API refuses to boot without it, by design (#140).
- [ ] `[AUTO]` Verify: `curl https://api.alecrae.com/health` shows the new commit SHA and `deployDrift.drifted=false`.

---

## Phase 1 — Shared Redis on the tailnet  `[BOX]` — **do this BEFORE starting the MTA**

The API (Jarvis) enqueues sends; the MTA (mail box) consumes them. They **must** share one Redis or
**every send silently vanishes** — no bounce, no error, no log (#149). Redis on Jarvis currently
binds `127.0.0.1` only.

- [ ] `[BOX]` Follow `docs/infra/redis-tailnet-setup.md` in full: bind Redis to the tailnet, set a
      mandatory `requirepass`, firewall to the tailscale interface only.
- [ ] `[BOX]` Set the **same** `REDIS_URL` (pointing at the shared instance) in `/opt/alecrae/.env`
      on **both** Jarvis and the mail box.
- [ ] `[BOX]` **Step 6 of the runbook is the real test** — prove both boxes see the *same* queue,
      not merely that each reaches *a* Redis.

---

## Phase 2 — Per-platform DNS  `[DNS]` (repeat per domain)

Auto-config via Porkbun/Cloudflare/GoDaddy is available on the Domains page, but manual paste is the
sure path. `GET /v1/domains/:id/dns` (and the Domains page) prints exactly what to add.

- [ ] `[DNS]` For each platform domain (gluecron.com, gatetest.io, …): add **MX** (→ mx1/mx2.alecrae.com),
      **SPF** TXT, **DKIM** TXT, **DMARC** TXT, and the **bounce** CNAME. *(Porkbun: enable "API Access"
      **per domain** first — Domain Management → the domain → toggle it on — or auto-config returns
      "Authentication error".)*
- [ ] `[DNS]` **DKIM must be among them** or signed mail is *held, not sent* (#144). Verify it's present.
- [ ] `[DNS]` **Once, in the alecrae.com zone:** `*._report._dmarc.alecrae.com  TXT  "v=DMARC1"` —
      without it, **no DMARC reports are ever delivered** for any customer domain (#148,
      `docs/infra/dns-zone-alecrae.md` §5a).
- [ ] `[AUTO]` Watch each domain flip to verified on the Domains page (or the `/setup` wizard, which
      polls). The daily liveness job then keeps watching for silent record drift.

---

## Phase 3 — Deploy inbound (receiving)  `[BOX]`

`services/inbound` is a complete receive pipeline but has **never run anywhere**. Green MX records
mean the world is already trying to deliver to a door with nobody behind it — senders queue, then
bounce after a few days.

- [ ] `[BOX]` Follow `docs/infra/inbound-box-setup.md`: deploy `services/inbound` on the mail box,
      open **port 25** in ufw, run it under systemd (`bun run src/index.ts`).
- [ ] `[BOX]` Set `INBOUND_WEBHOOK_SECRET` if using HTTP ingest — without it the HTTP endpoint now
      fails closed (503) by design; the SMTP listener is unaffected.
- [ ] `[BOX]` Provision at least one real mailbox on a verified domain first (the `/mailboxes` page or
      `/setup` wizard) — a verified domain with no mailbox rejects everything.

---

## Phase 4 — Start the MTA in relay-overflow mode (sending, day-one volume)  `[BOX]` `[DECIDE]`

This is the "speed it up" answer: send at full volume immediately through Resend's warm IPs while
our own IP warms in parallel and cuts over automatically as caps grow. Full detail:
`docs/infra/mta-box-setup.md` → "Warm-up + relay bring-up".

- [ ] `[BOX]` On the mail box `/opt/alecrae/.env`: `MTA_HOSTNAME=smtp.alecrae.com`,
      `MTA_RELAY_MODE=overflow`, and the Resend SMTP block (`RELAY_PROVIDER`, `SMTP_RELAY_HOST=smtp.resend.com`,
      port 587, username `resend`, password = your Resend API key).
- [ ] `[BOX]` Leave `MTA_WARMUP_ENABLED` **on** (its default). Do **not** set it to `false` to force
      volume — that risks a cold-IP blocklisting; overflow mode gives you day-one volume *safely*.
- [ ] `[BOX]` Verify the PTR for `149.28.119.158` reads **`smtp.alecrae.com`** (Vultr panel) — FCrDNS
      must match the HELO identity.
- [ ] `[DECIDE]` The MTA has been deliberately stopped since the open-relay incident (#105). Relay
      control (#127) and receiver-off-by-default (#128) have since landed, but starting it is your call.
- [ ] `[BOX]` `sudo systemctl start alecrae-mta` (and `enable` it).

---

## Phase 5 — The smoke test (the real proof)  `[BOX]` + verify

Nothing in the repo can prove the loop end to end; this is the gate.

- [ ] Send from a provisioned address (e.g. `info@gluecron.com`) to a **Gmail** account you control.
- [ ] In Gmail → "Show original" → confirm **SPF: PASS, DKIM: PASS, DMARC: PASS**.
- [ ] Reply from that Gmail account → confirm it **lands in the AlecRae inbox**, filed under the right
      mailbox (the inbox now shows "↳ to info@gluecron.com" and filters per mailbox).
- [ ] Confirm the `email.received` webhook fired (if the platform has one configured) — the receive
      half of Resend parity.
- [ ] Watch `delivery_results.mx_host`: the `relay:…` share shrinks toward zero over the coming weeks
      as warm-up caps double — that's the automatic cutover working.

---

## Phase 6 — Reputation visibility (do within the first days)  `[DECIDE]` `[BOX]`

- [ ] `[DECIDE]` `docs/infra/deliverability.md`: Google Postmaster Tools + Microsoft SNDS credentials
      (#82 c/d) — near-real-time view of how Gmail/Microsoft rate the IP, so a problem is caught in
      hours instead of forcing a warm-up restart.
- [ ] `[BOX]` Install the Postmaster/SNDS systemd timers (they exist only as runbook shell today —
      nothing installs them automatically; #167 note).

---

## Still-open decisions that touch go-live (not blockers, but know them)

- `[DECIDE]` **Landing/legal copy** (Boss Rule #9) — the public site still sells E2EE/zero-knowledge
  the code doesn't do and a 99.99% SLA nothing backs. Fine for *your own* platforms; **must** be
  fixed before paying strangers.
- `[DECIDE]` **`register` grants owner to every signup** (#156a) + the cross-tenant `/v1/admin` view —
  close before any public/second-tenant signup.
- `[DECIDE]` **Stripe live keys + webhook** — needed only when you actually charge.
- `[DECIDE]` **`VIRUSTOTAL_API_KEY`** (#158a — free tier shares samples) and **Vapron DNS API docs**
  (#83, if you want auto-config to work) — optional.

---

## One-line status of the two clocks

- **DNS clock:** finished per domain the moment records verify (minutes).
- **Warm-up clock:** *sidestepped* by relay-overflow — live immediately, own-IP cutover completes in
  ~3–4 weeks in the background, no waiting and no blocklist risk.
