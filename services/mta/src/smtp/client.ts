/**
 * SMTP Client for Outbound Delivery
 * Connects to remote SMTP servers, negotiates TLS, and sends messages.
 */

import * as net from "node:net";
import * as dns from "node:dns/promises";

/** RFC 5321 MX record shape. node:dns/promises doesn't re-export MxRecord. */
interface MxRecord {
  readonly priority: number;
  readonly exchange: string;
}
import { EventEmitter } from "node:events";
import type { SmtpClientConfig, Result } from "../types.js";
import { ok, err } from "../types.js";
import type { TlsManager } from "../tls/manager.js";

const DEFAULT_CLIENT_CONFIG: SmtpClientConfig = {
  host: "",
  port: 25,
  localHostname: "mail.alecrae.dev",
  connectTimeout: 30_000,
  socketTimeout: 60_000,
  greetingTimeout: 30_000,
  opportunisticTls: true,
  requireTls: false,
};

interface SmtpClientResponse {
  code: number;
  message: string;
  lines: string[];
}

export class SmtpClient extends EventEmitter {
  private readonly config: SmtpClientConfig;
  private readonly tlsManager: TlsManager | null;
  private socket: net.Socket | null = null;
  private responseBuffer = "";
  private tls = false;
  private extensions = new Map<string, string>();
  private destroyed = false;

  constructor(config?: Partial<SmtpClientConfig>, tlsManager?: TlsManager) {
    super();
    this.config = { ...DEFAULT_CLIENT_CONFIG, ...config };
    this.tlsManager = tlsManager ?? null;
  }

  /**
   * Resolve MX records for a domain and return them sorted by priority.
   */
  static async resolveMx(domain: string): Promise<MxRecord[]> {
    try {
      const records = await dns.resolveMx(domain);
      return records.sort((a, b) => a.priority - b.priority);
    } catch (error) {
      // If no MX records, fall back to A/AAAA per RFC 5321 5.1
      try {
        await dns.resolve4(domain);
        return [{ priority: 0, exchange: domain }];
      } catch {
        throw error;
      }
    }
  }

  /**
   * Send an email to a specific recipient via their MX servers.
   */
  async sendMail(
    from: string,
    to: string,
    rawMessage: string,
  ): Promise<Result<{ response: string; host: string }>> {
    const recipientDomain = to.split("@")[1];
    if (!recipientDomain) {
      return err(new Error(`Invalid recipient address: ${to}`));
    }

    let mxRecords: MxRecord[];
    try {
      mxRecords = await SmtpClient.resolveMx(recipientDomain);
    } catch (error) {
      return err(new Error(`Failed to resolve MX for ${recipientDomain}: ${error}`));
    }

    // Try each MX in priority order
    for (const mx of mxRecords) {
      const result = await this.attemptDelivery(mx.exchange, from, to, rawMessage);
      if (result.ok) {
        return result;
      }
      // If it's a permanent failure (5xx), don't try next MX
      if (result.error.message.includes("5")) {
        return result;
      }
      // Transient failure — try next MX
    }

    return err(new Error(`All MX servers for ${recipientDomain} failed`));
  }

