/**
 * IMAP Command Parser and Response Formatter
 * Per RFC 9051 (IMAP4rev2) and RFC 3501 (IMAP4rev1).
 *
 * IMAP commands have the format: tag SP command [SP arguments] CRLF
 * Responses are: tagged ("tag OK ..."), untagged ("* ..."), or continuation ("+ ...").
 */

import type {
  ImapCommand,
  ImapCommandName,
  ImapResponseStatus,
  ImapFetchItem,
  ImapBodySection,
  ImapEnvelope,
  ImapAddress,
  ImapBodyStructure,
  ImapState,
  StoreOperation,
  StoreAction,
} from "../types.js";
import { IMAP_COMMANDS, DEFAULT_CAPABILITIES } from "../types.js";

// ─── Command Parsing ────────────────────────────────────────────────────────

/**
 * Maximum accepted command line length per RFC 9051 Section 4.
 * Does not include the literal data that follows a {n} marker.
 */
const MAX_COMMAND_LINE = 8192;

/**
 * Regex to match the basic IMAP command structure: tag SP command [SP args].
 * Tags can be any alphanumeric string (no spaces, no "*", no "+").
 */
const COMMAND_REGEX = /^([A-Za-z0-9.]+)\s+([A-Za-z]+)(?:\s+(.*))?$/;

/**
 * Parse a raw IMAP command line into a structured ImapCommand.
 *
 * @param line - The raw line from the client (CRLF already stripped).
 * @returns Parsed command with tag, name, and arguments.
 */
export function parseCommand(line: string): ImapCommand {
  const trimmed = line.replace(/\r?\n$/, "");

  if (trimmed.length > MAX_COMMAND_LINE) {
    return { tag: "*", name: "UNKNOWN", args: "", rawLine: trimmed };
  }

  const match = COMMAND_REGEX.exec(trimmed);
  if (!match) {
    return { tag: "*", name: "UNKNOWN", args: "", rawLine: trimmed };
  }

  const tag = match[1] ?? "*";
  const rawCmd = (match[2] ?? "").toUpperCase();
  const args = match[3]?.trim() ?? "";

  // Validate against known commands
  const knownCommand = IMAP_COMMANDS.find((c) => c === rawCmd) as ImapCommandName | undefined;

  return {
    tag,
    name: knownCommand ?? "UNKNOWN",
    args,
    rawLine: trimmed,
  };
}

/**
 * Parse a sequence set string (e.g., "1:*", "1,3,5:8", "4").
 * Returns an array of [start, end] ranges. "*" is represented as Infinity.
 *
 * @param input - The sequence set string.
 * @returns Array of [start, end] inclusive ranges.
 */
export function parseSequenceSet(input: string): [number, number][] {
  const ranges: [number, number][] = [];
  const parts = input.split(",");

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    if (trimmed.includes(":")) {
      const [startStr, endStr] = trimmed.split(":");
      if (startStr === undefined || endStr === undefined) continue;
      const start = startStr === "*" ? Infinity : parseInt(startStr, 10);
      const end = endStr === "*" ? Infinity : parseInt(endStr, 10);
      if (Number.isNaN(start) || Number.isNaN(end)) continue;
      ranges.push([Math.min(start, end), Math.max(start, end)]);
    } else {
      const num = trimmed === "*" ? Infinity : parseInt(trimmed, 10);
      if (Number.isNaN(num)) continue;
      ranges.push([num, num]);
    }
  }

  return ranges;
}

/**
 * Check if a number is within any range in a sequence set.
 */
export function isInSequenceSet(num: number, ranges: [number, number][]): boolean {
  return ranges.some(([start, end]) => num >= start && num <= end);
}

/**
 * Parse a parenthesized list from IMAP arguments.
 * E.g., "(\\Seen \\Flagged)" -> ["\\Seen", "\\Flagged"]
 *
 * @param input - String starting with "(" and containing a closing ")".
 * @returns Object with the parsed items and the remaining string after the list.
 */
