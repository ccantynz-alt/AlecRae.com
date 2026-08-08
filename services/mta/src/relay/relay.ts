/**
 * @alecrae/mta — Relay Client
 *
 * Unified relay interface for sending email through managed providers
 * instead of direct MX delivery. Supports:
 *   - Amazon SES SMTP relay (STARTTLS + AUTH)
 *   - MailChannels HTTP API (POST raw MIME)
 *   - Generic SMTP relay (any relay with optional auth)
 *   - Vapron REST send API (POST structured JSON to /v1/messages)
 *
 * DKIM signing happens upstream (services/mta/src/dkim/signer.ts) before
 * the message reaches the relay, so the SMTP/SES/MailChannels providers send
 * the already-signed raw message as-is. The Vapron provider is the exception:
 * Vapron re-composes and DKIM-signs the message itself (via its email-domain
 * service), so its adapter parses the raw MIME back into the structured JSON
 * shape Vapron's `/v1/messages` API expects. See
 * docs/infra/alecrae-vapron-mail-integration.md.
 */

import * as net from "node:net";
import * as tls from "node:tls";
import { parseEmail } from "@alecrae/email-parser";
import { getMtaHostname } from "../config.js";

// ─── Configuration ──────────────────────────────────────────────────────────

export interface RelayConfig {
  provider: "ses" | "mailchannels" | "smtp" | "vapron";
  /** Amazon SES SMTP relay */
  ses?: {
    host: string;
    port: number;
    username: string;
    password: string;
    region: string;
  };
  /** MailChannels HTTP API */
  mailchannels?: {
    apiKey: string;
    endpoint?: string | undefined;
  };
  /** Generic SMTP relay */
  smtp?: {
    host: string;
    port: number;
    username?: string | undefined;
    password?: string | undefined;
    tls?: boolean | undefined;
  };
  /**
   * Vapron REST send API. Base URL (e.g. http://100.89.227.39:8787); the
   * adapter POSTs to `${url}/v1/messages` with a bearer token. AlecRae does
   * not deliver to the internet itself — Vapron owns delivery + retry.
   */
  vapron?: {
    url: string;
    token: string;
  };
}

export interface RelaySendResult {
  success: boolean;
  messageId?: string | undefined;
  response?: string | undefined;
  error?: string | undefined;
  /**
   * Explicit permanence classification for a FAILED send, used by
   * delivery/routing.ts's `relayFailureOutcome` to decide bounce vs. defer.
   *
   *   true  → permanent; the message will never succeed on retry (bounce).
   *   false → transient; retry may succeed (defer).
   *   undefined → unclassified; the caller falls back to its SMTP-oriented
   *               5xx string heuristic (the historical SES/SMTP behaviour).
   *
   * The Vapron provider sets this because its HTTP status semantics INVERT
   * SMTP's: a 4xx (403 FROM-not-verified, 401 bad token, 422 validation) is
   * permanent, while a 5xx is a transient gateway blip. String-sniffing the
   * error for "5xx" — correct for SMTP — would misclassify both directions.
   */
  permanent?: boolean | undefined;
}

/** Per-send metadata not derivable from the raw MIME (e.g. the tenant). */
export interface RelaySendOptions {
  /** AlecRae account/workspace id → Vapron `tenantId`. */
  tenantId?: string | undefined;
}

/** Minimal response shape the Vapron adapter needs from an HTTP transport. */
export interface RelayFetchResponse {
  status: number;
  text(): Promise<string>;
}

/**
 * Injectable HTTP transport for the Vapron adapter. The global `fetch` is
 * assignable to this, and tests pass a mock so no network is touched.
 */
export type RelayFetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<RelayFetchResponse>;

/** One attachment in a Vapron `/v1/messages` request body. */
export interface VapronAttachment {
  filename: string;
  contentBase64: string;
  contentType: string;
}

/** The JSON body posted to Vapron's `/v1/messages`. */
export interface VapronMessageBody {
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject?: string;
  html?: string;
  text?: string;
  attachments?: VapronAttachment[];
  headers?: Record<string, string>;
  tenantId?: string;
}

