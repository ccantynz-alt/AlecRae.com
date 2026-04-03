import type { SmtpSession, SmtpEnvelope } from "../types.js";

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
  onMessage: (session: SmtpSession, envelope: SmtpEnvelope, data: Uint8Array) => Promise<void>;
}

const DEFAULT_CONFIG: SmtpReceiverConfig = {
  hostname: "mx.emailed.dev",
  port: 25,
  maxMessageSize: 25 * 1024 * 1024, // 25 MB
  maxRecipients: 100,
  connectionTimeout: 300_000, // 5 minutes
  dataTimeout: 600_000, // 10 minutes
  requireTls: false,
  bannerDelay: 0,
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

  constructor(
    private readonly config: SmtpReceiverConfig,
    remoteAddress: string,
    remotePort: number,
  ) {
    this.state = "greeting";
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
      message: `${this.config.hostname} ESMTP Emailed Inbound - ${this.session.id}`,
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
        return this.handleRcptTo(args);
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
        mailFrom: this.session.mailFrom!,
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

    const match = args.match(/^FROM:\s*<([^>]*)>/i);
    if (!match) {
      return { code: 501, message: "Syntax error in MAIL FROM" };
    }

    const sender = match[1]!;

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

  private handleRcptTo(args: string): SmtpResponse {
    if (this.state !== "mail" && this.state !== "rcpt") {
      return { code: 503, message: "Bad sequence of commands" };
    }

    const match = args.match(/^TO:\s*<([^>]+)>/i);
    if (!match) {
      return { code: 501, message: "Syntax error in RCPT TO" };
    }

    if (this.session.rcptTo.length >= this.config.maxRecipients) {
      return { code: 452, message: "Too many recipients" };
    }

    const recipient = match[1]!;

    // Basic email validation
    if (!recipient.includes("@")) {
      return { code: 550, message: "Invalid recipient address" };
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
      result.push(data[i]!);
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

  constructor(config: Partial<SmtpReceiverConfig> & Pick<SmtpReceiverConfig, "onMessage">) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async start(): Promise<void> {
    if (this.running) throw new Error("SMTP Receiver already running");
    this.running = true;

    console.log(
      `[SmtpReceiver] Listening on ${this.config.hostname}:${this.config.port}`,
    );

    // In production: create a TCP server using Bun.listen() and handle
    // each connection with SmtpConnectionHandler.
    // Each connection gets its own handler instance for state management.
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;
    console.log("[SmtpReceiver] Stopped");
  }

  isRunning(): boolean {
    return this.running;
  }

  /**
   * Create a connection handler for testing or manual connection management.
   */
  createHandler(remoteAddress: string, remotePort: number): SmtpConnectionHandler {
    return new SmtpConnectionHandler(this.config, remoteAddress, remotePort);
  }
}
