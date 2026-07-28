import type {
  ParsedEmail,
  ParsedAddress,
  ParsedAttachment,
  MimePart,
} from "./types.js";

const CRLF = "\r\n";
const HEADER_FOLD_REGEX = /\r\n[ \t]+/g;

/**
 * Parse a raw RFC 5322 email message into a structured object.
 *
 * Handles:
 * - Header unfolding and decoding (RFC 2047 encoded words)
 * - MIME multipart parsing (mixed, alternative, related)
 * - Content-Transfer-Encoding (base64, quoted-printable, 7bit, 8bit)
 * - Attachment extraction
 * - Address parsing with display names and groups
 */
export function parseEmail(raw: string): ParsedEmail {
  // Normalize line endings to CRLF
  const normalized = raw.replace(/\r?\n/g, CRLF);

  // Split headers and body at the first blank line
  const separatorIndex = normalized.indexOf(CRLF + CRLF);
  const rawHeaders =
    separatorIndex === -1 ? normalized : normalized.slice(0, separatorIndex);
  const rawBody =
    separatorIndex === -1 ? "" : normalized.slice(separatorIndex + 4);

  const headers = parseHeaders(rawHeaders);

  // Extract content type info for body parsing
  const contentTypeHeader = getHeader(headers, "content-type") ?? "text/plain";
  const transferEncoding =
    getHeader(headers, "content-transfer-encoding") ?? "7bit";

  let textBody: string | undefined;
  let htmlBody: string | undefined;
  let attachments: ParsedAttachment[] = [];

  const { mediaType, boundary } = parseContentType(contentTypeHeader);

  if (boundary && mediaType.startsWith("multipart/")) {
    const parts = parseMultipart(rawBody, boundary);
    const extracted = extractParts(parts);
    textBody = extracted.textBody;
    htmlBody = extracted.htmlBody;
    attachments = extracted.attachments;
  } else if (mediaType === "text/html") {
    htmlBody = decodeBody(rawBody, transferEncoding, contentTypeHeader);
  } else {
    textBody = decodeBody(rawBody, transferEncoding, contentTypeHeader);
  }

  const from = parseAddressList(getHeader(headers, "from") ?? "");
  const to = parseAddressList(getHeader(headers, "to") ?? "");
  const cc = parseAddressList(getHeader(headers, "cc") ?? "");
  const bcc = parseAddressList(getHeader(headers, "bcc") ?? "");
  const replyTo = parseAddressList(getHeader(headers, "reply-to") ?? "");

  const dateStr = getHeader(headers, "date");
  const date = dateStr ? new Date(dateStr) : undefined;

  const referencesStr = getHeader(headers, "references") ?? "";
  const references = referencesStr
    ? extractMessageIds(referencesStr)
    : [];

  const replyToAddr = replyTo[0];
  const inReplyToId = extractMessageId(getHeader(headers, "in-reply-to") ?? "");

  const parsed: ParsedEmail = {
    messageId: extractMessageId(getHeader(headers, "message-id") ?? ""),
    from: from[0] ?? { address: "" },
    to,
    cc,
    bcc,
    subject: decodeEncodedWords(getHeader(headers, "subject") ?? ""),
    references,
    attachments,
    headers,
    rawHeaders,
    rawBody,
    ...(replyToAddr ? { replyTo: replyToAddr } : {}),
    ...(date ? { date } : {}),
    ...(inReplyToId ? { inReplyTo: inReplyToId } : {}),
    ...(textBody !== undefined ? { textBody } : {}),
    ...(htmlBody !== undefined ? { htmlBody } : {}),
  };
  return parsed;
}

// ---------------------------------------------------------------------------
// Header parsing
// ---------------------------------------------------------------------------

function parseHeaders(raw: string): ReadonlyMap<string, string[]> {
  // Unfold continued headers (lines starting with whitespace)
  const unfolded = raw.replace(HEADER_FOLD_REGEX, " ");
  const result = new Map<string, string[]>();

  for (const line of unfolded.split(CRLF)) {
    if (!line) continue;
    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) continue;

    const name = line.slice(0, colonIndex).trim().toLowerCase();
    const value = line.slice(colonIndex + 1).trim();
    const existing = result.get(name);
    if (existing) {
      existing.push(value);
    } else {
      result.set(name, [value]);
    }
  }

  return result;
}

function getHeader(
  headers: ReadonlyMap<string, string[]>,
  name: string,
): string | undefined {
  return headers.get(name.toLowerCase())?.[0];
}

