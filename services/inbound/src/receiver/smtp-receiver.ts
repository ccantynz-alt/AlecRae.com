import * as net from "node:net";
import type { SmtpSession, SmtpEnvelope } from "../types.js";

// ─── Domain verification callback ────────────────────────────────────────────

export interface DomainCheckResult {
  registered: boolean;
  active: boolean;
  dnsStale: boolean;
}

/**
 * Callback to check whether a recipient domain is registered and verified.
 * When provided, RCPT TO will reject mail for unregistered domains.
 */
export type DomainVerifier = (domain: string) => Promise<DomainCheckResult>;

// ─── Rate limiting for inbound messages per domain ───────────────────────────

class InboundRateLimiter {
  private counters = new Map<string, { count: number; windowStart: number }>();
  private readonly maxPerHour: number;

  constructor(maxPerHour: number) {
    this.maxPerHour = maxPerHour;
  }

  check(domain: string): boolean {
    const now = Date.now();
    const oneHourMs = 60 * 60 * 1000;
    const entry = this.counters.get(domain);

    if (!entry || now - entry.windowStart > oneHourMs) {
      this.counters.set(domain, { count: 1, windowStart: now });
      return true;
    }

    if (entry.count >= this.maxPerHour) {
      return false;
    }

    entry.count++;
    return true;
  }

  /** For testing: reset all counters */
  reset(): void {
    this.counters.clear();
  }
}

/**
 * SMTP command types supported by the receiver.
 */
type SmtpCommand = "EHLO" | "HELO" | "MAIL" | "RCPT" | "DATA" | "RSET" | "QUIT" | "STARTTLS" | "AUTH" | "NOOP";

interface SmtpResponse {
  code: number;
  message: string;
  close?: boolean;
}

interface SmtpReceiverConfig {
  hostname: string;
  port: number;
  maxMessageSize: number;
  maxRecipients: number;
  connectionTimeout: number;
  dataTimeout: number;
  requireTls: boolean;
  bannerDelay: number;
  allowedSenderDomains?: Set<string>;
  /** Callback to verify recipient domain is registered and active */
  domainVerifier?: DomainVerifier;
  /** Max inbound messages per domain per hour (default: 100) */
  maxInboundPerDomainPerHour?: number;
  onMessage: (session: SmtpSession, envelope: SmtpEnvelope, data: Uint8Array) => Promise<void>;
}

const DEFAULT_CONFIG: SmtpReceiverConfig = {
  hostname: "mx.alecrae.dev",
  port: 25,
  maxMessageSize: 25 * 1024 * 1024, // 25 MB
  maxRecipients: 100,
  connectionTimeout: 300_000, // 5 minutes
  dataTimeout: 600_000, // 10 minutes
  requireTls: false,
  bannerDelay: 0,
  maxInboundPerDomainPerHour: 100,
  onMessage: async () => {},
};

/**
 * State machine for a single SMTP connection.
 */
export class SmtpConnectionHandler {
  private session: SmtpSession;
  private state: "greeting" | "ready" | "mail" | "rcpt" | "data" | "closed";
  private dataBuffer: Uint8Array[] = [];
  private dataSize = 0;
  private rateLimiter: InboundRateLimiter;

  constructor(
    private readonly config: SmtpReceiverConfig,
    remoteAddress: string,
    remotePort: number,
    rateLimiter?: InboundRateLimiter,
  ) {
    this.state = "greeting";
    this.rateLimiter = rateLimiter ?? new InboundRateLimiter(config.maxInboundPerDomainPerHour ?? 100);
    this.session = {
      id: this.generateSessionId(),
      remoteAddress,
      remotePort,
      secure: false,
      rcptTo: [],
      startedAt: new Date(),
    };
  }

  private generateSessionId(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(12));
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  /**
   * Generate the initial SMTP banner response.
   */
  getGreeting(): SmtpResponse {
    this.state = "ready";
    return {
      code: 220,
      message: `${this.config.hostname} ESMTP AlecRae Inbound - ${this.session.id}`,
    };
  }