export function parseParenList(input: string): { items: string[]; rest: string } {
  const trimmed = input.trim();
  if (!trimmed.startsWith("(")) {
    return { items: [], rest: trimmed };
  }

  const closeIndex = trimmed.indexOf(")");
  if (closeIndex === -1) {
    return { items: [], rest: trimmed };
  }

  const inner = trimmed.substring(1, closeIndex).trim();
  const rest = trimmed.substring(closeIndex + 1).trim();
  const items = inner.length > 0 ? inner.split(/\s+/) : [];

  return { items, rest };
}

/**
 * Parse a quoted string from IMAP arguments.
 * Returns the unquoted content and the remaining string.
 *
 * @param input - String starting with a double-quote character.
 * @returns Parsed string value and rest of input, or null if not a valid quoted string.
 */
export function parseQuotedString(input: string): { value: string; rest: string } | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith('"')) return null;

  let escaped = false;
  let i = 1;
  let value = "";

  while (i < trimmed.length) {
    const ch = trimmed[i];
    if (ch === undefined) break;
    if (escaped) {
      value += ch;
      escaped = false;
    } else if (ch === "\\") {
      escaped = true;
    } else if (ch === '"') {
      const rest = trimmed.substring(i + 1).trim();
      return { value, rest };
    } else {
      value += ch;
    }
    i++;
  }

  // Unterminated quote — return what we have
  return { value, rest: "" };
}

/**
 * Parse the next atom (unquoted, non-parenthesized token) from IMAP arguments.
 *
 * @param input - The input string.
 * @returns The atom value and remaining string.
 */
