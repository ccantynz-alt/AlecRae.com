/**
 * Vapron inbound webhook — the AlecRae side of the AlecRae ⇄ Vapron mail
 * integration (issue #171, docs/infra/alecrae-vapron-mail-integration.md).
 *
 * AlecRae does not run its own MTA to the internet. Inbound mail lands at
 * Vapron's `vapron-email-receive` (MX mx1/mx2.alecrae.com → the Vapron box),
 * whose "sink bridge" forwards each message to THIS endpoint, HMAC-signed.
 * We verify the signature, resolve which hosted domain/account the mail was
 * for, and hand it to the existing DB-routed inbound path
 * (`storeReceivedEmail`) so it lands in the right inbox and fires the
 * `email.received` event + webhook.
 *
 * Authentication is by HMAC, not a session, so this route is mounted PUBLIC
 * (no authMiddleware). It is listed in `route-auth-coverage.test.ts`'s
 * INTENTIONALLY_PUBLIC set for that reason.
 *
 * The shared secret is `INBOUND_WEBHOOK_SECRET` on the AlecRae side; it MUST
 * equal `INBOUND_SINK_SECRET` set on `vapron-email-receive`. When it is unset
 * we FAIL CLOSED (503) — the same posture as `services/inbound`'s
 * http-inbound: an unauthenticated ingest would let anyone inject "received"
 * mail into any mailbox.
 *
 * HTTP status contract (Vapron retries up to 12× over 24h on any non-2xx):
 *   - 2xx  → the message was safely stored, OR safely ignored (no hosted
 *            domain matched — do NOT make Vapron retry a domain we don't host).
 *   - 401  → bad/missing signature or stale timestamp — permanent, no retry.
 *   - 400  → malformed body — permanent, no retry.
 *   - 503  → secret unconfigured — transient (fix config), retryable.
 *   - 502  → the store failed — transient, retryable so the mail isn't lost.
 */