// ─── Environment-based config builder ───────────────────────────────────────

/**
 * Build a RelayConfig from environment variables.
 *
 * Reads:
 *   RELAY_PROVIDER          — "ses" | "mailchannels" | "smtp"
 *   SES_SMTP_HOST           — e.g. email-smtp.us-east-1.amazonaws.com
 *   SES_SMTP_PORT           — default 587
 *   SES_SMTP_USERNAME       — SES SMTP username
 *   SES_SMTP_PASSWORD       — SES SMTP password
 *   SES_REGION              — e.g. us-east-1
 *   MAILCHANNELS_API_KEY    — MailChannels API key
 *   MAILCHANNELS_ENDPOINT   — optional override
 *   SMTP_RELAY_HOST         — generic relay host
 *   SMTP_RELAY_PORT         — generic relay port (default 587)
 *   SMTP_RELAY_USERNAME     — optional
 *   SMTP_RELAY_PASSWORD     — optional
 *   SMTP_RELAY_TLS          — "true" or "false" (default true)
 *   VAPRON_EMAIL_SEND_URL   — Vapron send base URL (required for "vapron")
 *   VAPRON_EMAIL_SEND_TOKEN — Vapron bearer token (required for "vapron")
 */
export function relayConfigFromEnv(): RelayConfig {
  const provider = (process.env["RELAY_PROVIDER"] ?? "smtp") as RelayConfig["provider"];

  const config: RelayConfig = { provider };

  switch (provider) {
    case "ses":
      config.ses = {
        host:
          process.env["SES_SMTP_HOST"] ??
          `email-smtp.${process.env["SES_REGION"] ?? "us-east-1"}.amazonaws.com`,
        port: parseInt(process.env["SES_SMTP_PORT"] ?? "587", 10),
        username: process.env["SES_SMTP_USERNAME"] ?? "",
        password: process.env["SES_SMTP_PASSWORD"] ?? "",
        region: process.env["SES_REGION"] ?? "us-east-1",
      };
      break;

    case "mailchannels":
      config.mailchannels = {
        apiKey: process.env["MAILCHANNELS_API_KEY"] ?? "",
        endpoint: process.env["MAILCHANNELS_ENDPOINT"] ?? undefined,
      };
      break;

    case "smtp":
      config.smtp = {
        host: process.env["SMTP_RELAY_HOST"] ?? "localhost",
        port: parseInt(process.env["SMTP_RELAY_PORT"] ?? "587", 10),
        username: process.env["SMTP_RELAY_USERNAME"] ?? undefined,
        password: process.env["SMTP_RELAY_PASSWORD"] ?? undefined,
        tls: process.env["SMTP_RELAY_TLS"] !== "false",
      };
      break;

    case "vapron":
      // Left possibly-empty here; RelayClient.validate() rejects a missing
      // url/token with a clear message so a misconfigured deployment fails
      // loudly at construction rather than on the first send.
      config.vapron = {
        url: process.env["VAPRON_EMAIL_SEND_URL"] ?? "",
        token: process.env["VAPRON_EMAIL_SEND_TOKEN"] ?? "",
      };
      break;
  }

  return config;
}

// ─── SMTP helpers (shared by SES and generic SMTP providers) ────────────────

/** A parsed SMTP response line. */
interface SmtpResponse {
  code: number;
  message: string;
  lines: string[];
}

/**
 * Low-level SMTP conversation helper that works over a raw socket.
 * Handles multi-line responses, STARTTLS upgrade, and AUTH LOGIN.
 */
class SmtpRelay {
  private socket: net.Socket | tls.TLSSocket;
  private buffer = "";
  private extensions = new Map<string, string>();

  constructor(socket: net.Socket | tls.TLSSocket) {
    this.socket = socket;
  }