export function parseAtom(input: string): { value: string; rest: string } {
  const trimmed = input.trim();
  const match = /^([^\s()[\]"{}]+)(.*)$/.exec(trimmed);
  if (!match) {
    return { value: "", rest: trimmed };
  }
  return { value: match[1] ?? "", rest: (match[2] ?? "").trim() };
}

/**
 * Parse the next argument (atom, quoted string, or parenthesized list) from input.
 * This is a generic argument parser used by command handlers.
 *
 * @param input - The remaining argument string.
 * @returns Parsed argument and rest of input.
 */
export function parseNextArgument(input: string): { value: string | string[]; rest: string } {
  const trimmed = input.trim();

  if (trimmed.startsWith("(")) {
    const { items, rest } = parseParenList(trimmed);
    return { value: items, rest };
  }

  if (trimmed.startsWith('"')) {
    const quoted = parseQuotedString(trimmed);
    if (quoted) {
      return { value: quoted.value, rest: quoted.rest };
    }
  }

  const { value, rest } = parseAtom(trimmed);
  return { value, rest };
}

/**
 * Detect if input contains a literal marker ({n} or {n+} at end of line).
 * Returns the literal byte count if found, or null if not.
 *
 * @param line - The command line to check.
 * @returns The byte count of the literal, whether it's a non-synchronizing literal (+), or null.
 */
export function detectLiteral(line: string): { count: number; nonSync: boolean } | null {
  const match = /\{(\d+)(\+)?\}\s*$/.exec(line);
  if (!match) return null;

  const count = parseInt(match[1] ?? "0", 10);
  const nonSync = match[2] === "+";
  return { count, nonSync };
}

/**
 * Parse FETCH item list from arguments.
 * Handles macros (ALL, FAST, FULL) and explicit item lists.
 *
 * @param args - The argument string after the sequence set.
 * @returns Parsed fetch items specification.
 */
export function parseFetchItems(args: string): ImapFetchItem {
  const items: ImapFetchItem = {
    flags: false,
    envelope: false,
    bodyStructure: false,
    internalDate: false,
    size: false,
    uid: false,
    bodySections: [],
    rfc822: false,
    rfc822Header: false,
    rfc822Text: false,
  };

  const trimmed = args.trim().toUpperCase();

  // Handle macros per RFC 9051 Section 6.4.5
  switch (trimmed) {
    case "ALL":
      items.flags = true;
      items.internalDate = true;
      items.size = true;
      items.envelope = true;
      return items;
    case "FAST":
      items.flags = true;
      items.internalDate = true;
      items.size = true;
      return items;
    case "FULL":
      items.flags = true;
      items.internalDate = true;
      items.size = true;
      items.envelope = true;
      items.bodyStructure = true;
      return items;
  }

  // Parse parenthesized list or single item
  const itemStr = trimmed.startsWith("(")
    ? trimmed.slice(1, trimmed.lastIndexOf(")"))
    : trimmed;

  // Tokenize, respecting brackets for BODY[...] and BODY.PEEK[...]
  const tokens = tokenizeFetchItems(itemStr);

  for (const token of tokens) {
    switch (token) {
      case "FLAGS":
        items.flags = true;
        break;
      case "ENVELOPE":
        items.envelope = true;
        break;
      case "BODYSTRUCTURE":
        items.bodyStructure = true;
        break;
      case "INTERNALDATE":
        items.internalDate = true;
        break;
      case "RFC822.SIZE":
        items.size = true;
        break;
      case "UID":
        items.uid = true;
        break;
      case "RFC822":
        items.rfc822 = true;
        break;
      case "RFC822.HEADER":
        items.rfc822Header = true;
        break;
      case "RFC822.TEXT":
        items.rfc822Text = true;
        break;
      default:
        // Handle BODY[...] and BODY.PEEK[...]
        if (token.startsWith("BODY.PEEK[") || token.startsWith("BODY[")) {
          const section = parseBodySection(token);
          if (section) {
            items.bodySections.push(section);
          }
        }
        break;
    }
  }

  return items;
}

/**
 * Tokenize FETCH item arguments, handling BODY[...] bracket syntax.
 */
function tokenizeFetchItems(input: string): string[] {
  const tokens: string[] = [];
  let i = 0;

  while (i < input.length) {
    // Skip whitespace
    while (i < input.length) {
      const c = input[i];
      if (c === undefined || !/\s/.test(c)) break;
      i++;
    }
    if (i >= input.length) break;

    let token = "";
    // Read until whitespace, but handle brackets
    while (i < input.length) {
      const ch = input[i];
      if (ch === undefined || /\s/.test(ch)) break;
      if (ch === "[") {
        // Read until matching "]"
        let depth = 1;
        token += ch;
        i++;
        while (i < input.length && depth > 0) {
          const inner = input[i];
          if (inner === undefined) break;
          if (inner === "[") depth++;
          if (inner === "]") depth--;
          token += inner;
          i++;
        }
        // Check for partial <start.count>
        if (i < input.length && input[i] === "<") {
          while (i < input.length && input[i] !== ">") {
            const p = input[i];
            if (p === undefined) break;
            token += p;
            i++;
          }
          if (i < input.length) {
            const close = input[i];
            if (close !== undefined) token += close;
            i++;
          }
        }
      } else {
        token += ch;
        i++;
      }
    }

    if (token) tokens.push(token);
  }

  return tokens;
}

/**
 * Parse a BODY[section] or BODY.PEEK[section] specifier.
 */
function parseBodySection(token: string): ImapBodySection | null {
  const peek = token.startsWith("BODY.PEEK[");
  const bracketStart = token.indexOf("[");
  const bracketEnd = token.indexOf("]");

  if (bracketStart === -1 || bracketEnd === -1) return null;

  const sectionStr = token.substring(bracketStart + 1, bracketEnd);
  const afterBracket = token.substring(bracketEnd + 1);

  // Parse partial specifier <start.count>
  let partialStart: number | undefined;
  let partialCount: number | undefined;
  const partialMatch = /^<(\d+)\.(\d+)>/.exec(afterBracket);
  if (partialMatch?.[1] !== undefined && partialMatch[2] !== undefined) {
    partialStart = parseInt(partialMatch[1], 10);
    partialCount = parseInt(partialMatch[2], 10);
  }

  // Parse section specifier
  let section = sectionStr;
  let headerFields: string[] | undefined;
  let headerFieldsNot = false;

  const headerFieldsMatch = /^(.*?)HEADER\.FIELDS\.NOT\s*\(([^)]*)\)$/i.exec(sectionStr);
  const headerFieldsMatch2 = /^(.*?)HEADER\.FIELDS\s*\(([^)]*)\)$/i.exec(sectionStr);

  if (headerFieldsMatch) {
    section = ((headerFieldsMatch[1] ?? "") + "HEADER.FIELDS.NOT").trim();
    headerFields = (headerFieldsMatch[2] ?? "").trim().split(/\s+/);
    headerFieldsNot = true;
  } else if (headerFieldsMatch2) {
    section = ((headerFieldsMatch2[1] ?? "") + "HEADER.FIELDS").trim();
    headerFields = (headerFieldsMatch2[2] ?? "").trim().split(/\s+/);
  }

  return {
    section: section || "",
    ...(headerFields !== undefined ? { headerFields } : {}),
    headerFieldsNot,
    ...(partialStart !== undefined ? { partialStart } : {}),
    ...(partialCount !== undefined ? { partialCount } : {}),
    peek,
  };
}

