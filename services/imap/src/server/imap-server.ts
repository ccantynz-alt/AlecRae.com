/**
 * IMAP Server Implementation
 * A production-quality IMAP4rev2 (RFC 9051) / IMAP4rev1 (RFC 3501) server.
 * Acts as a compatibility bridge: speaks IMAP to legacy clients but uses
 * the same underlying mailbox storage as the JMAP service.
 *
 * Supports IMAPS (port 993, implicit TLS) and IMAP+STARTTLS (port 143).
 */

import * as net from "node:net";
import * as tls from "node:tls";
import * as crypto from "node:crypto";
import { EventEmitter } from "node:events";
import type {
  ImapServerConfig,
  ImapSession,
  ImapCommand,
  ImapServerEvents,
} from "../types.js";
import { DEFAULT_CAPABILITIES } from "../types.js";
import {
  parseCommand,
  detectLiteral,
  formatTagged,
  formatUntagged,
  formatContinuation,
  buildCapabilityString,
  isCommandValidForState,
} from "./commands.js";
import { handleLogin, handleAuthenticate } from "../handlers/auth.js";
import {
  handleSelect,
  handleExamine,
  handleCreate,
  handleDelete,
  handleRename,
  handleList,
  handleLsub,
  handleSubscribe,
  handleUnsubscribe,
  handleStatus,
  handleClose,
  handleNamespace,
} from "../handlers/mailbox.js";
import {
  handleFetch,
  handleStore,
  handleCopy,
  handleMove,
  handleExpunge,
  handleSearch,
  handleUid,
  handleAppend,
  handleIdle,
} from "../handlers/messages.js";

// ─── Default Configuration ──────────────────────────────────────────────────

const DEFAULT_CONFIG: ImapServerConfig = {
  host: "0.0.0.0",
  port: 143,
  tlsPort: 993,
  hostname: "mail.emailed.dev",
  maxConnections: 1000,
  connectionTimeout: 1_800_000, // 30 minutes per RFC 9051 recommendation
  socketTimeout: 300_000, // 5 minutes idle
  maxFailedAuth: 3,
  maxLineLength: 65_536, // 64 KB
  maxLiteralSize: 25 * 1024 * 1024, // 25 MB
};

// ─── IMAP Server ────────────────────────────────────────────────────────────

/**
 * Main IMAP server class.
 * Manages TCP connections, session state, command routing, and TLS upgrades.
 * Follows the same EventEmitter + lifecycle pattern as the SMTP server.
 */
export class ImapServer extends EventEmitter<ImapServerEvents> {
  private readonly config: ImapServerConfig;
  private plaintextServer: net.Server | null = null;
  private tlsServer: tls.TLSServer | null = null;
  private readonly sessions = new Map<string, ImapSession>();
  private readonly socketMap = new Map<string, net.Socket | tls.TLSSocket>();
  private readonly inputBuffers = new Map<string, string>();
  private readonly literalState = new Map<string, LiteralAccumulator>();
  private readonly idleCallbacks = new Map<string, () => void>();
  private startedAt: Date | null = null;

  constructor(config?: Partial<ImapServerConfig>) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────

  /**
   * Start the IMAP server on both plaintext (143) and TLS (993) ports.
   * If no TLS config is provided, only the plaintext server starts.
   */
  async start(): Promise<void> {
    const promises: Promise<void>[] = [];

    // Start plaintext server (IMAP + STARTTLS)
    promises.push(this.startPlaintext());

    // Start implicit TLS server (IMAPS) if TLS is configured
    if (this.config.tls) {
      promises.push(this.startTls());
    }

    await Promise.all(promises);
    this.startedAt = new Date();
  }

  /**
   * Gracefully stop all servers and close all connections.
   */
  async stop(): Promise<void> {
    // Notify all connected clients
    for (const [sessionId, socket] of this.socketMap) {
      try {
        socket.write(formatUntagged("BYE Server shutting down\r\n"));
        socket.destroy();
      } catch {
        // Socket may already be closed
      }
      this.cleanupSession(sessionId);
    }

    const closePromises: Promise<void>[] = [];

    const plaintext = this.plaintextServer;
    if (plaintext) {
      closePromises.push(
        new Promise<void>((resolve) => {
          plaintext.close(() => {
            this.plaintextServer = null;
            resolve();
          });
        }),
      );
    }

    const tlsServer = this.tlsServer;
    if (tlsServer) {
      closePromises.push(
        new Promise<void>((resolve) => {
          tlsServer.close(() => {
            this.tlsServer = null;
            resolve();
          });
        }),
      );
    }

    await Promise.all(closePromises);
  }

