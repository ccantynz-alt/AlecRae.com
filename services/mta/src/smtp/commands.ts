/**
 * SMTP Command Parser and Response Builder
 * Per RFC 5321 - Simple Mail Transfer Protocol
 */

import type { SmtpParsedCommand, SmtpCommand, SmtpResponse, SmtpState } from "../types.js";
import { SMTP_COMMANDS } from "../types.js";

const COMMAND_REGEX = /^([A-Z]{4})(?:\s+(.*))?$/i;
const MAIL_FROM_REGEX = /^FROM:\s*<([^>]*)>(.*)$/i;
const RCPT_TO_REGEX = /^TO:\s*<([^>]*)>(.*)$/i;
const MAX_LINE_LENGTH = 512; // RFC 5321 4.5.3.1.4

/**
 * Parse a raw SMTP command line into a structured command object.
 */
export function parseCommand(line: string): SmtpParsedCommand {
  const trimmed = line.replace(/\r?\n$/, "");

  if (trimmed.length > MAX_LINE_LENGTH) {
    return { command: "UNKNOWN", argument: "", rawLine: trimmed };
  }

  // Handle EHLO/HELO (4-char match)
  const match = COMMAND_REGEX.exec(trimmed);
  if (!match) {
    // Try longer commands like STARTTLS
    const starttlsMatch = /^STARTTLS\s*$/i.exec(trimmed);
    if (starttlsMatch) {
      return { command: "STARTTLS", argument: "", rawLine: trimmed };
    }
    return { command: "UNKNOWN", argument: "", rawLine: trimmed };
  }

  const rawCmd = (match[1] ?? "").toUpperCase();
  const argument = match[2]?.trim() ?? "";

  // Validate this is a known command
  if (rawCmd === "STAR" && /^STARTTLS\s*$/i.test(trimmed)) {
    return { command: "STARTTLS", argument: "", rawLine: trimmed };
  }

  const knownCommand = SMTP_COMMANDS.find((c) => c === rawCmd);

  if (!knownCommand) {
    return { command: "UNKNOWN", argument, rawLine: trimmed };
  }

  return { command: knownCommand, argument, rawLine: trimmed };
}

/**
 * Parse the MAIL FROM argument to extract address and parameters.
 */
export function parseMailFrom(argument: string): { address: string; params: Record<string, string> } | null {
  const match = MAIL_FROM_REGEX.exec(argument);
  if (!match) return null;

  const address = match[1] ?? "";
  const paramsStr = match[2]?.trim() ?? "";
  const params = parseEsmtpParams(paramsStr);

  return { address, params };
}

/**
 * Parse the RCPT TO argument to extract address and parameters.
 */
export function parseRcptTo(argument: string): { address: string; params: Record<string, string> } | null {
  const match = RCPT_TO_REGEX.exec(argument);
  if (!match) return null;

  const address = match[1] ?? "";
  const paramsStr = match[2]?.trim() ?? "";
  const params = parseEsmtpParams(paramsStr);

  return { address, params };
}

/**
 * Parse ESMTP parameters (key=value pairs after the address).
 */
function parseEsmtpParams(paramsStr: string): Record<string, string> {
  const params: Record<string, string> = {};
  if (!paramsStr) return params;

  const parts = paramsStr.split(/\s+/);
  for (const part of parts) {
    const eqIndex = part.indexOf("=");
    if (eqIndex > 0) {
      const key = part.substring(0, eqIndex).toUpperCase();
      const value = part.substring(eqIndex + 1);
      params[key] = value;
    } else if (part) {
      params[part.toUpperCase()] = "";
    }
  }

  return params;
}

/**
 * Format an SMTP response for transmission.
 */
export function formatResponse(response: SmtpResponse): string {
  const messages = Array.isArray(response.message) ? response.message : [response.message];

  if (messages.length === 1) {
    const enhanced = response.enhanced ? `${response.enhanced} ` : "";
    return `${response.code} ${enhanced}${messages[0]}\r\n`;
  }

  // Multi-line response
  const lines: string[] = [];
  for (let i = 0; i < messages.length; i++) {
    const isLast = i === messages.length - 1;
    const separator = isLast ? " " : "-";
    const enhanced = response.enhanced ? `${response.enhanced} ` : "";
    lines.push(`${response.code}${separator}${enhanced}${messages[i]}`);
  }

  return lines.join("\r\n") + "\r\n";
}

/**
 * Build standard SMTP response objects.
 */