  /** Read a complete SMTP response (may be multi-line). */
  readResponse(timeoutMs = 30_000): Promise<SmtpResponse> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error("SMTP response timeout"));
      }, timeoutMs);

      const tryParse = (): boolean => {
        const result = this.parseBuffer();
        if (result) {
          clearTimeout(timer);
          this.socket.removeListener("data", onData);
          resolve(result);
          return true;
        }
        return false;
      };

      const onData = (chunk: Buffer) => {
        this.buffer += chunk.toString("utf-8");
        tryParse();
      };

      // Check buffered data first
      if (tryParse()) return;

      this.socket.on("data", onData);
      this.socket.once("error", (e) => {
        clearTimeout(timer);
        reject(e);
      });
      this.socket.once("close", () => {
        clearTimeout(timer);
        reject(new Error("Connection closed unexpectedly"));
      });
    });
  }

  /** Send a raw command string and read the response. */
  async command(cmd: string, timeoutMs = 30_000): Promise<SmtpResponse> {
    await this.write(`${cmd}\r\n`);
    return this.readResponse(timeoutMs);
  }

  /** Send EHLO, parse extensions. */
  async ehlo(hostname: string): Promise<SmtpResponse> {
    const resp = await this.command(`EHLO ${hostname}`);
    if (resp.code !== 250) {
      throw new Error(`EHLO failed: ${resp.code} ${resp.message}`);
    }
    this.extensions.clear();
    for (let i = 1; i < resp.lines.length; i++) {
      const line = resp.lines[i];
      if (line === undefined) continue;
      const sp = line.indexOf(" ");
      if (sp > 0) {
        this.extensions.set(line.substring(0, sp).toUpperCase(), line.substring(sp + 1));
      } else {
        this.extensions.set(line.toUpperCase(), "");
      }
    }
    return resp;
  }

  /** Returns true if the server advertised a given extension. */
  hasExtension(name: string): boolean {
    return this.extensions.has(name.toUpperCase());
  }

  /** Upgrade the connection to TLS via STARTTLS. */
  async starttls(host: string): Promise<void> {
    const resp = await this.command("STARTTLS");
    if (resp.code !== 220) {
      throw new Error(`STARTTLS failed: ${resp.code} ${resp.message}`);
    }

    const tlsSocket = await new Promise<tls.TLSSocket>((resolve, reject) => {
      const upgraded = tls.connect(
        {
          socket: this.socket as net.Socket,
          servername: host,
          minVersion: "TLSv1.2",
        },
        () => {
          resolve(upgraded);
        },
      );
      upgraded.once("error", reject);
    });

    this.socket = tlsSocket;
    this.buffer = "";
  }

  /** AUTH LOGIN (base64 username + password challenge-response). */
  async authLogin(username: string, password: string): Promise<void> {
    const resp = await this.command("AUTH LOGIN");
    if (resp.code !== 334) {
      throw new Error(`AUTH LOGIN initiation failed: ${resp.code} ${resp.message}`);
    }

    // Server sends base64-encoded "Username:" prompt — respond with base64 username
    const userResp = await this.command(Buffer.from(username).toString("base64"));
    if (userResp.code !== 334) {
      throw new Error(`AUTH LOGIN username rejected: ${userResp.code} ${userResp.message}`);
    }

    // Server sends base64-encoded "Password:" prompt — respond with base64 password
    const passResp = await this.command(Buffer.from(password).toString("base64"));
    if (passResp.code !== 235) {
      throw new Error(`AUTH LOGIN failed: ${passResp.code} ${passResp.message}`);
    }
  }

  /** AUTH PLAIN (single base64 blob: \0username\0password). */
  async authPlain(username: string, password: string): Promise<void> {
    const credentials = Buffer.from(`\0${username}\0${password}`).toString("base64");
    const resp = await this.command(`AUTH PLAIN ${credentials}`);
    if (resp.code !== 235) {
      throw new Error(`AUTH PLAIN failed: ${resp.code} ${resp.message}`);
    }
  }

  /** Send the SMTP envelope + DATA. */
  async sendEnvelope(
    from: string,
    to: string[],
    rawMessage: string,
  ): Promise<SmtpResponse> {
    // MAIL FROM
    const mailResp = await this.command(`MAIL FROM:<${from}>`);
    if (mailResp.code !== 250) {
      throw new Error(`MAIL FROM rejected: ${mailResp.code} ${mailResp.message}`);
    }

    // RCPT TO (one per recipient)
    for (const recipient of to) {
      const rcptResp = await this.command(`RCPT TO:<${recipient}>`);
      if (rcptResp.code !== 250 && rcptResp.code !== 251) {
        throw new Error(`RCPT TO <${recipient}> rejected: ${rcptResp.code} ${rcptResp.message}`);
      }
    }

    // DATA
    const dataResp = await this.command("DATA");
    if (dataResp.code !== 354) {
      throw new Error(`DATA rejected: ${dataResp.code} ${dataResp.message}`);
    }

    // Dot-stuff per RFC 5321 4.5.2 and send message body
    const stuffed = rawMessage.replace(/^\./gm, "..");
    await this.write(stuffed);
    if (!stuffed.endsWith("\r\n")) {
      await this.write("\r\n");
    }
    await this.write(".\r\n");

    const finalResp = await this.readResponse(60_000);
    if (finalResp.code !== 250) {
      throw new Error(`Message rejected: ${finalResp.code} ${finalResp.message}`);
    }
    return finalResp;
  }

  /** Send QUIT and close. */
  async quit(): Promise<void> {
    try {
      await this.command("QUIT");
    } catch {
      // Ignore quit errors
    }
    this.socket.destroy();
  }

  /** Write raw bytes to the socket. */
  private write(data: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket.write(data, "utf-8", (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /** Try to parse a complete SMTP response from the buffer. */
  private parseBuffer(): SmtpResponse | null {
    const lines: string[] = [];
    let remaining = this.buffer;

    while (true) {
      const lineEnd = remaining.indexOf("\r\n");
      if (lineEnd === -1) return null;

      const line = remaining.substring(0, lineEnd);
      remaining = remaining.substring(lineEnd + 2);

      if (line.length < 3) return null;

      const code = parseInt(line.substring(0, 3), 10);
      if (Number.isNaN(code)) return null;

      const separator = line[3];
      const text = line.substring(4);
      lines.push(text);

      if (separator === " " || separator === undefined) {
        this.buffer = remaining;
        return { code, message: lines.join("\n"), lines };
      }
      // separator === "-" means continuation line
    }
  }
}

// ─── Provider: Amazon SES SMTP ──────────────────────────────────────────────

async function sendViaSes(
  config: NonNullable<RelayConfig["ses"]>,
  from: string,
  to: string[],
  rawMessage: string,
): Promise<RelaySendResult> {
  let relay: SmtpRelay | undefined;

  try {
    // 1. TCP connect
    const socket = await new Promise<net.Socket>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("SES connection timeout")), 30_000);
      const sock = net.createConnection({ host: config.host, port: config.port }, () => {
        clearTimeout(timer);
        resolve(sock);
      });
      sock.once("error", (e) => {
        clearTimeout(timer);
        reject(e);
      });
    });

    relay = new SmtpRelay(socket);

    // 2. Read greeting
    const greeting = await relay.readResponse();
    if (greeting.code !== 220) {
      throw new Error(`SES greeting error: ${greeting.code} ${greeting.message}`);
    }

    // 3. EHLO
    await relay.ehlo(getMtaHostname());

    // 4. STARTTLS (required for SES on port 587)
    if (relay.hasExtension("STARTTLS")) {
      await relay.starttls(config.host);
      // Re-EHLO after TLS upgrade
      await relay.ehlo(getMtaHostname());
    }

    // 5. AUTH LOGIN with SES SMTP credentials
    await relay.authLogin(config.username, config.password);

    // 6. Send envelope + data
    const resp = await relay.sendEnvelope(from, to, rawMessage);

    // 7. Extract message ID from SES response (format: "Ok <message-id>")
    const messageIdMatch = resp.message.match(/\b([0-9a-f-]{36,})\b/i);

    await relay.quit();

    return {
      success: true,
      messageId: messageIdMatch?.[1] ?? undefined,
      response: `${resp.code} ${resp.message}`,
    };
  } catch (error) {
    if (relay) {
      try { await relay.quit(); } catch { /* ignore */ }
    }
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, error: msg };
  }
}