/**
 * Parse a STORE command's flags arguments.
 *
 * @param args - The argument string after the sequence set (e.g., "+FLAGS (\\Seen)").
 * @returns Parsed store operation.
 */
export function parseStoreArgs(args: string): StoreOperation | null {
  const trimmed = args.trim();

  // Match: [+|-]FLAGS[.SILENT] (flag-list)
  const match = /^([+-]?)FLAGS(\.SILENT)?\s+(.+)$/i.exec(trimmed);
  if (!match) return null;

  const prefix = match[1] ?? "";
  const silent = match[2] !== undefined;
  const flagsStr = (match[3] ?? "").trim();

  let action: StoreAction;
  if (prefix === "+") {
    action = "+FLAGS";
  } else if (prefix === "-") {
    action = "-FLAGS";
  } else {
    action = "FLAGS";
  }

  // Parse flags — could be a parenthesized list or a single flag
  let flags: string[];
  if (flagsStr.startsWith("(")) {
    const { items } = parseParenList(flagsStr);
    flags = items;
  } else {
    flags = flagsStr.split(/\s+/);
  }

  return { action, silent, flags };
}

// ─── Response Formatting ────────────────────────────────────────────────────

/**
 * Format a tagged IMAP response (sent after command completion).
 * Format: tag SP status [SP [code] text] CRLF
 *
 * @param tag - The command tag to correlate with.
 * @param status - Response status (OK, NO, BAD).
 * @param text - Human-readable response text.
 * @param code - Optional response code (e.g., "READ-WRITE", "UIDVALIDITY 123").
 */
export function formatTagged(
  tag: string,
  status: ImapResponseStatus,
  text: string,
  code?: string,
): string {
  const codeStr = code ? `[${code}] ` : "";
  return `${tag} ${status} ${codeStr}${text}\r\n`;
}

/**
 * Format an untagged IMAP response (server-initiated data).
 * Format: * SP text CRLF
 *
 * @param text - The response content.
 */
export function formatUntagged(text: string): string {
  return `* ${text}\r\n`;
}

/**
 * Format a continuation request response.
 * Format: + [SP text] CRLF
 *
 * @param text - Optional continuation text (e.g., base64 challenge).
 */
export function formatContinuation(text?: string): string {
  return text ? `+ ${text}\r\n` : "+ \r\n";
}

/**
 * Build a CAPABILITY response string.
 *
 * @param additionalCaps - Extra capabilities beyond the defaults.
 * @returns Formatted CAPABILITY response data.
 */
