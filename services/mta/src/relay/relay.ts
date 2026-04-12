/**
 * @emailed/mta — Relay Client
 *
 * Unified relay interface for sending email through managed providers
 * instead of direct MX delivery. Supports:
 *   - Amazon SES SMTP relay (STARTTLS + AUTH)
 *   - MailChannels HTTP API (POST raw MIME)
 *   - Generic SMTP relay (any relay with optional auth)
 *
 * DKIM signing happens upstream (services/mta/src/dkim/signer.ts) before
 * the message reaches the relay, so the relay sends the already-signed
 * raw message as-is.
 */

import * as net from "node:net";
import * as tls from "node:tls";

// ─── Configuration ──────────────────────────────────────────────────────────

export interface RelayConfig {
  provider: "ses" | "mailchannels" | "smtp";
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
}

export interface RelaySendResult {
  success: boolean;
  messageId?: string | undefined;
  response?: string | undefined;
  error?: string | undefined;
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
    await relay.ehlo("mail.emailed.dev");

    // 4. STARTTLS (required for SES on port 587)
    if (relay.hasExtension("STARTTLS")) {
      await relay.starttls(config.host);
      // Re-EHLO after TLS upgrade
      await relay.ehlo("mail.emailed.dev");
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
    await relay.ehlo("mail.emailed.dev");

    // 4. STARTTLS if not already on TLS and server supports it
    if (config.tls !== false && config.port !== 465 && relay.hasExtension("STARTTLS")) {
      await relay.starttls(config.host);
      await relay.ehlo("mail.emailed.dev");
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

  constructor(config: RelayConfig) {
    this.config = config;
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
   * @param from       - Envelope sender (MAIL FROM)
   * @param to         - Envelope recipients (RCPT TO)
   * @param rawMessage - Complete RFC 5322 message (headers + body), already DKIM-signed
   */
  async send(from: string, to: string[], rawMessage: string): Promise<RelaySendResult> {
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

      default:
        return { success: false, error: `Unknown relay provider: ${this.config.provider as string}` };
    }
  }
}