// ─── Provider: MailChannels HTTP API ────────────────────────────────────────

const MAILCHANNELS_DEFAULT_ENDPOINT = "https://api.mailchannels.net/tx/v1/send";

async function sendViaMailchannels(
  config: NonNullable<RelayConfig["mailchannels"]>,
  from: string,
  to: string[],
  rawMessage: string,
): Promise<RelaySendResult> {
  const endpoint = config.endpoint ?? MAILCHANNELS_DEFAULT_ENDPOINT;

  try {
    // MailChannels accepts a raw MIME message via their /send endpoint
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "X-API-Key": config.apiKey,
        "Content-Type": "message/rfc822",
      },
      body: rawMessage,
    });

    const responseText = await response.text();

    if (response.ok || response.status === 202) {
      // Try to extract a message ID from the response
      let messageId: string | undefined;
      try {
        const json = JSON.parse(responseText) as Record<string, unknown>;
        if (typeof json["id"] === "string") messageId = json["id"];
        if (typeof json["messageId"] === "string") messageId = json["messageId"];
      } catch {
        // Response may not be JSON
      }

      return {
        success: true,
        messageId,
        response: `${response.status} ${responseText.slice(0, 200)}`,
      };
    }

    return {
      success: false,
      error: `MailChannels HTTP ${response.status}: ${responseText.slice(0, 500)}`,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, error: `MailChannels request failed: ${msg}` };
  }
}