export function buildCapabilityString(additionalCaps?: string[]): string {
  const caps = [...DEFAULT_CAPABILITIES, ...(additionalCaps ?? [])];
  return `CAPABILITY ${caps.join(" ")}`;
}

/**
 * Format a LIST response line per RFC 9051 Section 7.2.2.
 *
 * @param attributes - Mailbox attributes (e.g., "\\HasChildren", "\\Noselect").
 * @param delimiter - Hierarchy delimiter (e.g., "/").
 * @param name - Mailbox name.
 */
export function formatListResponse(
  attributes: string[],
  delimiter: string,
  name: string,
): string {
  const attrStr = attributes.length > 0 ? attributes.join(" ") : "";
  const delimStr = delimiter ? `"${delimiter}"` : "NIL";
  const nameStr = needsQuoting(name) ? `"${escapeQuoted(name)}"` : name;
  return `LIST (${attrStr}) ${delimStr} ${nameStr}`;
}

/**
 * Format an LSUB response line (same format as LIST but with LSUB prefix).
 */
export function formatLsubResponse(
  attributes: string[],
  delimiter: string,
  name: string,
): string {
  const attrStr = attributes.length > 0 ? attributes.join(" ") : "";
  const delimStr = delimiter ? `"${delimiter}"` : "NIL";
  const nameStr = needsQuoting(name) ? `"${escapeQuoted(name)}"` : name;
  return `LSUB (${attrStr}) ${delimStr} ${nameStr}`;
}

/**
 * Format a STATUS response per RFC 9051 Section 7.2.4.
 *
 * @param name - Mailbox name.
 * @param items - Status items to include.
 */
export function formatStatusResponse(
  name: string,
  items: Partial<Record<string, number>>,
): string {
  const nameStr = needsQuoting(name) ? `"${escapeQuoted(name)}"` : name;
  const parts: string[] = [];
  for (const [key, value] of Object.entries(items)) {
    if (value !== undefined) {
      parts.push(`${key} ${value}`);
    }
  }
  return `STATUS ${nameStr} (${parts.join(" ")})`;
}

/**
 * Format a FETCH response for a single message.
 *
 * @param sequenceNumber - Message sequence number.
 * @param data - Fetch data items as key-value pairs.
 */
export function formatFetchResponse(
  sequenceNumber: number,
  data: string[],
): string {
  return `${sequenceNumber} FETCH (${data.join(" ")})`;
}

/**
 * Format an ENVELOPE structure for FETCH response.
 */
export function formatEnvelope(envelope: ImapEnvelope): string {
  const parts = [
    formatNString(envelope.date),
    formatNString(envelope.subject),
    formatAddressList(envelope.from),
    formatAddressList(envelope.sender),
    formatAddressList(envelope.replyTo),
    formatAddressList(envelope.to),
    formatAddressList(envelope.cc),
    formatAddressList(envelope.bcc),
    formatNString(envelope.inReplyTo),
    formatNString(envelope.messageId),
  ];
  return `(${parts.join(" ")})`;
}

/**
 * Format an address list for ENVELOPE response.
 */
function formatAddressList(addresses: ImapAddress[]): string {
  if (addresses.length === 0) return "NIL";
  const formatted = addresses.map(
    (a) =>
      `(${formatNString(a.name)} ${formatNString(a.route)} ${formatNString(a.mailbox)} ${formatNString(a.host)})`,
  );
  return `(${formatted.join(" ")})`;
}

/**
 * Format a BODYSTRUCTURE for FETCH response.
 */
export function formatBodyStructure(body: ImapBodyStructure): string {
  if (body.parts && body.parts.length > 0) {
    // Multipart
    const partsStr = body.parts.map(formatBodyStructure).join(" ");
    return `(${partsStr} "${body.subtype.toUpperCase()}")`;
  }

  // Single part
  const parts: string[] = [
    `"${body.type.toUpperCase()}"`,
    `"${body.subtype.toUpperCase()}"`,
    formatBodyParams(body.params),
    formatNString(body.id),
    formatNString(body.description),
    `"${body.encoding.toUpperCase()}"`,
    String(body.size),
  ];

  // Text types include line count
  if (body.type.toLowerCase() === "text" && body.lines !== undefined) {
    parts.push(String(body.lines));
  }

  return `(${parts.join(" ")})`;
}