  /**
   * Get current server status metrics.
   */
  get status() {
    return {
      uptime: this.startedAt ? Date.now() - this.startedAt.getTime() : 0,
      connections: this.sessions.size,
      startedAt: this.startedAt,
    };
  }

  // ─── Server Startup ─────────────────────────────────────────────────────

  private startPlaintext(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.plaintextServer = net.createServer((socket) => {
        this.handleConnection(socket, false);
      });

      this.plaintextServer.maxConnections = this.config.maxConnections;

      this.plaintextServer.on("error", (error) => {
        this.emit("error", error);
        reject(error);
      });

      this.plaintextServer.listen(this.config.port, this.config.host, () => {
        this.emit("listening", { host: this.config.host, port: this.config.port });
        resolve();
      });
    });
  }

  private startTls(): Promise<void> {
    if (!this.config.tls) {
      return Promise.resolve();
    }

    const tlsConfig = this.config.tls;
    return new Promise((resolve, reject) => {
      const tlsOptions: tls.TlsOptions = {
        key: tlsConfig.key,
        cert: tlsConfig.cert,
        ca: tlsConfig.ca,
        minVersion: tlsConfig.minVersion,
        ciphers: tlsConfig.ciphers,
      };

      this.tlsServer = tls.createServer(tlsOptions, (socket) => {
        this.handleConnection(socket, true);
      });

      this.tlsServer.maxConnections = this.config.maxConnections;

      this.tlsServer.on("error", (error) => {
        this.emit("error", error);
        reject(error);
      });

      this.tlsServer.listen(this.config.tlsPort, this.config.host, () => {
        this.emit("listening", { host: this.config.host, port: this.config.tlsPort });
        resolve();
      });
    });
  }

  // ─── Connection Handling ────────────────────────────────────────────────

  /**
   * Handle a new incoming client connection.
   * Creates a session, sends the greeting, and sets up data/event handlers.
   */
  private handleConnection(socket: net.Socket | tls.TLSSocket, isTls: boolean): void {
    if (this.sessions.size >= this.config.maxConnections) {
      socket.write(formatUntagged("BYE Too many connections"));
      socket.destroy();
      return;
    }

    const sessionId = crypto.randomUUID();
    const remoteAddress = socket.remoteAddress ?? "unknown";
    const remotePort = socket.remotePort ?? 0;

    const session: ImapSession = {
      id: sessionId,
      state: "not_authenticated",
      remoteAddress,
      remotePort,
      user: null,
      selectedMailbox: null,
      capabilities: [...DEFAULT_CAPABILITIES],
      tls: isTls,
      idling: false,
      startedAt: new Date(),
      failedAuthAttempts: 0,
      enabledExtensions: new Set(),
    };

    // If TLS is active, remove STARTTLS from capabilities
    if (isTls) {
      session.capabilities = session.capabilities.filter((c) => c !== "STARTTLS");
    }

    this.sessions.set(sessionId, session);
    this.socketMap.set(sessionId, socket);
    this.inputBuffers.set(sessionId, "");

    this.emit("connection", session);

    // Send IMAP greeting per RFC 9051 Section 7.1
    const greeting = formatUntagged(
      `OK [${buildCapabilityString()}] ${this.config.hostname} Emailed IMAP Server Ready`,
    );
    socket.write(greeting);

    // Set up socket timeout
    socket.setTimeout(this.config.connectionTimeout);

    // Handle incoming data with line buffering
    socket.on("data", (chunk: Buffer) => {
      this.handleData(sessionId, chunk);
    });

    socket.on("timeout", () => {
      const timeoutSession = this.sessions.get(sessionId);
      if (timeoutSession) {
        this.writeToClient(sessionId, formatUntagged("BYE Idle timeout, closing connection"));
      }
      socket.destroy();
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

  /**
   * Handle incoming data from a client socket.
   * Implements line buffering with CRLF termination and literal handling.
   */
  private handleData(sessionId: string, chunk: Buffer): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // If client is IDLE, any data from them means "DONE"
    if (session.idling) {
      const data = chunk.toString("utf-8").trim().toUpperCase();
      if (data === "DONE") {
        session.idling = false;
        const idleCallback = this.idleCallbacks.get(sessionId);
        if (idleCallback) {
          idleCallback();
          this.idleCallbacks.delete(sessionId);
        }
      }
      return;
    }

    // Check if we're accumulating a literal
    const literalAcc = this.literalState.get(sessionId);
    if (literalAcc) {
      this.handleLiteralData(sessionId, chunk, literalAcc);
      return;
    }

    let buffer = (this.inputBuffers.get(sessionId) ?? "") + chunk.toString("utf-8");

    // Process complete lines (CRLF-terminated)
    let lineEnd: number;
    while ((lineEnd = buffer.indexOf("\r\n")) !== -1) {
      const line = buffer.substring(0, lineEnd);
      buffer = buffer.substring(lineEnd + 2);

      // Check line length
      if (line.length > this.config.maxLineLength) {
        this.writeToClient(sessionId, formatUntagged("BAD Line too long"));
        continue;
      }

      // Check for literal marker {n} or {n+} at end of line
      const literal = detectLiteral(line);
      if (literal) {
        if (literal.count > this.config.maxLiteralSize) {
          this.writeToClient(sessionId, formatUntagged("BAD Literal too large"));
          continue;
        }

        // Start accumulating literal data
        this.literalState.set(sessionId, {
          commandPrefix: line.substring(0, line.lastIndexOf("{")),
          remaining: literal.count,
          data: "",
        });

        // Send continuation request (unless non-synchronizing literal)
        if (!literal.nonSync) {
          this.writeToClient(sessionId, formatContinuation("Ready for literal data"));
        }

        // Process any remaining buffer as literal data
        if (buffer.length > 0) {
          const bufferAsBytes = Buffer.from(buffer, "utf-8");
          const currentLiteral = this.literalState.get(sessionId);
          if (currentLiteral) {
            this.handleLiteralData(sessionId, bufferAsBytes, currentLiteral);
          }
          buffer = "";
        }
        continue;
      }

      // Process the complete command line
      this.processCommandLine(sessionId, line);
    }

    // Also handle bare LF (common with telnet clients)
    while ((lineEnd = buffer.indexOf("\n")) !== -1) {
      const line = buffer.substring(0, lineEnd).replace(/\r$/, "");
      buffer = buffer.substring(lineEnd + 1);
      this.processCommandLine(sessionId, line);
    }

    this.inputBuffers.set(sessionId, buffer);
  }

  /**
   * Handle literal data accumulation.
   * Literals in IMAP are {n}\r\n followed by exactly n octets of data.
   */
  private handleLiteralData(
    sessionId: string,
    chunk: Buffer,
    accumulator: LiteralAccumulator,
  ): void {
    const data = chunk.toString("utf-8");
    const needed = accumulator.remaining;

    if (Buffer.byteLength(data, "utf-8") >= needed) {
      // We have enough data — extract exactly `needed` bytes
      // Simple approach: accumulate and split
      const combined = accumulator.data + data;
      const literalBytes = Buffer.from(combined, "utf-8");

      // Extract the literal content
      const literalContent = literalBytes.subarray(0, needed).toString("utf-8");
      const rest = literalBytes.subarray(needed).toString("utf-8");

      // Reconstruct the full command line
      const fullCommand = accumulator.commandPrefix + literalContent;

      // Remove the literal state
      this.literalState.delete(sessionId);

      // Check if the rest contains another line
      const restTrimmed = rest.replace(/^\r?\n/, "");

      // The rest might contain more of the command or the CRLF termination
      if (restTrimmed.includes("\r\n")) {
        // There's a complete continuation — process it as a new command
        const lineEnd = restTrimmed.indexOf("\r\n");
        const continuation = restTrimmed.substring(0, lineEnd);
        const remaining = restTrimmed.substring(lineEnd + 2);

        this.processCommandLine(sessionId, fullCommand + " " + continuation);
        this.inputBuffers.set(sessionId, remaining);
      } else {
        // Process the command as-is
        this.processCommandLine(sessionId, fullCommand);
        this.inputBuffers.set(sessionId, restTrimmed);
      }
    } else {
      // Need more data
      accumulator.data += data;
      accumulator.remaining -= Buffer.byteLength(data, "utf-8");
    }
  }

  // ─── Command Processing ─────────────────────────────────────────────────

  /**
   * Process a complete IMAP command line.
   * Parses the command and routes it to the appropriate handler.
   */
  private processCommandLine(sessionId: string, line: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    if (!line.trim()) return;

    const command = parseCommand(line);

    // Check if command is valid for current state
    if (!isCommandValidForState(command.name, session.state)) {
      if (command.name === "UNKNOWN") {
        this.writeToClient(
          sessionId,
          formatTagged(command.tag, "BAD", "Unknown command"),
        );
      } else {
        this.writeToClient(
          sessionId,
          formatTagged(command.tag, "BAD", `Command ${command.name} not valid in current state`),
        );
      }
      return;
    }

    this.routeCommand(sessionId, session, command);
  }

  /**
   * Route a parsed command to its handler.
   */
  private routeCommand(
    sessionId: string,
    session: ImapSession,
    command: ImapCommand,
  ): void {
    const writer = (data: string) => this.writeToClient(sessionId, data);

    switch (command.name) {
      // ─── Any State Commands ───────────────────────────────────────
      case "CAPABILITY":
        this.handleCapability(session, command, writer);
        break;

      case "NOOP":
        writer(formatTagged(command.tag, "OK", "NOOP completed"));
        break;

      case "LOGOUT":
        this.handleLogout(sessionId, session, command, writer);
        break;

      case "ID":
        this.handleId(command, writer);
        break;

      // ─── Not Authenticated Commands ───────────────────────────────
      case "STARTTLS":
        this.handleStartTls(sessionId, session, command, writer);
        break;

      case "LOGIN":
        handleLogin(session, command, writer);
        break;

      case "AUTHENTICATE":
        handleAuthenticate(session, command, writer, (text) =>
          this.writeToClient(sessionId, formatContinuation(text)),
        );
        break;

      // ─── Authenticated Commands ───────────────────────────────────
      case "SELECT":
        handleSelect(session, command, writer);
        break;

      case "EXAMINE":
        handleExamine(session, command, writer);
        break;

      case "CREATE":
        handleCreate(session, command, writer);
        break;

      case "DELETE":
        handleDelete(session, command, writer);
        break;

      case "RENAME":
        handleRename(session, command, writer);
        break;

      case "LIST":
        handleList(session, command, writer);
        break;

      case "LSUB":
        handleLsub(session, command, writer);
        break;

      case "SUBSCRIBE":
        handleSubscribe(session, command, writer);
        break;

      case "UNSUBSCRIBE":
        handleUnsubscribe(session, command, writer);
        break;

      case "NAMESPACE":
        handleNamespace(session, command, writer);
        break;

      case "STATUS":
        handleStatus(session, command, writer);
        break;

      case "APPEND":
        handleAppend(session, command, writer);
        break;

      case "ENABLE":
        this.handleEnable(session, command, writer);
        break;

      // ─── Selected State Commands ──────────────────────────────────
      case "CLOSE":
        handleClose(session, command, writer);
        break;

      case "UNSELECT":
        this.handleUnselect(session, command, writer);
        break;

      case "EXPUNGE":
        handleExpunge(session, command, writer);
        break;

      case "SEARCH":
        handleSearch(session, command, writer);
        break;

      case "FETCH":
        handleFetch(session, command, writer);
        break;

      case "STORE":
        handleStore(session, command, writer);
        break;

      case "COPY":
        handleCopy(session, command, writer);
        break;

      case "MOVE":
        handleMove(session, command, writer);
        break;

      case "UID":
        handleUid(session, command, writer);
        break;

      case "IDLE":
        handleIdle(session, command, writer, (callback) => {
          this.idleCallbacks.set(sessionId, callback);
        });
        break;

      default:
        writer(formatTagged(command.tag, "BAD", "Unknown command"));
        break;
    }
  }

  // ─── Built-in Command Handlers ──────────────────────────────────────────

  /**
   * Handle CAPABILITY command per RFC 9051 Section 6.1.1.
   */
  private handleCapability(
    session: ImapSession,
    command: ImapCommand,
    writer: (data: string) => void,
  ): void {
    writer(formatUntagged(buildCapabilityString()));
    writer(formatTagged(command.tag, "OK", "CAPABILITY completed"));
  }

  /**
   * Handle LOGOUT command per RFC 9051 Section 6.1.3.
   */
  private handleLogout(
    sessionId: string,
    session: ImapSession,
    command: ImapCommand,
    writer: (data: string) => void,
  ): void {
    session.state = "logout";
    writer(formatUntagged("BYE Emailed IMAP server signing off"));
    writer(formatTagged(command.tag, "OK", "LOGOUT completed"));

    const socket = this.socketMap.get(sessionId);
    if (socket) {
      socket.end();
    }
  }

  /**
   * Handle ID command per RFC 2971.
   * Returns server identification without revealing sensitive info.
   */
  private handleId(
    command: ImapCommand,
    writer: (data: string) => void,
  ): void {
    writer(
      formatUntagged(
        'ID ("name" "Emailed" "vendor" "Emailed Platform" "support-url" "https://emailed.dev/support")',
      ),
    );
    writer(formatTagged(command.tag, "OK", "ID completed"));
  }

  /**
   * Handle STARTTLS command per RFC 9051 Section 6.2.1.
   * Upgrades the plaintext connection to TLS.
   */
  private handleStartTls(
    sessionId: string,
    session: ImapSession,
    command: ImapCommand,
    writer: (data: string) => void,
  ): void {
    if (session.tls) {
      writer(formatTagged(command.tag, "BAD", "TLS already active"));
      return;
    }

    if (!this.config.tls) {
      writer(formatTagged(command.tag, "NO", "TLS not configured"));
      return;
    }

    writer(formatTagged(command.tag, "OK", "Begin TLS negotiation"));

    const socket = this.socketMap.get(sessionId);
    if (!socket || socket instanceof tls.TLSSocket) return;

    const tlsOptions: tls.TlsOptions = {
      key: this.config.tls.key,
      cert: this.config.tls.cert,
      ca: this.config.tls.ca,
      minVersion: this.config.tls.minVersion,
      isServer: true,
    };

    const tlsSocket = new tls.TLSSocket(socket, tlsOptions);

    // Replace socket
    this.socketMap.set(sessionId, tlsSocket);
    session.tls = true;

    // Remove STARTTLS from capabilities, add AUTH options
    session.capabilities = session.capabilities.filter((c) => c !== "STARTTLS");

    // Reset input buffer
    this.inputBuffers.set(sessionId, "");

    // Re-attach data handlers
    tlsSocket.on("data", (chunk: Buffer) => {
      this.handleData(sessionId, chunk);
    });

    tlsSocket.on("close", () => {
      const closedSession = this.sessions.get(sessionId);
      if (closedSession) {
        this.emit("close", closedSession);
      }
      this.cleanupSession(sessionId);
    });

    tlsSocket.on("error", (error) => {
      this.emit("error", error, this.sessions.get(sessionId));
      this.cleanupSession(sessionId);
    });
  }

  /**
   * Handle ENABLE command per RFC 5161.
   * Enables requested extensions for the session.
   */
  private handleEnable(
    session: ImapSession,
    command: ImapCommand,
    writer: (data: string) => void,
  ): void {
    if (session.state === "not_authenticated") {
      writer(formatTagged(command.tag, "BAD", "Must authenticate first"));
      return;
    }

    const requested = command.args.trim().split(/\s+/).filter(Boolean);
    const enabled: string[] = [];

    for (const ext of requested) {
      // Only enable known/supported extensions
      if (ext.toUpperCase() === "IMAP4REV2" || ext.toUpperCase() === "UTF8=ACCEPT") {
        session.enabledExtensions.add(ext.toUpperCase());
        enabled.push(ext.toUpperCase());
      }
    }

    writer(formatUntagged(`ENABLED ${enabled.join(" ")}`));
    writer(formatTagged(command.tag, "OK", "ENABLE completed"));
  }

  /**
   * Handle UNSELECT command per RFC 3691.
   * Closes the selected mailbox without expunging.
   */
  private handleUnselect(
    session: ImapSession,
    command: ImapCommand,
    writer: (data: string) => void,
  ): void {
    session.selectedMailbox = null;
    session.state = "authenticated";
    writer(formatTagged(command.tag, "OK", "UNSELECT completed"));
  }

  // ─── I/O Helpers ────────────────────────────────────────────────────────

  /**
   * Write data to a client by session ID.
   */
  writeToClient(sessionId: string, data: string): void {
    const socket = this.socketMap.get(sessionId);
    if (socket && !socket.destroyed) {
      socket.write(data);
    }
  }

  /**
   * Clean up all resources associated with a session.
   */
  private cleanupSession(sessionId: string): void {
    this.sessions.delete(sessionId);
    this.socketMap.delete(sessionId);
    this.inputBuffers.delete(sessionId);
    this.literalState.delete(sessionId);
    this.idleCallbacks.delete(sessionId);
  }

  /**
   * Get a session by ID (for external use by handlers that need session lookup).
   */
  getSession(sessionId: string): ImapSession | undefined {
    return this.sessions.get(sessionId);
  }
}

// ─── Internal Types ───────────────────────────────────────────────────────

/**
 * State for accumulating literal data from the client.
 */
interface LiteralAccumulator {
  /** The command text before the literal marker. */
  commandPrefix: string;
  /** Number of bytes still needed. */
  remaining: number;
  /** Data accumulated so far. */
  data: string;
}