export const SmtpResponses = {
  greeting(hostname: string, banner?: string): SmtpResponse {
    const msg = banner ?? `${hostname} ESMTP AlecRae MTA Ready`;
    return { code: 220, message: msg, isMultiline: false };
  },

  ehlo(hostname: string, extensions: string[]): SmtpResponse {
    return {
      code: 250,
      message: [`${hostname} Hello`, ...extensions],
      isMultiline: true,
    };
  },

  helo(hostname: string): SmtpResponse {
    return { code: 250, message: `${hostname} Hello`, isMultiline: false };
  },

  ok(message = "OK"): SmtpResponse {
    return { code: 250, enhanced: "2.1.0", message, isMultiline: false };
  },

  mailOk(): SmtpResponse {
    return { code: 250, enhanced: "2.1.0", message: "Sender OK", isMultiline: false };
  },

  rcptOk(): SmtpResponse {
    return { code: 250, enhanced: "2.1.5", message: "Recipient OK", isMultiline: false };
  },

  dataStart(): SmtpResponse {
    return { code: 354, message: "Start mail input; end with <CRLF>.<CRLF>", isMultiline: false };
  },

  dataAccepted(messageId: string): SmtpResponse {
    return {
      code: 250,
      enhanced: "2.0.0",
      message: `Message ${messageId} accepted for delivery`,
      isMultiline: false,
    };
  },

  bye(): SmtpResponse {
    return { code: 221, enhanced: "2.0.0", message: "Bye", isMultiline: false };
  },

  startTlsReady(): SmtpResponse {
    return { code: 220, enhanced: "2.0.0", message: "Ready to start TLS", isMultiline: false };
  },

  syntaxError(detail?: string): SmtpResponse {
    const msg = detail ?? "Syntax error, command unrecognized";
    return { code: 500, enhanced: "5.5.2", message: msg, isMultiline: false };
  },

  parameterError(detail?: string): SmtpResponse {
    const msg = detail ?? "Syntax error in parameters or arguments";
    return { code: 501, enhanced: "5.5.4", message: msg, isMultiline: false };
  },

  commandNotImplemented(): SmtpResponse {
    return { code: 502, enhanced: "5.5.1", message: "Command not implemented", isMultiline: false };
  },

  badSequence(detail?: string): SmtpResponse {
    const msg = detail ?? "Bad sequence of commands";
    return { code: 503, enhanced: "5.5.1", message: msg, isMultiline: false };
  },

  mailboxUnavailable(detail?: string): SmtpResponse {
    const msg = detail ?? "Requested mail action not taken: mailbox unavailable";
    return { code: 550, enhanced: "5.1.1", message: msg, isMultiline: false };
  },

  tooManyRecipients(): SmtpResponse {
    return { code: 452, enhanced: "4.5.3", message: "Too many recipients", isMultiline: false };
  },

  messageTooLarge(): SmtpResponse {
    return { code: 552, enhanced: "5.3.4", message: "Message size exceeds fixed maximum message size", isMultiline: false };
  },

  authRequired(): SmtpResponse {
    return { code: 530, enhanced: "5.7.1", message: "Authentication required", isMultiline: false };
  },

  tlsRequired(): SmtpResponse {
    return { code: 530, enhanced: "5.7.0", message: "Must issue a STARTTLS command first", isMultiline: false };
  },

  serviceUnavailable(): SmtpResponse {
    return { code: 421, enhanced: "4.7.0", message: "Service not available, closing transmission channel", isMultiline: false };
  },

  temporaryFailure(detail?: string): SmtpResponse {
    const msg = detail ?? "Requested action not taken: try again later";
    return { code: 451, enhanced: "4.3.0", message: msg, isMultiline: false };
  },

  reset(): SmtpResponse {
    return { code: 250, enhanced: "2.0.0", message: "Reset OK", isMultiline: false };
  },

  noop(): SmtpResponse {
    return { code: 250, enhanced: "2.0.0", message: "OK", isMultiline: false };
  },
} as const;

/**
 * Determine which SMTP commands are valid for a given session state.
 */
export function validCommandsForState(state: SmtpState): ReadonlySet<SmtpCommand | "UNKNOWN"> {
  const always: SmtpCommand[] = ["NOOP", "QUIT", "RSET", "HELP"];

  switch (state) {
    case "GREETING":
      return new Set([...always, "EHLO", "HELO"]);
    case "READY":
      return new Set([...always, "EHLO", "HELO", "MAIL", "STARTTLS", "AUTH", "VRFY"]);
    case "MAIL_FROM":
      return new Set([...always, "RCPT"]);
    case "RCPT_TO":
      return new Set([...always, "RCPT", "DATA"]);
    case "DATA":
    case "DATA_RECEIVING":
      // During DATA, we don't parse commands — raw data flows in
      return new Set(always);
    case "QUIT":
    case "CLOSED":
      return new Set(["QUIT"]);
  }
}

/**
 * Check if a command is valid for the current session state.
 */
export function isCommandValidForState(command: SmtpCommand | "UNKNOWN", state: SmtpState): boolean {
  if (command === "UNKNOWN") return false;
  return validCommandsForState(state).has(command);
}