// ─── Provider: Generic SMTP Relay ───────────────────────────────────────────

async function sendViaSmtpRelay(
  config: NonNullable<RelayConfig["smtp"]>,
  from: string,
  to: string[],
  rawMessage: string,
): Promise<RelaySendResult> {
  let relay: SmtpRelay | undefined;

  try {
    // 1. Connect — either direct TLS (port 465) or plain TCP (port 587/25)
    let socket: net.Socket | tls.TLSSocket;

    if (config.tls && config.port === 465) {
      // Implicit TLS (SMTPS)
      socket = await new Promise<tls.TLSSocket>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("SMTP relay TLS connection timeout")), 30_000);
        const sock = tls.connect(
          { host: config.host, port: config.port, minVersion: "TLSv1.2" },
          () => {
            clearTimeout(timer);
            resolve(sock);
          },
        );
        sock.once("error", (e: Error) => {
          clearTimeout(timer);
          reject(e);
        });
      });
    } else {
      // Plain TCP (will upgrade via STARTTLS if available)
      socket = await new Promise<net.Socket>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("SMTP relay connection timeout")), 30_000);
        const sock = net.createConnection({ host: config.host, port: config.port }, () => {
          clearTimeout(timer);
          resolve(sock);
        });
        sock.once("error", (e) => {
          clearTimeout(timer);
          reject(e);
        });
      });
    }

    relay = new SmtpRelay(socket);

    // 2. Read greeting
    const greeting = await relay.readResponse();
    if (greeting.code !== 220) {
      throw new Error(`Relay greeting error: ${greeting.code} ${greeting.message}`);
    }

    // 3. EHLO
    await relay.ehlo(getMtaHostname());

    // 4. STARTTLS if not already on TLS and server supports it
    if (config.tls !== false && config.port !== 465 && relay.hasExtension("STARTTLS")) {
      await relay.starttls(config.host);
      await relay.ehlo(getMtaHostname());
    }

    // 5. AUTH if credentials provided
    if (config.username && config.password) {
      if (relay.hasExtension("AUTH")) {
        // Prefer PLAIN, fall back to LOGIN
        await relay.authPlain(config.username, config.password);
      } else {
        // Try LOGIN anyway (some servers don't advertise it)
        await relay.authLogin(config.username, config.password);
      }
    }

    // 6. Send envelope + data
    const resp = await relay.sendEnvelope(from, to, rawMessage);

    await relay.quit();

    return {
      success: true,
      response: `${resp.code} ${resp.message}`,
    };
  } catch (error) {
    if (relay) {
      try { await relay.quit(); } catch { /* ignore */ }
    }
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, error: msg };
  }
}

// ─── Provider: Vapron REST send API ─────────────────────────────────────────