  /**
   * Process a single SMTP command line and return a response.
   */
  async processCommand(line: string): Promise<SmtpResponse> {
    if (this.state === "closed") {
      return { code: 421, message: "Connection closed", close: true };
    }

    const trimmed = line.trim();
    if (trimmed.length === 0) {
      return { code: 500, message: "Syntax error, command unrecognized" };
    }

    const spaceIdx = trimmed.indexOf(" ");
    const verb = (spaceIdx > 0 ? trimmed.slice(0, spaceIdx) : trimmed).toUpperCase() as SmtpCommand;
    const args = spaceIdx > 0 ? trimmed.slice(spaceIdx + 1).trim() : "";

    switch (verb) {
      case "EHLO":
        return this.handleEhlo(args);
      case "HELO":
        return this.handleHelo(args);
      case "MAIL":
        return this.handleMailFrom(args);
      case "RCPT":
        return await this.handleRcptTo(args);
      case "DATA":
        return this.handleDataStart();
      case "RSET":
        return this.handleReset();
      case "QUIT":
        return this.handleQuit();
      case "STARTTLS":
        return this.handleStartTls();
      case "NOOP":
        return { code: 250, message: "OK" };
      default:
        return { code: 502, message: `Command not implemented: ${verb}` };
    }
  }

  /**
   * Process a chunk of DATA content. Returns a response when the terminator is found.
   */
  async processDataChunk(chunk: Uint8Array): Promise<SmtpResponse | null> {
    if (this.state !== "data") return null;

    this.dataBuffer.push(chunk);
    this.dataSize += chunk.length;

    if (this.dataSize > this.config.maxMessageSize) {
      this.resetTransaction();
      return { code: 552, message: "Message exceeds maximum size" };
    }

    // Check for end-of-data marker: \r\n.\r\n
    const combined = this.concatenateBuffers();
    const terminator = new Uint8Array([13, 10, 46, 13, 10]); // \r\n.\r\n
    const terminatorIdx = this.findSequence(combined, terminator);

    if (terminatorIdx === -1) return null;

    // Extract message data (excluding the terminator dot line)
    const messageData = combined.slice(0, terminatorIdx + 2); // include final \r\n before .
    const unstuffed = this.unstuffDots(messageData);

    try {
      const envelope: SmtpEnvelope = {
        mailFrom: this.session.mailFrom ?? "",
        rcptTo: [...this.session.rcptTo],
      };

      await this.config.onMessage(this.session, envelope, unstuffed);
      this.resetTransaction();
      return { code: 250, message: `OK: message queued as ${this.session.id}` };
    } catch (err) {
      this.resetTransaction();
      const message = err instanceof Error ? err.message : "Processing failed";
      return { code: 451, message: `Temporary failure: ${message}` };
    }
  }

  private handleEhlo(hostname: string): SmtpResponse {
    if (!hostname) {
      return { code: 501, message: "EHLO requires a hostname" };
    }

    this.session.heloHostname = hostname;
    this.session.clientHostname = hostname;
    this.state = "ready";

    const extensions = [
      `${this.config.hostname} greets ${hostname}`,
      `SIZE ${this.config.maxMessageSize}`,
      "8BITMIME",
      "SMTPUTF8",
      "PIPELINING",
      "ENHANCEDSTATUSCODES",
    ];

    if (!this.session.secure) {
      extensions.push("STARTTLS");
    }

    return { code: 250, message: extensions.join("\n") };
  }

  private handleHelo(hostname: string): SmtpResponse {
    if (!hostname) {
      return { code: 501, message: "HELO requires a hostname" };
    }

    this.session.heloHostname = hostname;
    this.session.clientHostname = hostname;
    this.state = "ready";

    return { code: 250, message: `${this.config.hostname} greets ${hostname}` };
  }

  private handleMailFrom(args: string): SmtpResponse {
    if (this.state !== "ready") {
      return { code: 503, message: "Bad sequence of commands" };
    }

    const match = /^FROM:\s*<([^>]*)>/i.exec(args);
    if (!match || match[1] === undefined) {
      return { code: 501, message: "Syntax error in MAIL FROM" };
    }

    const sender = match[1];

    // Validate sender domain if restrictions are configured
    if (this.config.allowedSenderDomains && sender) {
      const domain = sender.split("@")[1];
      if (domain && !this.config.allowedSenderDomains.has(domain)) {
        return { code: 550, message: `Sender domain ${domain} not allowed` };
      }
    }

    this.session.mailFrom = sender;
    this.state = "mail";

    return { code: 250, message: "OK" };
  }

