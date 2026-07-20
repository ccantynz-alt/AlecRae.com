/**
 * SMTP Server Implementation
 * A real, functional SMTP server skeleton per RFC 5321.
 * Handles EHLO, MAIL FROM, RCPT TO, DATA, QUIT, STARTTLS, RSET, NOOP.
 */

import * as net from "node:net";
import * as crypto from "node:crypto";
import { EventEmitter } from "node:events";
import type {
  SmtpServerConfig,
  SmtpSession,
  SmtpEnvelope,
  SmtpParsedCommand,
} from "../types.js";
import {
  parseCommand,
  parseMailFrom,
  parseRcptTo,
  formatResponse,
  SmtpResponses,
  isCommandValidForState,
} from "./commands.js";
import { getMtaHostname } from "../config.js";
import type { TlsManager } from "../tls/manager.js";

const DEFAULT_CONFIG: SmtpServerConfig = {
  host: "0.0.0.0",
  port: 25,
  hostname: getMtaHostname(),
  maxMessageSize: 25 * 1024 * 1024, // 25 MB
  maxRecipients: 100,
  maxConnections: 500,
  connectionTimeout: 300_000, // 5 minutes
  socketTimeout: 60_000, // 1 minute idle
  banner: "",
  requireAuth: false,
  enableStarttls: true,
  maxConnectionsPerIp: 20,
  maxNewConnectionsPerIpPerWindow: 30,
  ipRateWindowMs: 60_000, // 1 minute
  ipBanDurationMs: 15 * 60_000, // 15 minutes
};

export interface SmtpServerEvents {
  connection: [session: SmtpSession];
  mailFrom: [address: string, session: SmtpSession];
  rcptTo: [address: string, session: SmtpSession];
  message: [envelope: SmtpEnvelope, session: SmtpSession];
  error: [error: Error, session?: SmtpSession];
  close: [session: SmtpSession];
  listening: [address: net.AddressInfo];
}

export class SmtpServer extends EventEmitter<SmtpServerEvents> {
  private readonly config: SmtpServerConfig;
  private readonly tlsManager: TlsManager | null;
  private server: net.Server | null = null;
  private readonly sessions = new Map<string, SmtpSession>();
  private readonly socketMap = new Map<string, net.Socket>();
  private readonly dataBuffers = new Map<string, string>();
  private connectionCount = 0;
  private totalMessagesReceived = 0;
  private startedAt: Date | null = null;

