# Shared Redis over the tailnet (Known Issue #149)

> **Last updated: 2026-07-29 09:10 UTC**

The API on **Jarvis (`66.42.121.161`)** enqueues outbound mail; the MTA on the
**mail box (`149.28.119.158`)** consumes it. They are different machines, so
they must share **one** Redis — and today they do not. Redis runs on Jarvis
bound to `127.0.0.1` only, which no other host can reach.

Bring the MTA up in that state and **every send silently disappears**: the API
enqueues the job into its own Redis and returns success, the MTA sits watching
a queue that never receives anything, and nothing anywhere reports an error.
There is no bounce, no failure, no log line — the customer's mail simply never
arrives. That is the worst shape a failure can take, and it is the reason this
has to be done before mail bring-up rather than during it.

**Decision (Craig, 2026-07-29): bind Redis to the tailnet.** Both boxes are
already on Tailscale (`ssh root@jarvis` uses it). Rejected alternatives:
moving the MTA onto Jarvis would surrender the dedicated sending IP on `.158`,
which already has port 25 unblocked by Vultr, a correct PTR, and SPF
authorising it — weeks of deliverability groundwork. A hosted Redis would add
a vendor, a cost and per-operation latency for a problem a bind address
solves.

---

## Step 1 — Find Jarvis's tailnet address

On Jarvis:

```bash
tailscale ip -4    # e.g. 100.x.y.z
```

Use that address below. **Do not use `66.42.121.161`** — that is the public
interface, and Redis must never be reachable from it.

## Step 2 — Generate a password

```bash
openssl rand -base64 36
```

**This is not optional.** A tailnet is a network boundary, not an
authentication one: every device on the tailnet — including any future
personal laptop or phone added to it — can reach anything listening on a
tailnet address. An unauthenticated Redis there hands over every queued email,
every quota counter, every rate-limit bucket and every login-lockout record to
anything that joins. Redis's own `protected-mode` will not save you once the
bind address is widened; it steps aside as soon as a password is set *or* a
non-loopback bind is configured.

## Step 3 — Configure Redis on Jarvis

Edit `/etc/redis/redis.conf`:

```conf
# Loopback for local clients, tailnet for the mail box. NOT the public IP.
bind 127.0.0.1 <jarvis-tailnet-ip>

protected-mode yes
requirepass <password-from-step-2>
```

Then:

```bash
systemctl restart redis-server
redis-cli -a '<password>' ping     # PONG
ss -tlnp | grep 6379               # must show 127.0.0.1 and the tailnet IP ONLY
```

If `ss` shows `0.0.0.0:6379`, stop — Redis is listening on the public
interface. Fix the `bind` line before continuing.

## Step 4 — Firewall

Allow 6379 on the tailscale interface only:

```bash
ufw allow in on tailscale0 to any port 6379 proto tcp
ufw deny  in            to any port 6379 proto tcp
ufw status verbose | grep 6379
```

The `deny` is the important half. A bind address is a Redis-level control; the
firewall is the one that still holds if the config is ever edited by hand.

## Step 5 — Point both boxes at it

In `/opt/alecrae/.env` on **Jarvis** *and* on **the mail box**:

```bash
REDIS_URL=redis://:<password>@<jarvis-tailnet-ip>:6379
```

**The two values must be byte-identical.** A typo in one of them recreates
exactly the silent-vanishing failure this runbook exists to prevent — the
services will each connect happily to a different place.

Note the empty username before the colon: `redis://:password@host:port` is
the correct URL form for a Redis with `requirepass` and no ACL user.

Restart both: `systemctl restart alecrae-api` on Jarvis, and the MTA service
on the mail box.

---

## Step 6 — Verify the queue is actually shared

Reaching Redis from both boxes is **not** sufficient evidence — each could
still be reaching a different Redis. Prove they see the same queue.

From **Jarvis**:

```bash
redis-cli -u "$REDIS_URL" ping
redis-cli -u "$REDIS_URL" llen bull:alecrae-outbound:wait
```

From **the mail box**:

```bash
redis-cli -u "$REDIS_URL" ping
redis-cli -u "$REDIS_URL" llen bull:alecrae-outbound:wait
```

Both `llen` values must match. To prove it end to end, write a marker from one
box and read it from the other:

```bash
# On Jarvis
redis-cli -u "$REDIS_URL" set alecrae:tailnet-check "$(date -u +%FT%TZ)" EX 300

# On the mail box — must return the timestamp Jarvis just wrote
redis-cli -u "$REDIS_URL" get alecrae:tailnet-check
```

`(nil)` from the mail box means the boxes are still on separate Redis
instances. Do not start the MTA until this returns the value.

---

## What breaks if this is wrong

| Symptom | Cause |
|---|---|
| Sends accepted, mail never arrives, no errors anywhere | The two boxes are on different Redis instances. The exact failure this prevents |
| MTA exits at boot | It waits for Redis with a 10s timeout and `exit(1)`s (`services/mta/src/index.ts`). Wrong host, wrong password, or firewall |
| `NOAUTH Authentication required` | `REDIS_URL` is missing the password, or has it in the wrong URL position |
| API rate limits behave per-process; quotas drift | The API fell back to in-memory. Check `/v1/health/detailed` |

Related: `docs/infra/mta-box-setup.md` (MTA bring-up), `docs/infra/multi-platform-mail-plan.md`
(the phased plan this unblocks).