import { Hono } from "hono";
import crypto from "node:crypto";
import { inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { getDatabase, domains } from "@alecrae/db";
import {
  storeReceivedEmail,
  type ReceivedEmailInput,
} from "../lib/received-email-store.js";

const inboundVapron = new Hono();

/**
 * Maximum allowed clock skew between Vapron's `x-vapron-timestamp` and our
 * clock, in seconds. Bounds the replay window: a captured request older (or
 * further in the future) than this is refused even with a valid signature.
 */
const MAX_TIMESTAMP_SKEW_SECONDS = 300;

const AddressSchema = z.object({
  address: z.string(),
  name: z.string().optional(),
});

/**
 * The exact `InboundWebhookPayload` shape Vapron's sink bridge sends.
 * `cc`/`references`/`attachments` default to `[]` so a message that legitimately
 * omits them is stored rather than 400'd into a 24h retry loop.
 */
const PayloadSchema = z.object({
  type: z.literal("inbound.email.received"),
  tenantId: z.string(),
  routeId: z.string(),
  receivedAt: z.string(),
  envelope: z.object({
    mailFrom: z.string(),
    rcptTo: z.array(z.string()),
    remoteAddress: z.string(),
    tls: z.boolean(),
  }),
  authentication: z.object({
    spf: z.enum(["pass", "fail", "neutral"]),
    dkim: z.enum(["pass", "fail", "neutral"]),
  }),
  message: z.object({
    messageId: z.string(),
    from: AddressSchema,
    to: z.array(AddressSchema),
    cc: z.array(AddressSchema).default([]),
    subject: z.string(),
    date: z.string(),
    inReplyTo: z.string().optional(),
    references: z.array(z.string()).default([]),
    textBody: z.string().optional(),
    htmlBody: z.string().optional(),
  }),
  attachments: z
    .array(
      z.object({
        filename: z.string(),
        contentType: z.string(),
        disposition: z.enum(["attachment", "inline"]),
        size: z.number(),
        contentBase64: z.string(),
      }),
    )
    .default([]),
});

type InboundWebhookPayload = z.infer<typeof PayloadSchema>;

/**
 * Verify Vapron's HMAC over `` `${timestamp}.${rawBody}` ``.
 *
 * Reproduces the signing scheme exactly (HMAC-SHA256, hex digest) and compares
 * in constant time. Rejects a non-hex or wrong-length signature BEFORE the
 * `timingSafeEqual` (which throws on unequal buffer lengths) — the endpoint is
 * unauthenticated and reachable by anyone, so it must never throw on malformed
 * input.
 */
function verifySignature(
  secret: string,
  timestamp: string,
  rawBody: string,
  provided: string,
): boolean {
  if (!/^[0-9a-fA-F]+$/.test(provided) || provided.length % 2 !== 0) {
    return false;
  }
  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
  const expectedBuf = Buffer.from(expected, "hex");
  const providedBuf = Buffer.from(provided, "hex");
  if (expectedBuf.length !== providedBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}

/** Lowercased domain part of an email address, or null if it has none. */
function domainOf(address: string): string | null {
  const at = address.lastIndexOf("@");
  if (at === -1) return null;
  const d = address.slice(at + 1).trim().toLowerCase();
  return d.length > 0 ? d : null;
}

interface ResolvedHostedAccount {
  accountId: string;
  domainId: string;
  domain: string;
}

/**
 * Resolve which hosted domain (and therefore which account) an inbound message
 * belongs to, from its recipient addresses. Vapron sets `tenantId` to the
 * recipient domain and only sink-routes domains it was configured for, so a
 * match is expected; the recipient list is checked defensively.
 *
 * When more than one recipient domain is hosted (mail addressed to two of our
 * domains at once), the `tenantId` match wins, else the first row returned.
 */
async function resolveHostedAccount(
  payload: InboundWebhookPayload,
): Promise<ResolvedHostedAccount | null> {
  const candidates = new Set<string>();
  const tenant = payload.tenantId.trim().toLowerCase();
  if (tenant.length > 0) candidates.add(tenant);
  for (const rcpt of payload.envelope.rcptTo) {
    const d = domainOf(rcpt);
    if (d) candidates.add(d);
  }
  for (const to of payload.message.to) {
    const d = domainOf(to.address);
    if (d) candidates.add(d);
  }

  const candidateList = [...candidates];
  if (candidateList.length === 0) return null;

  const db = getDatabase();
  const rows = await db
    .select({
      accountId: domains.accountId,
      domainId: domains.id,
      domain: domains.domain,
    })
    .from(domains)
    .where(inArray(sql`lower(${domains.domain})`, candidateList));

  if (rows.length === 0) return null;

  const preferred =
    rows.find((r) => r.domain.toLowerCase() === tenant) ?? rows[0];
  if (!preferred) return null;
  return {
    accountId: preferred.accountId,
    domainId: preferred.domainId,
    domain: preferred.domain,
  };
}

// POST /v1/inbound/vapron — receive one forwarded inbound email from Vapron.
inboundVapron.post("/vapron", async (c) => {
  // ── Secret configured? (fail closed) ──────────────────────────────────
  const secret = process.env["INBOUND_WEBHOOK_SECRET"];
  if (!secret) {
    console.error(
      "[inbound-vapron] INBOUND_WEBHOOK_SECRET is not set — refusing all webhook requests. " +
        "Set INBOUND_WEBHOOK_SECRET (it must equal Vapron's INBOUND_SINK_SECRET) to enable inbound.",
    );
    // 503 (not 4xx): unconfigured is transient — Vapron should retry once the
    // operator sets the secret, rather than dropping the mail permanently.
    return c.json(
      { error: "Inbound webhook is not configured (INBOUND_WEBHOOK_SECRET unset)" },
      503,
    );
  }

  // ── Read the RAW body BEFORE parsing — the HMAC is over raw bytes ──────
  const rawBody = await c.req.text();

  const signature = c.req.header("x-vapron-signature");
  const timestamp = c.req.header("x-vapron-timestamp");
  if (!signature || !timestamp) {
    return c.json({ error: "Missing signature or timestamp header" }, 401);
  }

  // ── Replay guard: reject a timestamp too far from now (either direction) ─
  const tsNum = Number(timestamp);
  if (!Number.isFinite(tsNum)) {
    return c.json({ error: "Invalid timestamp header" }, 401);
  }
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - tsNum) > MAX_TIMESTAMP_SKEW_SECONDS) {
    return c.json({ error: "Timestamp outside the allowed window" }, 401);
  }

  // ── Verify the HMAC (constant-time) ───────────────────────────────────
  if (!verifySignature(secret, timestamp, rawBody, signature)) {
    return c.json({ error: "Invalid signature" }, 401);
  }

  // ── Parse + validate the payload ──────────────────────────────────────
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return c.json({ error: "Body is not valid JSON" }, 400);
  }
  const result = PayloadSchema.safeParse(json);
  if (!result.success) {
    return c.json(
      { error: "Malformed inbound payload", details: result.error.issues },
      400,
    );
  }
  const payload = result.data;

  // ── Resolve the hosted account for this mail ──────────────────────────
  let resolved: ResolvedHostedAccount | null;
  try {
    resolved = await resolveHostedAccount(payload);
  } catch (err) {
    // A DB error here is transient — do not lose the mail; ask Vapron to retry.
    console.error(
      "[inbound-vapron] Domain resolution failed:",
      err instanceof Error ? err.message : String(err),
    );
    return c.json({ error: "Temporary failure resolving recipient" }, 502);
  }

  if (!resolved) {
    // Vapron only sink-routes domains we host, so this should not happen —
    // but if it does, ACCEPT + DROP (200). A 4xx/5xx would make Vapron retry
    // for 24h a domain we will never accept. Logged loudly instead.
    console.warn(
      `[inbound-vapron] No hosted domain matched inbound message ${payload.message.messageId} ` +
        `(tenantId=${payload.tenantId}, rcptTo=${payload.envelope.rcptTo.join(",")}) — accepted and dropped.`,
    );
    return c.json({ status: "ignored", reason: "no_hosted_domain" }, 200);
  }

  // Attachments are NOT persisted yet: the shared inbound store
  // (`ReceivedEmailInput`) has no attachment field, and threading one through
  // is a larger change to a path with other callers/tests. The message body is
  // stored; attachment persistence is a bounded follow-up. Same for the
  // SPF/DKIM results — the store input carries no auth fields today. Neither
  // is a reason to reject the mail.
  if (payload.attachments.length > 0) {
    console.warn(
      `[inbound-vapron] ${payload.attachments.length} attachment(s) on message ${payload.message.messageId} ` +
        `are not persisted yet (follow-up) — message body stored.`,
    );
  }

  // ── Map to the DB-routed inbound path ─────────────────────────────────
  const receivedAt = new Date(payload.receivedAt);
  const input: ReceivedEmailInput = {
    accountId: resolved.accountId,
    source: "inbound",
    // Live incoming mail — must be triaged, so NOT backfill (issue #130).
    backfill: false,
    from: payload.message.from.name
      ? { address: payload.message.from.address, name: payload.message.from.name }
      : { address: payload.message.from.address },
    to: payload.message.to.map((a) =>
      a.name ? { address: a.address, name: a.name } : { address: a.address },
    ),
    cc: payload.message.cc.map((a) =>
      a.name ? { address: a.address, name: a.name } : { address: a.address },
    ),
    subject: payload.message.subject,
    textBody: payload.message.textBody ?? null,
    htmlBody: payload.message.htmlBody ?? null,
    messageId: payload.message.messageId || null,
    inReplyTo: payload.message.inReplyTo ?? null,
    references: payload.message.references.length > 0 ? payload.message.references : null,
    receivedAt: Number.isNaN(receivedAt.getTime()) ? new Date() : receivedAt,
    isRead: false,
  };

  try {
    const stored = await storeReceivedEmail(input);
    return c.json(
      { status: "stored", stored: stored.stored, id: stored.id },
      200,
    );
  } catch (err) {
    // Storing failed — this is the one case we MUST NOT 2xx, or the mail is
    // lost. 502 tells Vapron to retry.
    console.error(
      `[inbound-vapron] Failed to store inbound message ${payload.message.messageId}:`,
      err instanceof Error ? err.message : String(err),
    );
    return c.json({ error: "Failed to store message" }, 502);
  }
});

export { inboundVapron };