  // ── Per-IP abuse tracking (Fail2ban-equivalent) ──────────────────────────
  /** Current concurrent connection count per source IP. */
  private readonly concurrentByIp = new Map<string, number>();
  /** Recent connection timestamps per source IP, for the rate window. */
  private readonly connectionTimesByIp = new Map<string, number[]>();
  /** IPs currently banned, mapped to the epoch-ms their ban expires. */
  private readonly bannedUntilByIp = new Map<string, number>();
  private throttlePruneTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config?: Partial<SmtpServerConfig>, tlsManager?: TlsManager) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.tlsManager = tlsManager ?? null;
  }

  /**
   * Start the SMTP server listening on the configured host:port.
   */
  async start(): Promise<net.AddressInfo> {
    return new Promise<net.AddressInfo>((resolve, reject) => {
      this.server = net.createServer((socket) => {
        this.handleConnection(socket);
      });

      this.server.maxConnections = this.config.maxConnections;

      this.server.on("error", (error) => {
        this.emit("error", error);
        reject(error);
      });

      const srv = this.server;
      srv.listen(this.config.port, this.config.host, () => {
        this.startedAt = new Date();
        const addr = srv.address() as net.AddressInfo;
        this.emit("listening", addr);
        resolve(addr);
      });
    }).then((addr) => {
      // Prune stale per-IP throttle entries periodically — otherwise every
      // distinct IP that has ever connected (including one-off internet
      // scanners) leaves a Map entry forever.
      this.throttlePruneTimer = setInterval(() => this.pruneIpThrottleState(), 5 * 60_000);
      this.throttlePruneTimer.unref();
      return addr;
    });
  }

  /** Drop per-IP throttle entries that are no longer meaningful. */
  private pruneIpThrottleState(): void {
    const now = Date.now();
    const windowStart = now - this.config.ipRateWindowMs;

    for (const [ip, times] of this.connectionTimesByIp) {
      const recent = times.filter((t) => t > windowStart);
      if (recent.length === 0) {
        this.connectionTimesByIp.delete(ip);
      } else if (recent.length !== times.length) {
        this.connectionTimesByIp.set(ip, recent);
      }
    }

    for (const [ip, until] of this.bannedUntilByIp) {
      if (now >= until) {
        this.bannedUntilByIp.delete(ip);
      }
    }
  }

  /**
   * Gracefully stop the server.
   */
  async stop(): Promise<void> {
    if (this.throttlePruneTimer) {
      clearInterval(this.throttlePruneTimer);
      this.throttlePruneTimer = null;
    }

    return new Promise((resolve) => {
      if (!this.server) {
        resolve();
        return;
      }

      // Close all active connections
      for (const [sessionId, socket] of this.socketMap) {
        const response = formatResponse(SmtpResponses.serviceUnavailable());
        socket.write(response, () => {
          socket.destroy();
        });
        this.cleanupSession(sessionId);
      }

      this.server.close(() => {
        this.server = null;
        resolve();
      });
    });
  }

  get status() {
    return {
      uptime: this.startedAt ? Date.now() - this.startedAt.getTime() : 0,
      connections: this.sessions.size,
      messagesReceived: this.totalMessagesReceived,
      startedAt: this.startedAt,
    };
  }

  /**
   * Check + record this connection attempt against per-IP abuse limits.
   * Returns null if the connection is allowed, or a reason string if it
   * should be rejected (already-banned, concurrent cap, or rate cap — the
   * rate-cap case also starts a new ban).
   */
  private checkIpThrottle(ip: string): string | null {
    const now = Date.now();

    const bannedUntil = this.bannedUntilByIp.get(ip);
    if (bannedUntil !== undefined) {
      if (now < bannedUntil) {
        return "banned";
      }
      this.bannedUntilByIp.delete(ip);
    }

    const concurrent = this.concurrentByIp.get(ip) ?? 0;
    if (concurrent >= this.config.maxConnectionsPerIp) {
      return "concurrent_limit";
    }

    const windowStart = now - this.config.ipRateWindowMs;
    const recent = (this.connectionTimesByIp.get(ip) ?? []).filter((t) => t > windowStart);
    recent.push(now);
    this.connectionTimesByIp.set(ip, recent);

    if (recent.length > this.config.maxNewConnectionsPerIpPerWindow) {
      this.bannedUntilByIp.set(ip, now + this.config.ipBanDurationMs);
      console.warn(
        `[mta] IP ${ip} exceeded ${this.config.maxNewConnectionsPerIpPerWindow} connections/${this.config.ipRateWindowMs}ms — banned for ${this.config.ipBanDurationMs}ms`,
      );
      return "rate_limit";
    }

    return null;
  }

  private handleConnection(socket: net.Socket): void {
    if (this.sessions.size >= this.config.maxConnections) {
      const response = formatResponse(SmtpResponses.serviceUnavailable());
      socket.write(response, () => socket.destroy());
      return;
    }

    const remoteAddress = socket.remoteAddress ?? "unknown";

    const throttleReason = this.checkIpThrottle(remoteAddress);
    if (throttleReason) {
      // No greeting at all for a banned/rate-limited IP — matches how a real
      // Fail2ban-style drop behaves, and avoids giving a scanner a signal to
      // distinguish "banned" from "just slow" via response timing/content.
      socket.destroy();
      return;
    }

    this.concurrentByIp.set(remoteAddress, (this.concurrentByIp.get(remoteAddress) ?? 0) + 1);

    const sessionId = crypto.randomUUID();
    const remotePort = socket.remotePort ?? 0;

    const session: SmtpSession = {
      id: sessionId,
      remoteAddress,
      remotePort,
      state: "GREETING",
      ehlo: null,
      envelope: this.createEmptyEnvelope(),
      tls: false,
      authenticated: false,
      authUser: null,
      messageCount: 0,
      startedAt: new Date(),
    };

    this.sessions.set(sessionId, session);
    this.socketMap.set(sessionId, socket);
    this.connectionCount++;

    this.emit("connection", session);

    // Send greeting
    const greeting = formatResponse(
      SmtpResponses.greeting(this.config.hostname, this.config.banner || undefined),
    );
    socket.write(greeting);

    // Set up timeouts
    socket.setTimeout(this.config.socketTimeout);

    // Line-buffered input
    let inputBuffer = "";

    socket.on("data", (chunk: Buffer) => {
      const currentSession = this.sessions.get(sessionId);
      if (!currentSession) return;

      inputBuffer += chunk.toString("utf-8");

      if (currentSession.state === "DATA_RECEIVING") {
        this.handleDataInput(sessionId, inputBuffer, socket);
        inputBuffer = "";
        return;
      }

      // Process complete lines
      let lineEnd: number;
      while ((lineEnd = inputBuffer.indexOf("\r\n")) !== -1) {
        const line = inputBuffer.substring(0, lineEnd);
        inputBuffer = inputBuffer.substring(lineEnd + 2);
        this.processCommand(sessionId, line, socket);
      }

      // Also handle bare LF (common in the wild)
      while ((lineEnd = inputBuffer.indexOf("\n")) !== -1) {
        const line = inputBuffer.substring(0, lineEnd).replace(/\r$/, "");
        inputBuffer = inputBuffer.substring(lineEnd + 1);
        this.processCommand(sessionId, line, socket);
      }
    });

    socket.on("timeout", () => {
      const response = formatResponse(SmtpResponses.serviceUnavailable());
      socket.write(response, () => socket.destroy());
    });

    socket.on("close", () => {
      const closedSession = this.sessions.get(sessionId);
      if (closedSession) {
        this.emit("close", closedSession);
      }
      this.cleanupSession(sessionId);
    });

    socket.on("error", (error) => {
      this.emit("error", error, this.sessions.get(sessionId));
      this.cleanupSession(sessionId);
    });
  }

  private processCommand(sessionId: string, line: string, socket: net.Socket): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const parsed = parseCommand(line);

    // Check command is valid for current state
    if (!isCommandValidForState(parsed.command, session.state)) {
      if (parsed.command === "UNKNOWN") {
        socket.write(formatResponse(SmtpResponses.syntaxError()));
      } else {
        socket.write(formatResponse(SmtpResponses.badSequence()));
      }
      return;
    }

    switch (parsed.command) {
      case "EHLO":
        this.handleEhlo(session, parsed, socket);
        break;
      case "HELO":
        this.handleHelo(session, parsed, socket);
        break;
      case "MAIL":
        this.handleMailFrom(session, parsed, socket);
        break;
      case "RCPT":
        this.handleRcptTo(session, parsed, socket);
        break;
      case "DATA":
        this.handleData(session, socket);
        break;
      case "RSET":
        this.handleRset(session, socket);
        break;
      case "NOOP":
        socket.write(formatResponse(SmtpResponses.noop()));
        break;
      case "QUIT":
        this.handleQuit(session, socket);
        break;
      case "STARTTLS":
        this.handleStartTls(session, socket);
        break;
      case "VRFY":
        // RFC 5321 3.5.3 - servers MAY refuse VRFY
        socket.write(formatResponse(SmtpResponses.commandNotImplemented()));
        break;
      case "AUTH":
        // Placeholder for future auth implementation
        socket.write(formatResponse(SmtpResponses.commandNotImplemented()));
        break;
      default:
        socket.write(formatResponse(SmtpResponses.syntaxError()));
        break;
    }
  }

  private handleEhlo(session: SmtpSession, parsed: SmtpParsedCommand, socket: net.Socket): void {
    if (!parsed.argument) {
      socket.write(formatResponse(SmtpResponses.parameterError("EHLO requires a domain argument")));
      return;
    }

    session.ehlo = parsed.argument;
    session.state = "READY";
    this.resetEnvelope(session);

    const extensions: string[] = [
      `SIZE ${this.config.maxMessageSize}`,
      "8BITMIME",
      "SMTPUTF8",
      "ENHANCEDSTATUSCODES",
      "PIPELINING",
    ];

    if (this.config.enableStarttls && !session.tls && this.tlsManager) {
      extensions.push("STARTTLS");
    }

    if (this.config.requireAuth || session.tls) {
      extensions.push("AUTH PLAIN LOGIN");
    }

    socket.write(formatResponse(SmtpResponses.ehlo(this.config.hostname, extensions)));
  }

  private handleHelo(session: SmtpSession, parsed: SmtpParsedCommand, socket: net.Socket): void {
    if (!parsed.argument) {
      socket.write(formatResponse(SmtpResponses.parameterError("HELO requires a domain argument")));
      return;
    }

    session.ehlo = parsed.argument;
    session.state = "READY";
    this.resetEnvelope(session);

    socket.write(formatResponse(SmtpResponses.helo(this.config.hostname)));
  }

  private handleMailFrom(session: SmtpSession, parsed: SmtpParsedCommand, socket: net.Socket): void {
    if (this.config.requireAuth && !session.authenticated) {
      socket.write(formatResponse(SmtpResponses.authRequired()));
      return;
    }

    const mailFrom = parseMailFrom(parsed.argument);
    if (!mailFrom) {
      socket.write(formatResponse(SmtpResponses.parameterError("Invalid MAIL FROM syntax")));
      return;
    }

    // Check SIZE parameter if provided
    const sizeParam = mailFrom.params["SIZE"];
    if (sizeParam) {
      const declaredSize = parseInt(sizeParam, 10);
      if (!Number.isNaN(declaredSize) && declaredSize > this.config.maxMessageSize) {
        socket.write(formatResponse(SmtpResponses.messageTooLarge()));
        return;
      }
    }

    session.envelope.mailFrom = {
      address: mailFrom.address,
      params: mailFrom.params,
    };
    session.state = "MAIL_FROM";

    this.emit("mailFrom", mailFrom.address, session);
    socket.write(formatResponse(SmtpResponses.mailOk()));
  }

  private handleRcptTo(session: SmtpSession, parsed: SmtpParsedCommand, socket: net.Socket): void {
    const rcptTo = parseRcptTo(parsed.argument);
    if (!rcptTo) {
      socket.write(formatResponse(SmtpResponses.parameterError("Invalid RCPT TO syntax")));
      return;
    }

    if (!rcptTo.address) {
      socket.write(formatResponse(SmtpResponses.parameterError("Recipient address required")));
      return;
    }

    if (session.envelope.rcptTo.length >= this.config.maxRecipients) {
      socket.write(formatResponse(SmtpResponses.tooManyRecipients()));
      return;
    }

    session.envelope.rcptTo.push({
      address: rcptTo.address,
      params: rcptTo.params,
    });
    session.state = "RCPT_TO";

    this.emit("rcptTo", rcptTo.address, session);
    socket.write(formatResponse(SmtpResponses.rcptOk()));
  }

  private handleData(session: SmtpSession, socket: net.Socket): void {
    if (session.envelope.rcptTo.length === 0) {
      socket.write(formatResponse(SmtpResponses.badSequence("No valid recipients")));
      return;
    }

    session.state = "DATA_RECEIVING";
    this.dataBuffers.set(session.id, "");
    socket.write(formatResponse(SmtpResponses.dataStart()));
  }

  private handleDataInput(sessionId: string, data: string, socket: net.Socket): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const buffer = (this.dataBuffers.get(sessionId) ?? "") + data;

    // Look for end-of-data marker: <CRLF>.<CRLF>
    const endMarkerCRLF = "\r\n.\r\n";
    const endMarkerLF = "\n.\n"; // tolerate bare LF

    let endIndex = buffer.indexOf(endMarkerCRLF);

    if (endIndex === -1) {
      endIndex = buffer.indexOf(endMarkerLF);
    }

    if (endIndex === -1) {
      // Check message size limit
      if (buffer.length > this.config.maxMessageSize) {
        this.dataBuffers.delete(sessionId);
        session.state = "READY";
        socket.write(formatResponse(SmtpResponses.messageTooLarge()));
        return;
      }

      this.dataBuffers.set(sessionId, buffer);
      return;
    }

    // We have the complete message
    const messageData = buffer.substring(0, endIndex);
    this.dataBuffers.delete(sessionId);

    // Undo dot-stuffing per RFC 5321 4.5.2
    const unstuffed = messageData.replace(/^\.\./gm, ".");

    session.envelope.data = unstuffed;
    session.messageCount++;
    this.totalMessagesReceived++;

    const messageId = `${crypto.randomUUID()}@${this.config.hostname}`;

    // Emit the message event
    this.emit("message", { ...session.envelope }, session);

    // Reset for next message
    session.state = "READY";
    this.resetEnvelope(session);

    socket.write(formatResponse(SmtpResponses.dataAccepted(messageId)));
  }

  private handleRset(session: SmtpSession, socket: net.Socket): void {
    this.resetEnvelope(session);
    session.state = session.ehlo ? "READY" : "GREETING";
    socket.write(formatResponse(SmtpResponses.reset()));
  }

  private handleQuit(session: SmtpSession, socket: net.Socket): void {
    session.state = "QUIT";
    const response = formatResponse(SmtpResponses.bye());
    socket.write(response, () => {
      socket.end();
    });
  }

  private handleStartTls(session: SmtpSession, socket: net.Socket): void {
    if (!this.config.enableStarttls || !this.tlsManager) {
      socket.write(formatResponse(SmtpResponses.commandNotImplemented()));
      return;
    }

    if (session.tls) {
      socket.write(formatResponse(SmtpResponses.badSequence("TLS already active")));
      return;
    }

    socket.write(formatResponse(SmtpResponses.startTlsReady()));

    // Upgrade the socket to TLS
    this.tlsManager
      .upgradeToTls(socket, this.config.hostname)
      .then((tlsSocket) => {
        // Replace the socket in our map
        this.socketMap.set(session.id, tlsSocket as unknown as net.Socket);
        session.tls = true;

        // Reset session state after STARTTLS per RFC 3207
        session.ehlo = null;
        session.state = "GREETING";
        this.resetEnvelope(session);

        // Re-attach data handlers to the new TLS socket
        let inputBuffer = "";

        tlsSocket.on("data", (chunk: Buffer) => {
          const currentSession = this.sessions.get(session.id);
          if (!currentSession) return;

          inputBuffer += chunk.toString("utf-8");

          if (currentSession.state === "DATA_RECEIVING") {
            this.handleDataInput(session.id, inputBuffer, tlsSocket as unknown as net.Socket);
            inputBuffer = "";
            return;
          }

          let lineEnd: number;
          while ((lineEnd = inputBuffer.indexOf("\r\n")) !== -1) {
            const line = inputBuffer.substring(0, lineEnd);
            inputBuffer = inputBuffer.substring(lineEnd + 2);
            this.processCommand(session.id, line, tlsSocket as unknown as net.Socket);
          }
          while ((lineEnd = inputBuffer.indexOf("\n")) !== -1) {
            const line = inputBuffer.substring(0, lineEnd).replace(/\r$/, "");
            inputBuffer = inputBuffer.substring(lineEnd + 1);
            this.processCommand(session.id, line, tlsSocket as unknown as net.Socket);
          }
        });

        tlsSocket.on("close", () => {
          this.emit("close", session);
          this.cleanupSession(session.id);
        });

        tlsSocket.on("error", (error) => {
          this.emit("error", error, session);
          this.cleanupSession(session.id);
        });
      })
      .catch((error) => {
        this.emit("error", error instanceof Error ? error : new Error(String(error)), session);
        socket.destroy();
        this.cleanupSession(session.id);
      });
  }

  private createEmptyEnvelope(): SmtpEnvelope {
    return {
      mailFrom: null,
      rcptTo: [],
      data: "",
    };
  }

  private resetEnvelope(session: SmtpSession): void {
    session.envelope = this.createEmptyEnvelope();
  }

  private cleanupSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      const remaining = (this.concurrentByIp.get(session.remoteAddress) ?? 1) - 1;
      if (remaining <= 0) {
        this.concurrentByIp.delete(session.remoteAddress);
      } else {
        this.concurrentByIp.set(session.remoteAddress, remaining);
      }
    }
    this.sessions.delete(sessionId);
    this.socketMap.delete(sessionId);
    this.dataBuffers.delete(sessionId);
  }
}