  private async handleRcptTo(args: string): Promise<SmtpResponse> {
    if (this.state !== "mail" && this.state !== "rcpt") {
      return { code: 503, message: "Bad sequence of commands" };
    }

    const match = /^TO:\s*<([^>]+)>/i.exec(args);
    if (!match || match[1] === undefined) {
      return { code: 501, message: "Syntax error in RCPT TO" };
    }

    if (this.session.rcptTo.length >= this.config.maxRecipients) {
      return { code: 452, message: "Too many recipients" };
    }

    const recipient = match[1];

    // Basic email validation
    if (!recipient.includes("@")) {
      return { code: 550, message: "Invalid recipient address" };
    }

    // Extract recipient domain
    const recipientDomain = recipient.split("@")[1];
    if (!recipientDomain) {
      return { code: 550, message: "Invalid recipient address — missing domain" };
    }

    // Domain verification: check if this domain is registered and active
    if (this.config.domainVerifier) {
      try {
        const result = await this.config.domainVerifier(recipientDomain);

        if (!result.registered) {
          return { code: 550, message: `Relay not permitted for domain ${recipientDomain}` };
        }

        if (result.dnsStale) {
          return { code: 450, message: "Try again later — domain DNS verification pending" };
        }

        if (!result.active) {
          return { code: 550, message: `Domain ${recipientDomain} is not active` };
        }
      } catch (err) {
        // On verifier error, temp-fail rather than silently accept
        console.error(`[SmtpReceiver] Domain verification error for ${recipientDomain}:`, err);
        return { code: 450, message: "Temporary failure — try again later" };
      }
    }

    // Rate limiting: max N inbound messages per domain per hour
    if (!this.rateLimiter.check(recipientDomain)) {
      return { code: 452, message: `Rate limit exceeded for domain ${recipientDomain} — try again later` };
    }

    this.session.rcptTo.push(recipient);
    this.state = "rcpt";

    return { code: 250, message: "OK" };
  }

  private handleDataStart(): SmtpResponse {
    if (this.state !== "rcpt") {
      return { code: 503, message: "Bad sequence of commands - need RCPT first" };
    }

    if (this.session.rcptTo.length === 0) {
      return { code: 503, message: "No valid recipients" };
    }

    if (this.config.requireTls && !this.session.secure) {
      return { code: 530, message: "Must issue STARTTLS first" };
    }

    this.state = "data";
    this.dataBuffer = [];
    this.dataSize = 0;

    return { code: 354, message: "Start mail input; end with <CRLF>.<CRLF>" };
  }

  private handleStartTls(): SmtpResponse {
    if (this.session.secure) {
      return { code: 503, message: "TLS already active" };
    }

    // In production: initiate TLS handshake on the socket.
    // The caller is responsible for upgrading the connection.
    this.session.secure = true;
    return { code: 220, message: "Ready to start TLS" };
  }

  private handleReset(): SmtpResponse {
    this.resetTransaction();
    return { code: 250, message: "OK" };
  }

  private handleQuit(): SmtpResponse {
    this.state = "closed";
    return { code: 221, message: `${this.config.hostname} closing connection`, close: true };
  }

  private resetTransaction(): void {
    this.session.mailFrom = undefined;
    this.session.rcptTo = [];
    this.dataBuffer = [];
    this.dataSize = 0;
    this.state = "ready";
  }

  private concatenateBuffers(): Uint8Array {
    const totalLength = this.dataBuffer.reduce((sum, buf) => sum + buf.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const buf of this.dataBuffer) {
      result.set(buf, offset);
      offset += buf.length;
    }
    return result;
  }

  private findSequence(haystack: Uint8Array, needle: Uint8Array): number {
    outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
      for (let j = 0; j < needle.length; j++) {
        if (haystack[i + j] !== needle[j]) continue outer;
      }
      return i;
    }
    return -1;
  }

  /**
   * Remove dot-stuffing from DATA content (RFC 5321, Section 4.5.2).
   */
  private unstuffDots(data: Uint8Array): Uint8Array {
    const result: number[] = [];
    let i = 0;
    while (i < data.length) {
      // At the start of a line (after \r\n), if we see a dot followed by another dot,
      // skip the first dot.
      if (
        i >= 2 &&
        data[i - 2] === 13 &&
        data[i - 1] === 10 &&
        data[i] === 46 &&
        i + 1 < data.length &&
        data[i + 1] === 46
      ) {
        i++; // Skip the stuffed dot
      }
      const byte = data[i];
      if (byte !== undefined) result.push(byte);
      i++;
    }
    return new Uint8Array(result);
  }

  getSession(): SmtpSession {
    return { ...this.session, rcptTo: [...this.session.rcptTo] };
  }
}

/**
 * SMTP Receiver server.
 * In production, this listens on port 25 for incoming SMTP connections.
 */
export class SmtpReceiver {
  private config: SmtpReceiverConfig;
  private running = false;
  private server: net.Server | null = null;
  private activeConnections = new Set<net.Socket>();
  private rateLimiter: InboundRateLimiter;