  /**
   * Attempt delivery to a specific SMTP host.
   */
  async attemptDelivery(
    host: string,
    from: string,
    to: string,
    rawMessage: string,
  ): Promise<Result<{ response: string; host: string }>> {
    try {
      // Connect
      await this.connect(host, this.config.port);

      // Read greeting
      const greeting = await this.readResponse();
      if (greeting.code !== 220) {
        await this.quit();
        return err(new Error(`Unexpected greeting from ${host}: ${greeting.code} ${greeting.message}`));
      }

      // EHLO
      const ehloResult = await this.ehlo();
      if (!ehloResult.ok) {
        // Fall back to HELO
        const heloResult = await this.helo();
        if (!heloResult.ok) {
          await this.quit();
          return err(new Error(`HELO failed at ${host}: ${heloResult.error.message}`));
        }
      }

      // STARTTLS if available and desired
      if (
        (this.config.opportunisticTls || this.config.requireTls) &&
        !this.tls &&
        this.extensions.has("STARTTLS")
      ) {
        const tlsResult = await this.startTls(host);
        if (tlsResult.ok) {
          // Re-EHLO after STARTTLS
          await this.ehlo();
        } else if (this.config.requireTls) {
          await this.quit();
          return err(new Error(`STARTTLS required but failed at ${host}: ${tlsResult.error.message}`));
        }
        // If opportunistic and failed, continue without TLS
      } else if (this.config.requireTls && !this.tls) {
        await this.quit();
        return err(new Error(`TLS required but ${host} does not support STARTTLS`));
      }

      // MAIL FROM
      const mailResult = await this.mailFrom(from);
      if (!mailResult.ok) {
        await this.quit();
        return err(new Error(`MAIL FROM rejected by ${host}: ${mailResult.error.message}`));
      }

      // RCPT TO
      const rcptResult = await this.rcptTo(to);
      if (!rcptResult.ok) {
        await this.quit();
        return err(new Error(`RCPT TO rejected by ${host}: ${rcptResult.error.message}`));
      }

      // DATA
      const dataResult = await this.data(rawMessage);
      if (!dataResult.ok) {
        await this.quit();
        return err(new Error(`DATA rejected by ${host}: ${dataResult.error.message}`));
      }

      // QUIT
      await this.quit();

      return ok({ response: dataResult.value.message, host });
    } catch (error) {
      this.destroy();
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Establish a TCP connection to the remote SMTP server.
   */
  private connect(host: string, port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Connection to ${host}:${port} timed out`));
        this.destroy();
      }, this.config.connectTimeout);

      this.socket = net.createConnection({ host, port }, () => {
        clearTimeout(timeout);
        if (this.socket) {
          this.socket.setTimeout(this.config.socketTimeout);
        }
        resolve();
      });

      this.socket.on("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });

      this.socket.on("timeout", () => {
        reject(new Error(`Socket timeout for ${host}:${port}`));
        this.destroy();
      });
    });
  }

  /**
   * Send EHLO and parse extensions.
   */
  private async ehlo(): Promise<Result<SmtpClientResponse>> {
    const response = await this.command(`EHLO ${this.config.localHostname}`);
    if (response.code !== 250) {
      return err(new Error(`${response.code} ${response.message}`));
    }

    // Parse extensions from multi-line response
    this.extensions.clear();
    for (let i = 1; i < response.lines.length; i++) {
      const line = response.lines[i];
      if (line === undefined) continue;
      const spaceIndex = line.indexOf(" ");
      if (spaceIndex > 0) {
        this.extensions.set(
          line.substring(0, spaceIndex).toUpperCase(),
          line.substring(spaceIndex + 1),
        );
      } else {
        this.extensions.set(line.toUpperCase(), "");
      }
    }

    return ok(response);
  }

  /**
   * Send HELO (fallback for servers not supporting EHLO).
   */
  private async helo(): Promise<Result<SmtpClientResponse>> {
    const response = await this.command(`HELO ${this.config.localHostname}`);
    if (response.code !== 250) {
      return err(new Error(`${response.code} ${response.message}`));
    }
    return ok(response);
  }

  /**
   * Negotiate STARTTLS.
   */
  private async startTls(host: string): Promise<Result<void>> {
    const response = await this.command("STARTTLS");
    if (response.code !== 220) {
      return err(new Error(`${response.code} ${response.message}`));
    }

    if (!this.socket || !this.tlsManager) {
      return err(new Error("No socket or TLS manager available"));
    }

    try {
      const rejectUnauthorized = this.config.tlsOptions?.rejectUnauthorized;
      const tlsSocket = await this.tlsManager.upgradeClientToTls(this.socket, host, {
        ...(rejectUnauthorized !== undefined ? { rejectUnauthorized } : {}),
      });
      this.socket = tlsSocket as unknown as net.Socket;
      this.tls = true;
      this.responseBuffer = "";
      return ok(undefined);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Send MAIL FROM command.
   */
  private async mailFrom(address: string): Promise<Result<SmtpClientResponse>> {
    const response = await this.command(`MAIL FROM:<${address}>`);
    if (response.code !== 250) {
      return err(new Error(`${response.code} ${response.message}`));
    }
    return ok(response);
  }

  /**
   * Send RCPT TO command.
   */
  private async rcptTo(address: string): Promise<Result<SmtpClientResponse>> {
    const response = await this.command(`RCPT TO:<${address}>`);
    if (response.code !== 250 && response.code !== 251) {
      return err(new Error(`${response.code} ${response.message}`));
    }
    return ok(response);
  }

  /**
   * Send DATA command and message body.
   */
  private async data(rawMessage: string): Promise<Result<SmtpClientResponse>> {
    const response = await this.command("DATA");
    if (response.code !== 354) {
      return err(new Error(`${response.code} ${response.message}`));
    }

    // Dot-stuff the message per RFC 5321 4.5.2
    const stuffed = rawMessage.replace(/^\./gm, "..");

    // Send the message data followed by <CRLF>.<CRLF>
    await this.write(stuffed);
    if (!stuffed.endsWith("\r\n")) {
      await this.write("\r\n");
    }
    await this.write(".\r\n");

    const dataResponse = await this.readResponse();
    if (dataResponse.code !== 250) {
      return err(new Error(`${dataResponse.code} ${dataResponse.message}`));
    }
    return ok(dataResponse);
  }

  /**
   * Send QUIT command.
   */
  private async quit(): Promise<void> {
    try {
      if (this.socket && !this.destroyed) {
        await this.command("QUIT");
      }
    } catch {
      // Ignore errors during quit
    } finally {
      this.destroy();
    }
  }

  /**
   * Send a command and read the response.
   */
  private async command(cmd: string): Promise<SmtpClientResponse> {
    await this.write(`${cmd}\r\n`);
    return this.readResponse();
  }

  /**
   * Write data to the socket.
   */
  private write(data: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.socket || this.destroyed) {
        reject(new Error("Socket not connected"));
        return;
      }
      this.socket.write(data, "utf-8", (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  /**
   * Read a complete SMTP response (possibly multi-line).
   */
  private readResponse(): Promise<SmtpClientResponse> {
    return new Promise((resolve, reject) => {
      if (!this.socket || this.destroyed) {
        reject(new Error("Socket not connected"));
        return;
      }

      const timeout = setTimeout(() => {
        reject(new Error("Response timeout"));
        this.destroy();
      }, this.config.socketTimeout);

      const tryParse = (): boolean => {
        const result = this.parseResponseBuffer();
        if (result) {
          clearTimeout(timeout);
          this.socket?.removeListener("data", onData);
          resolve(result);
          return true;
        }
        return false;
      };

      const onData = (chunk: Buffer) => {
        this.responseBuffer += chunk.toString("utf-8");
        tryParse();
      };

      // Check if we already have a complete response buffered
      if (tryParse()) return;

      this.socket.on("data", onData);

      this.socket.once("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });

      this.socket.once("close", () => {
        clearTimeout(timeout);
        reject(new Error("Connection closed"));
      });
    });
  }

  /**
   * Parse the response buffer for a complete SMTP response.
   * Returns null if the response is not yet complete.
   */
  private parseResponseBuffer(): SmtpClientResponse | null {
    const lines: string[] = [];
    let remaining = this.responseBuffer;

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
        // Final line of response
        this.responseBuffer = remaining;
        return {
          code,
          message: lines.join("\n"),
          lines,
        };
      }
      // separator === "-" means continuation
    }
  }

  /**
   * Destroy the connection.
   */
  private destroy(): void {
    this.destroyed = true;
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
  }
}