/**
 * Headers Vapron reconstructs itself from the structured fields (or that are
 * signing/transport artifacts of OUR upstream pass). Forwarding these would
 * either duplicate a field or hand Vapron a stale DKIM signature over content
 * it is about to re-sign, so they are dropped; everything else (X-*,
 * List-Unsubscribe, Reply-To, In-Reply-To, References, …) is passed through.
 */
const VAPRON_STRUCTURAL_HEADERS = new Set<string>([
  "from",
  "to",
  "cc",
  "bcc",
  "subject",
  "date",
  "message-id",
  "mime-version",
  "content-type",
  "content-transfer-encoding",
  "content-disposition",
  "content-id",
  "dkim-signature",
  "domainkey-signature",
  "arc-seal",
  "arc-message-signature",
  "arc-authentication-results",
  "authentication-results",
  "received",
  "return-path",
  "delivered-to",
  "x-original-to",
]);

/**
 * Build the Vapron `/v1/messages` JSON body from the raw (DKIM-signed) MIME
 * message plus the envelope recipients the worker resolved for this batch.
 *
 * Exported so the mapping is unit-testable directly, not only through a
 * mocked transport (same approach as `relayFailureOutcome`/`senderDomainWhere`).
 *
 * @param envelopeFrom   - The relay envelope sender (VERP return-path). NOT
 *                         used as the Vapron `from`: Vapron verifies the FROM
 *                         *domain*, and the return-path lives on the
 *                         `bounce.<domain>` subdomain, which is not the
 *                         verified sending domain. The header From address
 *                         (parsed below) is the real sender.
 * @param recipients     - Envelope recipients for this batch (authoritative
 *                         delivery set — includes Bcc, which is not in headers).
 * @returns the body, or null if the message has no usable From address.
 */
export function buildVapronMessage(
  envelopeFrom: string,
  recipients: readonly string[],
  rawMessage: string,
  options?: RelaySendOptions,
): VapronMessageBody | null {
  void envelopeFrom; // intentionally unused — see the From note above
  const parsed = parseEmail(rawMessage);

  const fromAddress = parsed.from.address.trim();
  if (fromAddress === "") {
    // No From header → cannot determine a verified sending domain. Returning
    // null lets the caller surface a permanent, distinct error rather than
    // sending FROM the bounce subdomain and getting a confusing 403.
    return null;
  }

  // Split the authoritative envelope set back into To / Cc / Bcc so the
  // recipient sees the same visibility the composer intended, while
  // guaranteeing every envelope recipient lands in exactly one bucket (a Bcc
  // recipient appears in no header, so it can only be recovered this way).
  const envelope = [...recipients];
  const envelopeSet = new Set(envelope.map((r) => r.toLowerCase()));
  const inEnvelope = (addr: string): boolean => envelopeSet.has(addr.toLowerCase());

  const headerTo = parsed.to.map((a) => a.address).filter(inEnvelope);
  const headerCc = parsed.cc.map((a) => a.address).filter(inEnvelope);
  const named = new Set([...headerTo, ...headerCc].map((a) => a.toLowerCase()));
  const bcc = envelope.filter((r) => !named.has(r.toLowerCase()));

  let to: string[];
  let cc: string[];
  let bccOut: string[];
  if (headerTo.length > 0) {
    to = headerTo;
    cc = headerCc;
    bccOut = bcc;
  } else {
    // No header To among the envelope recipients (all-Bcc, or headers we
    // couldn't match). Put everyone in `to` so nobody is silently dropped —
    // Vapron requires at least one recipient, and delivery beats cosmetics.
    to = envelope;
    cc = [];
    bccOut = [];
  }

  // Custom (non-structural) headers, first value each.
  const headers: Record<string, string> = {};
  for (const [name, values] of parsed.headers) {
    const lower = name.toLowerCase();
    if (VAPRON_STRUCTURAL_HEADERS.has(lower)) continue;
    if (lower.startsWith("content-")) continue;
    const first = values[0];
    if (first !== undefined && first.trim() !== "") headers[name] = first;
  }

  const attachments: VapronAttachment[] = parsed.attachments.map((a) => ({
    filename: a.filename,
    contentBase64: Buffer.from(a.content).toString("base64"),
    contentType: a.contentType,
  }));

  const body: VapronMessageBody = { from: fromAddress, to };
  if (cc.length > 0) body.cc = cc;
  if (bccOut.length > 0) body.bcc = bccOut;
  if (parsed.subject !== "") body.subject = parsed.subject;
  if (parsed.htmlBody !== undefined) body.html = parsed.htmlBody;
  if (parsed.textBody !== undefined) body.text = parsed.textBody;
  if (attachments.length > 0) body.attachments = attachments;
  if (Object.keys(headers).length > 0) body.headers = headers;
  if (options?.tenantId !== undefined && options.tenantId !== "") {
    body.tenantId = options.tenantId;
  }

  return body;
}

