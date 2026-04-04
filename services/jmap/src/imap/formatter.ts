/**
 * IMAP4rev2 response formatter (RFC 9051).
 *
 * Builds correctly-encoded IMAP response lines including:
 *   - Tagged / untagged / continuation responses
 *   - FETCH data items (ENVELOPE, BODYSTRUCTURE, FLAGS, ...)
 *   - String quoting, literal encoding, NIL handling
 *   - Parenthesized lists
 */

// ---------------------------------------------------------------------------
// Low-level string encoding
// ---------------------------------------------------------------------------

const NEEDS_QUOTING = /[\x00-\x1f\x7f"\\(){\s]/;
const NEEDS_LITERAL = /[\r\n\x00]/;

/** Encode a value as an IMAP string (atom, quoted, or literal). */
export function imapString(value: string | null | undefined): string {
  if (value == null) return "NIL";
  if (value.length === 0) return '""';

  // If the value contains CR/LF/NUL we must use a literal
  if (NEEDS_LITERAL.test(value)) {
    const buf = Buffer.from(value, "utf-8");
    return `{${buf.length}}\r\n${value}`;
  }

  // If it contains atom-specials, quote it
  if (NEEDS_QUOTING.test(value)) {
    const escaped = value.replace(/["\\]/g, "\\$&");
    return `"${escaped}"`;
  }

  // Safe as an atom — but we still quote for consistency/safety
  // (many clients prefer quoted strings)
  return `"${value}"`;
}

/** Encode a value as a quoted string (always quoted, never literal). */
export function imapQuoted(value: string | null | undefined): string {
  if (value == null) return "NIL";
  const escaped = value.replace(/["\\]/g, "\\$&").replace(/[\r\n]/g, "");
  return `"${escaped}"`;
}

/** Format an IMAP number or NIL. */
export function imapNumber(n: number | null | undefined): string {
  if (n == null) return "NIL";
  return String(Math.floor(n));
}

/** Wrap items in parentheses. */
export function imapList(items: string[]): string {
  return `(${items.join(" ")})`;
}

/** NIL or parenthesized list. */
export function imapNList(items: string[] | null | undefined): string {
  if (!items || items.length === 0) return "NIL";
  return imapList(items);
}

// ---------------------------------------------------------------------------
// Response line builders
// ---------------------------------------------------------------------------

/** Untagged response: `* <text>\r\n` */
export function untagged(text: string): string {
  return `* ${text}\r\n`;
}

/** Tagged OK: `<tag> OK <text>\r\n` */
export function taggedOk(tag: string, text: string): string {
  return `${tag} OK ${text}\r\n`;
}

/** Tagged NO: `<tag> NO <text>\r\n` */
export function taggedNo(tag: string, text: string): string {
  return `${tag} NO ${text}\r\n`;
}

/** Tagged BAD: `<tag> BAD <text>\r\n` */
export function taggedBad(tag: string, text: string): string {
  return `${tag} BAD ${text}\r\n`;
}

/** Continuation request: `+ <text>\r\n` */
export function continuation(text: string = ""): string {
  return `+ ${text}\r\n`;
}

// ---------------------------------------------------------------------------
// ENVELOPE formatter (RFC 9051 Section 7.5.2)
// ---------------------------------------------------------------------------

export interface EnvelopeAddress {
  name: string | null;
  email: string;
}

/**
 * Format an IMAP ENVELOPE response.
 *
 * ENVELOPE = "(" date SP subject SP from SP sender SP reply-to SP to SP
 *                cc SP bcc SP in-reply-to SP message-id ")"
 *
 * Each address group is `((name NIL mailbox host) ...)` or NIL.
 */
export function formatEnvelope(env: {
  date: string | null;
  subject: string | null;
  from: EnvelopeAddress[] | null;
  sender: EnvelopeAddress[] | null;
  replyTo: EnvelopeAddress[] | null;
  to: EnvelopeAddress[] | null;
  cc: EnvelopeAddress[] | null;
  bcc: EnvelopeAddress[] | null;
  inReplyTo: string | null;
  messageId: string | null;
}): string {
  const parts = [
    imapQuoted(env.date),
    imapQuoted(env.subject),
    formatAddressList(env.from),
    formatAddressList(env.sender ?? env.from), // sender defaults to from
    formatAddressList(env.replyTo ?? env.from), // reply-to defaults to from
    formatAddressList(env.to),
    formatAddressList(env.cc),
    formatAddressList(env.bcc),
    imapQuoted(env.inReplyTo),
    imapQuoted(env.messageId),
  ];
  return `(${parts.join(" ")})`;
}

function formatAddressList(addrs: EnvelopeAddress[] | null): string {
  if (!addrs || addrs.length === 0) return "NIL";
  const formatted = addrs.map((a) => {
    const [mailbox, host] = splitEmail(a.email);
    return `(${imapQuoted(a.name)} NIL ${imapQuoted(mailbox)} ${imapQuoted(host)})`;
  });
  return `(${formatted.join(" ")})`;
}

function splitEmail(email: string): [string, string] {
  const atIdx = email.lastIndexOf("@");
  if (atIdx === -1) return [email, ""];
  return [email.slice(0, atIdx), email.slice(atIdx + 1)];
}

// ---------------------------------------------------------------------------
// BODYSTRUCTURE formatter (RFC 9051 Section 7.5.2)
// ---------------------------------------------------------------------------

export interface BodyPart {
  type: string;         // e.g. "text"
  subtype: string;      // e.g. "plain"
  params: Record<string, string> | null; // e.g. { charset: "utf-8" }
  id: string | null;
  description: string | null;
  encoding: string;     // e.g. "7BIT", "QUOTED-PRINTABLE"
  size: number;
  lines?: number;       // for text/* parts
  parts?: BodyPart[];   // for multipart
}

export function formatBodyStructure(part: BodyPart): string {
  if (part.parts && part.parts.length > 0) {
    // Multipart
    const childParts = part.parts.map(formatBodyStructure).join(" ");
    return `(${childParts} ${imapQuoted(part.subtype)})`;
  }

  // Single part:
  // (type subtype params id description encoding size [lines])
  const items: string[] = [
    imapQuoted(part.type),
    imapQuoted(part.subtype),
    formatParams(part.params),
    imapQuoted(part.id),
    imapQuoted(part.description),
    imapQuoted(part.encoding),
    imapNumber(part.size),
  ];

  // text/* parts include line count
  if (part.type.toLowerCase() === "text" && part.lines != null) {
    items.push(imapNumber(part.lines));
  }

  return `(${items.join(" ")})`;
}

function formatParams(params: Record<string, string> | null): string {
  if (!params) return "NIL";
  const entries = Object.entries(params);
  if (entries.length === 0) return "NIL";
  const items = entries.flatMap(([k, v]) => [imapQuoted(k), imapQuoted(v)]);
  return `(${items.join(" ")})`;
}

// ---------------------------------------------------------------------------
// FLAGS formatter
// ---------------------------------------------------------------------------

export function formatFlags(flags: string[]): string {
  return `(${flags.join(" ")})`;
}

// ---------------------------------------------------------------------------
// FETCH response builder
// ---------------------------------------------------------------------------

export interface FetchData {
  /** Message sequence number. */
  seq: number;
  items: Map<string, string>;
}

/**
 * Build a complete `* N FETCH (...)` untagged response.
 */
export function formatFetchResponse(data: FetchData): string {
  const parts: string[] = [];
  for (const [key, value] of data.items) {
    parts.push(`${key} ${value}`);
  }
  return untagged(`${data.seq} FETCH (${parts.join(" ")})`);
}

// ---------------------------------------------------------------------------
// STATUS response
// ---------------------------------------------------------------------------

export function formatStatus(
  name: string,
  items: Record<string, number>,
): string {
  const parts = Object.entries(items).map(([k, v]) => `${k} ${v}`);
  return untagged(`STATUS ${imapString(name)} (${parts.join(" ")})`);
}

// ---------------------------------------------------------------------------
// LIST response
// ---------------------------------------------------------------------------

export function formatList(
  flags: string[],
  delimiter: string,
  name: string,
): string {
  return untagged(
    `LIST (${flags.join(" ")}) ${imapQuoted(delimiter)} ${imapString(name)}`,
  );
}

// ---------------------------------------------------------------------------
// SEARCH response
// ---------------------------------------------------------------------------

export function formatSearch(uids: number[]): string {
  if (uids.length === 0) return untagged("SEARCH");
  return untagged(`SEARCH ${uids.join(" ")}`);
}