// ---------------------------------------------------------------------------
// Address parsing
// ---------------------------------------------------------------------------

/**
 * Parse an address list header value (From, To, Cc, etc.)
 * Handles: "Name <addr>", bare addresses, and comma-separated lists.
 */
export function parseAddressList(value: string): ParsedAddress[] {
  if (!value.trim()) return [];

  const results: ParsedAddress[] = [];
  let remaining = value.trim();

  while (remaining.length > 0) {
    // Skip leading commas/whitespace
    remaining = remaining.replace(/^[\s,]+/, "");
    if (!remaining) break;

    const angleBracket = remaining.indexOf("<");
    const nextComma = remaining.indexOf(",");

    if (angleBracket !== -1 && (nextComma === -1 || angleBracket < nextComma)) {
      // "Display Name" <address> format
      const closeBracket = remaining.indexOf(">", angleBracket);
      if (closeBracket === -1) break;

      const name = decodeEncodedWords(
        remaining.slice(0, angleBracket).replace(/^["'\s]+|["'\s]+$/g, ""),
      );
      const address = remaining.slice(angleBracket + 1, closeBracket).trim();
      results.push(name ? { name, address } : { address });
      remaining = remaining.slice(closeBracket + 1);
    } else {
      // Bare address
      const end = nextComma === -1 ? remaining.length : nextComma;
      const address = remaining.slice(0, end).trim();
      if (address && address.includes("@")) {
        results.push({ address });
      }
      remaining = remaining.slice(end);
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// MIME multipart parsing
// ---------------------------------------------------------------------------

function parseContentType(header: string): {
  mediaType: string;
  boundary?: string;
  charset?: string;
} {
  const parts = header.split(";").map((s) => s.trim());
  const mediaType = (parts[0] ?? "text/plain").toLowerCase();
  let boundary: string | undefined;
  let charset: string | undefined;

  for (let i = 1; i < parts.length; i++) {
    const param = parts[i];
    if (param === undefined) continue;
    const eqIdx = param.indexOf("=");
    if (eqIdx === -1) continue;
    const key = param.slice(0, eqIdx).trim().toLowerCase();
    let val = param.slice(eqIdx + 1).trim();
    // Remove quotes
    if (val.startsWith('"') && val.endsWith('"')) {
      val = val.slice(1, -1);
    }
    if (key === "boundary") boundary = val;
    if (key === "charset") charset = val;
  }

  return {
    mediaType,
    ...(boundary !== undefined ? { boundary } : {}),
    ...(charset !== undefined ? { charset } : {}),
  };
}

/**
 * Deepest `multipart/*` nesting to descend into, and the widest single level.
 *
 * Recursion here was unbounded and each level re-splits the body it was
 * handed, so a message nesting multiparts hundreds deep costs work
 * superlinear in its own size. On the import path that means one crafted
 * `.eml` in an archive can stall a whole mailbox import; the same parser
 * shape on the receive side (services/inbound) faces anonymous senders.
 * Legitimate mail is a handful of levels — mixed wrapping alternative
 * wrapping the bodies is three.
 */
const MAX_MULTIPART_DEPTH = 20;
const MAX_PARTS_PER_LEVEL = 500;

function parseMultipart(
  body: string,
  boundary: string,
  depth = 0,
): MimePart[] {
  const delimiter = `--${boundary}`;
  const parts: MimePart[] = [];

  // Split on boundary
  const sections = body.split(delimiter);

  for (let i = 1; i < sections.length; i++) {
    const section = sections[i];
    if (section === undefined) continue;
    // Skip the closing delimiter
    if (section.trimStart().startsWith("--")) continue;

    // Remove trailing CRLF
    const cleaned = section.replace(/^\r\n/, "").replace(/\r\n$/, "");
    const sepIdx = cleaned.indexOf(CRLF + CRLF);
    if (sepIdx === -1) continue;

    const partHeadersRaw = cleaned.slice(0, sepIdx);
    const partBody = cleaned.slice(sepIdx + 4);
    const partHeaders = parseFlatHeaders(partHeadersRaw);

    const contentType = partHeaders.get("content-type") ?? "text/plain";
    const { mediaType, boundary: subBoundary, charset } =
      parseContentType(contentType);
    const encoding = partHeaders.get("content-transfer-encoding") ?? "7bit";

    const part: MimePart = {
      headers: partHeaders,
      contentType: mediaType,
      encoding,
      body: partBody,
      ...(charset !== undefined ? { charset } : {}),
      ...(subBoundary && depth < MAX_MULTIPART_DEPTH
        ? { parts: parseMultipart(partBody, subBoundary, depth + 1) }
        : {}),
    };

    parts.push(part);
    // Stop at the width limit — a single level with tens of thousands of
    // siblings is the flat version of the same attack.
    if (parts.length >= MAX_PARTS_PER_LEVEL) break;
  }

  return parts;
}

function parseFlatHeaders(raw: string): ReadonlyMap<string, string> {
  const unfolded = raw.replace(HEADER_FOLD_REGEX, " ");
  const result = new Map<string, string>();

  for (const line of unfolded.split(CRLF)) {
    if (!line) continue;
    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) continue;
    const name = line.slice(0, colonIndex).trim().toLowerCase();
    const value = line.slice(colonIndex + 1).trim();
    result.set(name, value);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Part extraction
// ---------------------------------------------------------------------------

interface ExtractedParts {
  textBody?: string;
  htmlBody?: string;
  attachments: ParsedAttachment[];
}

function extractParts(parts: readonly MimePart[]): ExtractedParts {
  let textBody: string | undefined;
  let htmlBody: string | undefined;
  const attachments: ParsedAttachment[] = [];

  for (const part of parts) {
    // Recurse into nested multipart
    if (part.parts && part.parts.length > 0) {
      const nested = extractParts(part.parts);
      textBody ??= nested.textBody;
      htmlBody ??= nested.htmlBody;
      attachments.push(...nested.attachments);
      continue;
    }

    const disposition = part.headers.get("content-disposition") ?? "";
    const isAttachment =
      disposition.startsWith("attachment") ||
      (disposition.startsWith("inline") &&
        !part.contentType.startsWith("text/"));

    if (isAttachment) {
      const filename = extractFilename(disposition) ?? "untitled";
      const decoded = decodeTransferEncoding(part.body, part.encoding ?? "7bit");
      const contentId = part.headers
        .get("content-id")
        ?.replace(/^<|>$/g, "");

      const attachment: ParsedAttachment = {
        filename,
        contentType: part.contentType,
        content: decoded,
        size: decoded.byteLength,
        disposition: disposition.startsWith("inline") ? "inline" : "attachment",
        ...(contentId !== undefined ? { contentId } : {}),
      };
      attachments.push(attachment);
    } else if (part.contentType === "text/plain" && !textBody) {
      textBody = decodeBody(
        part.body,
        part.encoding ?? "7bit",
        part.headers.get("content-type") ?? "text/plain",
      );
    } else if (part.contentType === "text/html" && !htmlBody) {
      htmlBody = decodeBody(
        part.body,
        part.encoding ?? "7bit",
        part.headers.get("content-type") ?? "text/html",
      );
    }
  }

  return {
    attachments,
    ...(textBody !== undefined ? { textBody } : {}),
    ...(htmlBody !== undefined ? { htmlBody } : {}),
  };
}

function extractFilename(disposition: string): string | undefined {
  const match = /filename\*?=(?:"([^"]+)"|([^\s;]+))/i.exec(disposition);
  return match?.[1] ?? match?.[2];
}

// ---------------------------------------------------------------------------
// Content-Transfer-Encoding decoding
// ---------------------------------------------------------------------------

/**
 * Decode bytes using a declared charset, falling back to UTF-8.
 *
 * Every decode path in this file previously used a bare `new TextDecoder()`,
 * which always decodes UTF-8 regardless of what the message declared. A
 * message stating `charset=iso-8859-1` or `shift_jis` — routine in archives
 * old enough to be worth importing — came out mojibake, silently, with the
 * declared charset parsed and then thrown away a few lines later.
 *
 * An unknown or misspelled label makes `TextDecoder` throw, so it is caught:
 * a charset we do not recognise must degrade to a best-effort read, never
 * abort an import mid-mailbox.
 *
 * `fatal` is deliberately left off. Bytes that are invalid in the declared
 * charset become U+FFFD rather than throwing, because a partly-garbled body
 * is still worth importing and a thrown error would lose the whole message.
 */
function decodeBytes(bytes: Uint8Array, charset: string | undefined): string {
  const label = charset?.trim().toLowerCase();
  if (label && label !== "utf-8" && label !== "utf8") {
    try {
      return new TextDecoder(label).decode(bytes);
    } catch {
      // Unrecognised label — fall through to UTF-8.
    }
  }
  return new TextDecoder().decode(bytes);
}

/** Pull the charset parameter out of a Content-Type header value. */
function charsetOf(contentType: string): string | undefined {
  const match = /;\s*charset\s*=\s*"?([^";\s]+)"?/i.exec(contentType);
  return match?.[1];
}

function decodeBody(
  body: string,
  encoding: string,
  contentType: string,
): string {
  const enc = encoding.toLowerCase();
  const charset = charsetOf(contentType);

  if (enc === "base64") {
    return decodeBytes(decodeBase64(body), charset);
  }
  if (enc === "quoted-printable") {
    // Quoted-printable yields BYTES, not characters — `=C3=A9` is two bytes
    // that mean "é" only once decoded as UTF-8. Reading them as code points
    // (which is what the string-returning path did) produced mojibake for
    // every non-ASCII character in a QP body, the single most common
    // encoding for European-language mail.
    return decodeBytes(quotedPrintableToBytes(body), charset);
  }
  // 7bit/8bit bodies are raw bytes that arrived as a latin1-ish string; only
  // re-decode when a non-UTF-8 charset was declared, so the common case is
  // untouched.
  if (charset !== undefined) {
    return decodeBytes(latin1ToBytes(body), charset);
  }
  return body;
}

/** Reinterpret a byte-per-code-unit string back into the bytes it represents. */
function latin1ToBytes(input: string): Uint8Array {
  const bytes = new Uint8Array(input.length);
  for (let i = 0; i < input.length; i++) {
    bytes[i] = input.charCodeAt(i) & 0xff;
  }
  return bytes;
}

function decodeTransferEncoding(
  body: string,
  encoding: string,
): Uint8Array {
  const enc = encoding.toLowerCase();
  if (enc === "base64") {
    return decodeBase64(body);
  }
  if (enc === "quoted-printable") {
    return new TextEncoder().encode(decodeQuotedPrintable(body));
  }
  return new TextEncoder().encode(body);
}

function decodeBase64(input: string): Uint8Array {
  const cleaned = input.replace(/[\r\n\s]/g, "");
  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function decodeQuotedPrintable(input: string): string {
  return input
    // Soft line breaks
    .replace(/=\r?\n/g, "")
    // Encoded characters
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex: string) =>
      String.fromCharCode(parseInt(hex, 16)),
    );
}

/**
 * Quoted-printable to raw bytes.
 *
 * `decodeQuotedPrintable` returns a string with one code unit per byte, which
 * is only the right answer when the charset happens to be latin1. Callers
 * that know the declared charset need the bytes so they can decode them
 * properly — `=C3=A9` is two bytes meaning "é" in UTF-8, not two characters.
 */
function quotedPrintableToBytes(input: string): Uint8Array {
  return latin1ToBytes(decodeQuotedPrintable(input));
}

// ---------------------------------------------------------------------------
// RFC 2047 encoded word decoding
// ---------------------------------------------------------------------------

/**
 * Decode RFC 2047 encoded words: =?charset?encoding?text?=
 */
export function decodeEncodedWords(input: string): string {
  return input.replace(
    /=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g,
    (_match, charset: string, encoding: string, text: string) => {
      // The charset is right here in the encoded word, and was being ignored
      // — the parameter was even named `_charset` to mark it unused. Subject
      // lines are the most visible field in the product, so a mis-decoded one
      // is the most visible possible corruption.
      if (encoding.toUpperCase() === "B") {
        return decodeBytes(decodeBase64(text), charset);
      }
      // Q-encoding: like quoted-printable, but `_` means space. The hex
      // escapes are BYTES — decoding them as code points read a UTF-8
      // subject as latin1, which is the mojibake case that actually shows up.
      const bytes = latin1ToBytes(
        text
          .replace(/_/g, " ")
          .replace(/=([0-9A-Fa-f]{2})/g, (_, hex: string) =>
            String.fromCharCode(parseInt(hex, 16)),
          ),
      );
      return decodeBytes(bytes, charset);
    },
  );
}

// ---------------------------------------------------------------------------
// Message-ID extraction
// ---------------------------------------------------------------------------

function extractMessageId(value: string): string {
  const match = /<([^>]+)>/.exec(value);
  return match?.[1] ?? value.trim();
}

function extractMessageIds(value: string): string[] {
  const ids: string[] = [];
  const regex = /<([^>]+)>/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(value)) !== null) {
    if (match[1]) ids.push(match[1]);
  }
  return ids;
}