async function sendViaVapron(
  config: NonNullable<RelayConfig["vapron"]>,
  from: string,
  to: string[],
  rawMessage: string,
  options: RelaySendOptions | undefined,
  fetchImpl: RelayFetch,
): Promise<RelaySendResult> {
  const body = buildVapronMessage(from, to, rawMessage, options);
  if (body === null) {
    return {
      success: false,
      permanent: true,
      error:
        "Vapron: message has no From address; cannot determine a verified sending domain",
    };
  }

  const endpoint = `${config.url.replace(/\/+$/, "")}/v1/messages`;

  let response: RelayFetchResponse;
  try {
    response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    // Network / DNS / connection failure → transient, retryable.
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, permanent: false, error: `Vapron request failed: ${msg}` };
  }

  const status = response.status;
  const responseText = await response.text().catch(() => "");
  const snippet = responseText.slice(0, 500);

  // 202 = queued. Vapron owns delivery + retry from here, so this is success.
  if (status === 202) {
    let messageId: string | undefined;
    try {
      const json = JSON.parse(responseText) as Record<string, unknown>;
      if (typeof json["id"] === "string") messageId = json["id"];
      else if (typeof json["messageId"] === "string") messageId = json["messageId"];
    } catch {
      // Body may be empty or non-JSON; a 202 is still success.
    }
    return { success: true, messageId, response: `202 ${snippet}`.trim() };
  }

  // 403 = the FROM domain is not verified in Vapron's email-domain service.
  // Permanent for THIS message: it will 403 identically on every retry until
  // the domain is registered/verified. Do NOT infinite-retry — bounce.
  if (status === 403) {
    return {
      success: false,
      permanent: true,
      error:
        `Vapron 403: FROM domain not verified in Vapron email-domain — register/verify the ` +
        `sender domain before it can send. ${snippet}`.trim(),
    };
  }

  // 401 = bad token. A deploy/config error, not a per-message problem. Loud,
  // and permanent per the integration contract — piling up deferred mail
  // behind a misconfigured token would hide the real fault.
  if (status === 401) {
    console.error(
      "[relay:vapron] 401 Unauthorized from Vapron send API — VAPRON_EMAIL_SEND_TOKEN " +
        "is missing or invalid. Fix the token; do not treat this as a delivery failure.",
    );
    return {
      success: false,
      permanent: true,
      error: "Vapron 401: authentication rejected — VAPRON_EMAIL_SEND_TOKEN is invalid (config error)",
    };
  }

  // 422 = request validation failed. Permanent: the same body fails identically.
  if (status === 422) {
    return {
      success: false,
      permanent: true,
      error: `Vapron 422: request validation failed: ${snippet}`.trim(),
    };
  }

  // Other 4xx → permanent (a client error the same request cannot fix by retry).
  if (status >= 400 && status < 500) {
    return {
      success: false,
      permanent: true,
      error: `Vapron HTTP ${status} (permanent): ${snippet}`.trim(),
    };
  }

  // 5xx and anything else (unexpected 2xx/3xx) → transient. Defer and retry;
  // a gateway blip must not lose a message that is still deliverable.
  return {
    success: false,
    permanent: false,
    error: `Vapron HTTP ${status} (transient): ${snippet}`.trim(),
  };
}

// ─── RelayClient ────────────────────────────────────────────────────────────