/**
 * Format body parameters as a parenthesized list.
 */
function formatBodyParams(params: Record<string, string>): string {
  const entries = Object.entries(params);
  if (entries.length === 0) return "NIL";
  const parts = entries.map(([k, v]) => `"${k.toUpperCase()}" "${v}"`);
  return `(${parts.join(" ")})`;
}

/**
 * Format a SEARCH response.
 *
 * @param uids - Matching message sequence numbers or UIDs.
 */
export function formatSearchResponse(uids: number[]): string {
  if (uids.length === 0) return "SEARCH";
  return `SEARCH ${uids.join(" ")}`;
}

/**
 * Format flags list for responses.
 */
export function formatFlags(flags: string[]): string {
  return `(${flags.join(" ")})`;
}

// ─── String Formatting Helpers ──────────────────────────────────────────────

/**
 * Format a nullable string as an IMAP nstring (NIL or quoted string).
 */
export function formatNString(value: string | null): string {
  if (value === null) return "NIL";
  return `"${escapeQuoted(value)}"`;
}

/**
 * Format a string as an IMAP literal {n}\r\n<data>.
 */
export function formatLiteral(data: string): string {
  const byteLength = Buffer.byteLength(data, "utf-8");
  return `{${byteLength}}\r\n${data}`;
}

/**
 * Escape special characters in a quoted string per RFC 9051.
 */
function escapeQuoted(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * Determine if a string needs quoting in IMAP responses.
 */
function needsQuoting(value: string): boolean {
  if (value === "INBOX") return false;
  // eslint-disable-next-line no-control-regex
  return /[\s"()\\{}\x00-\x1f\x7f%*]/.test(value) || value.length === 0;
}

// ─── State Validation ───────────────────────────────────────────────────────

/**
 * Commands valid in each IMAP state per RFC 9051 Section 6.
 */
const STATE_COMMANDS: Record<ImapState, ReadonlySet<string>> = {
  not_authenticated: new Set([
    "CAPABILITY", "NOOP", "LOGOUT",
    "STARTTLS", "AUTHENTICATE", "LOGIN",
    "ID",
  ]),
  authenticated: new Set([
    "CAPABILITY", "NOOP", "LOGOUT",
    "SELECT", "EXAMINE", "CREATE", "DELETE", "RENAME",
    "SUBSCRIBE", "UNSUBSCRIBE", "LIST", "LSUB",
    "NAMESPACE", "STATUS", "APPEND",
    "ID", "ENABLE",
  ]),
  selected: new Set([
    "CAPABILITY", "NOOP", "LOGOUT",
    "SELECT", "EXAMINE", "CREATE", "DELETE", "RENAME",
    "SUBSCRIBE", "UNSUBSCRIBE", "LIST", "LSUB",
    "NAMESPACE", "STATUS", "APPEND",
    "CLOSE", "UNSELECT", "EXPUNGE",
    "SEARCH", "FETCH", "STORE", "COPY", "MOVE",
    "UID", "IDLE",
    "ID", "ENABLE",
  ]),
  logout: new Set(["LOGOUT"]),
};

/**
 * Check if a command is valid for the current session state.
 *
 * @param command - The command name.
 * @param state - Current session state.
 * @returns Whether the command is valid in the given state.
 */
export function isCommandValidForState(command: string, state: ImapState): boolean {
  if (command === "UNKNOWN") return false;
  const validSet = STATE_COMMANDS[state];
  return validSet.has(command);
}

/**
 * Get all valid commands for a given state.
 */
export function validCommandsForState(state: ImapState): ReadonlySet<string> {
  return STATE_COMMANDS[state];
}
