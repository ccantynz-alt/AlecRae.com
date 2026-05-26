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

function parseMultipart(body: string, boundary: string): MimePart[] {
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
      ...(subBoundary ? { parts: parseMultipart(partBody, subBoundary) } : {}),
    };

    parts.push(part);
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

function decodeBody(
  body: string,
  encoding: string,
  _contentType: string,
): string {
  const enc = encoding.toLowerCase();
  if (enc === "base64") {
    const bytes = decodeBase64(body);
    return new TextDecoder().decode(bytes);
  }
  if (enc === "quoted-printable") {
    return decodeQuotedPrintable(body);
  }
  return body;
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

// ---------------------------------------------------------------------------
// RFC 2047 encoded word decoding
// ---------------------------------------------------------------------------

/**
 * Decode RFC 2047 encoded words: =?charset?encoding?text?=
 */
export function decodeEncodedWords(input: string): string {
  return input.replace(
    /=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g,
    (_match, _charset: string, encoding: string, text: string) => {
      if (encoding.toUpperCase() === "B") {
        // Base64
        const bytes = decodeBase64(text);
        return new TextDecoder().decode(bytes);
      }
      // Q-encoding (like quoted-printable but _ = space)
      return text
        .replace(/_/g, " ")
        .replace(/=([0-9A-Fa-f]{2})/g, (_, hex: string) =>
          String.fromCharCode(parseInt(hex, 16)),
        );
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