/**
 * Unified relay client. Dispatches to the configured provider.
 *
 * Usage:
 * ```ts
 * const relay = new RelayClient(relayConfigFromEnv());
 * const result = await relay.send("sender@example.com", ["rcpt@example.com"], rawMimeMessage);
 * ```
 */
export class RelayClient {
  private readonly config: RelayConfig;
  private readonly fetchImpl: RelayFetch;

  /**
   * @param config - the relay provider configuration.
   * @param deps   - optional injected dependencies. `fetch` lets tests drive
   *                 the Vapron HTTP path without touching the network; it
   *                 defaults to the global `fetch`.
   */
  constructor(config: RelayConfig, deps?: { fetch?: RelayFetch }) {
    this.config = config;
    this.fetchImpl = deps?.fetch ?? fetch;
    this.validate();
  }

  /** Validate that the required provider config is present. */
  private validate(): void {
    switch (this.config.provider) {
      case "ses":
        if (!this.config.ses) {
          throw new Error("RelayClient: provider is 'ses' but ses config is missing");
        }
        if (!this.config.ses.username || !this.config.ses.password) {
          throw new Error("RelayClient: SES SMTP credentials (username/password) are required");
        }
        break;
      case "mailchannels":
        if (!this.config.mailchannels) {
          throw new Error("RelayClient: provider is 'mailchannels' but mailchannels config is missing");
        }
        if (!this.config.mailchannels.apiKey) {
          throw new Error("RelayClient: MailChannels API key is required");
        }
        break;
      case "smtp":
        if (!this.config.smtp) {
          throw new Error("RelayClient: provider is 'smtp' but smtp config is missing");
        }
        if (!this.config.smtp.host) {
          throw new Error("RelayClient: SMTP relay host is required");
        }
        break;
      case "vapron":
        if (!this.config.vapron) {
          throw new Error("RelayClient: provider is 'vapron' but vapron config is missing");
        }
        if (!this.config.vapron.url) {
          throw new Error("RelayClient: VAPRON_EMAIL_SEND_URL is required when RELAY_PROVIDER=vapron");
        }
        if (!this.config.vapron.token) {
          throw new Error("RelayClient: VAPRON_EMAIL_SEND_TOKEN is required when RELAY_PROVIDER=vapron");
        }
        break;
      default:
        throw new Error(`RelayClient: unknown provider '${this.config.provider as string}'`);
    }
  }

  /** The configured provider name. */
  get provider(): RelayConfig["provider"] {
    return this.config.provider;
  }

  /**
   * Send a raw MIME message through the configured relay.
   *
   * @param from       - Envelope sender (MAIL FROM). For the Vapron provider
   *                     this is the return-path; the Vapron `from` field is
   *                     taken from the message's own From header instead.
   * @param to         - Envelope recipients (RCPT TO)
   * @param rawMessage - Complete RFC 5322 message (headers + body), already DKIM-signed
   * @param options    - Per-send metadata not in the MIME (e.g. tenantId);
   *                     only the Vapron provider consumes it.
   */
  async send(
    from: string,
    to: string[],
    rawMessage: string,
    options?: RelaySendOptions,
  ): Promise<RelaySendResult> {
    switch (this.config.provider) {
      case "ses": {
        const ses = this.config.ses;
        if (!ses) return { success: false, error: "SES config missing" };
        return sendViaSes(ses, from, to, rawMessage);
      }

      case "mailchannels": {
        const mc = this.config.mailchannels;
        if (!mc) return { success: false, error: "Mailchannels config missing" };
        return sendViaMailchannels(mc, from, to, rawMessage);
      }

      case "smtp": {
        const smtp = this.config.smtp;
        if (!smtp) return { success: false, error: "SMTP config missing" };
        return sendViaSmtpRelay(smtp, from, to, rawMessage);
      }

      case "vapron": {
        const vapron = this.config.vapron;
        if (!vapron) return { success: false, error: "Vapron config missing" };
        return sendViaVapron(vapron, from, to, rawMessage, options, this.fetchImpl);
      }

      default:
        return { success: false, error: `Unknown relay provider: ${this.config.provider as string}` };
    }
  }
}