  constructor(config: Partial<SmtpReceiverConfig> & Pick<SmtpReceiverConfig, "onMessage">) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.rateLimiter = new InboundRateLimiter(this.config.maxInboundPerDomainPerHour ?? 100);
  }

  async start(): Promise<void> {
    if (this.running) throw new Error("SMTP Receiver already running");
    this.running = true;

    return new Promise<void>((resolve, reject) => {
      this.server = net.createServer((socket) => {
        this.handleConnection(socket);
      });

      this.server.maxConnections = 500;

      this.server.on("error", (err) => {
        console.error("[SmtpReceiver] Server error:", err);
        if (!this.running) reject(err);
      });

      this.server.listen(this.config.port, () => {
        console.log(
          `[SmtpReceiver] Listening on ${this.config.hostname}:${this.config.port}`,
        );
        resolve();
      });
    });
  }

  private handleConnection(socket: net.Socket): void {
    const remoteAddress = socket.remoteAddress ?? "unknown";
    const remotePort = socket.remotePort ?? 0;

    this.activeConnections.add(socket);
    const handler = new SmtpConnectionHandler(
      this.config,
      remoteAddress,
      remotePort,
      this.rateLimiter,
    );

    // Send SMTP greeting
    socket.write(`220 ${this.config.hostname} ESMTP AlecRae\r\n`);

    socket.setTimeout(this.config.connectionTimeout);

    let lineBuffer = "";

    let inDataMode = false;

    socket.on("data", async (data) => {
      // When in DATA mode, pass raw bytes to the data chunk processor
      if (inDataMode) {
        try {
          const response = await handler.processDataChunk(data);
          if (response) {
            // DATA complete (end-of-data marker found)
            inDataMode = false;
            socket.write(`${response.code} ${response.message}\r\n`);
            if (response.close) {
              socket.end();
              return;
            }
          }
        } catch (err) {
          console.error(
            `[SmtpReceiver] Error processing data from ${remoteAddress}:`,
            err,
          );
          inDataMode = false;
          socket.write("451 Internal server error\r\n");
        }
        return;
      }

      lineBuffer += data.toString("utf-8");

      // Process complete SMTP command lines
      let newlineIdx: number;
      while ((newlineIdx = lineBuffer.indexOf("\r\n")) !== -1) {
        const line = lineBuffer.slice(0, newlineIdx);
        lineBuffer = lineBuffer.slice(newlineIdx + 2);

        try {
          const response = await handler.processCommand(line);
          if (response) {
            socket.write(`${response.code} ${response.message}\r\n`);

            if (response.close) {
              socket.end();
              return;
            }

            // 354 means server is ready to receive DATA
            if (response.code === 354) {
              inDataMode = true;
              // Any remaining data in the lineBuffer is part of the message body
              if (lineBuffer.length > 0) {
                const remaining = new TextEncoder().encode(lineBuffer);
                lineBuffer = "";
                const dataResponse = await handler.processDataChunk(remaining);
                if (dataResponse) {
                  inDataMode = false;
                  socket.write(`${dataResponse.code} ${dataResponse.message}\r\n`);
                }
              }
              return;
            }
          }
        } catch (err) {
          console.error(
            `[SmtpReceiver] Error processing command from ${remoteAddress}:`,
            err,
          );
          socket.write("451 Internal server error\r\n");
        }
      }
    });

    socket.on("timeout", () => {
      socket.write("421 Connection timed out\r\n");
      socket.end();
    });

    socket.on("error", (err) => {
      console.warn(`[SmtpReceiver] Socket error from ${remoteAddress}:`, err.message);
    });

    socket.on("close", () => {
      this.activeConnections.delete(socket);
    });
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;

    // Close all active connections
    for (const socket of this.activeConnections) {
      socket.write("421 Service shutting down\r\n");
      socket.end();
    }
    this.activeConnections.clear();

    // Close the server
    const srv = this.server;
    if (srv) {
      await new Promise<void>((resolve) => {
        srv.close(() => { resolve(); });
      });
      this.server = null;
    }

    console.log("[SmtpReceiver] Stopped");
  }

  isRunning(): boolean {
    return this.running;
  }

  getConnectionCount(): number {
    return this.activeConnections.size;
  }

  /**
   * Create a connection handler for testing or manual connection management.
   */
  createHandler(remoteAddress: string, remotePort: number): SmtpConnectionHandler {
    return new SmtpConnectionHandler(this.config, remoteAddress, remotePort, this.rateLimiter);
  }
}

// Re-export for testing
export { InboundRateLimiter };
export type { SmtpReceiverConfig, DomainCheckResult, DomainVerifier };
