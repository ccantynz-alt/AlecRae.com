import type { ParsedEmail, EmailAddress, MimeHeader, ParsedAttachment } from "../types.js";

/**
 * Full MIME parser supporting multipart messages, attachments,
 * base64/quoted-printable encodings, and various character sets.
 */

// --- Character Set Decoding ---

const CHARSET_ALIASES: Record<string, string> = {
  "ascii": "utf-8",
  "us-ascii": "utf-8",
  "latin1": "iso-8859-1",
  "latin-1": "iso-8859-1",
  "iso-latin-1": "iso-8859-1",
  "windows-1252": "iso-8859-1",
  "cp1252": "iso-8859-1",
};

function normalizeCharset(charset: string): string {
  const lower = charset.toLowerCase().trim();
  return CHARSET_ALIASES[lower] ?? lower;
}

function decodeCharset(bytes: Uint8Array, charset: string): string {
  const normalized = normalizeCharset(charset);
  try {
    const decoder = new TextDecoder(normalized as ConstructorParameters<typeof TextDecoder>[0]);
    return decoder.decode(bytes);
  } catch {
    // Fallback to UTF-8
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  }
}

// --- Base64 Decoding ---

function decodeBase64(input: string): Uint8Array {
  // Strip whitespace that commonly appears in MIME base64
  const cleaned = input.replace(/[\s\r\n]/g, "");
  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// --- Quoted-Printable Decoding ---

function decodeQuotedPrintable(input: string): Uint8Array {
  const bytes: number[] = [];
  const lines = input.split(/\r?\n/);

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const originalLine = lines[lineIdx];
    if (originalLine === undefined) continue;
    let line = originalLine;

    // Soft line break: line ending with '='
    const softBreak = line.endsWith("=");
    if (softBreak) {
      line = line.slice(0, -1);
    }

    let i = 0;
    while (i < line.length) {
      if (line[i] === "=" && i + 2 < line.length) {
        const hex = line.slice(i + 1, i + 3);
        const code = parseInt(hex, 16);
        if (!isNaN(code)) {
          bytes.push(code);
          i += 3;
          continue;
        }
      }
      bytes.push(line.charCodeAt(i));
      i++;
    }

    // Add line break unless soft break or last line
    if (!softBreak && lineIdx < lines.length - 1) {
      bytes.push(13, 10); // \r\n
    }
  }

  return new Uint8Array(bytes);
}

// --- RFC 2047 Encoded Word Decoding ---

function decodeEncodedWords(text: string): string {
  // =?charset?encoding?encoded_text?=
  return text.replace(
    /=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g,
    (_match, charset: string, encoding: string, encoded: string) => {
      let bytes: Uint8Array;
      if (encoding.toUpperCase() === "B") {
        bytes = decodeBase64(encoded);
      } else {
        // Q encoding: like quoted-printable but _ = space
        bytes = decodeQuotedPrintable(encoded.replace(/_/g, " "));
      }
      return decodeCharset(bytes, charset);
    },
  );
}

// --- Header Parsing ---

function parseHeaderLine(line: string): MimeHeader | null {
  const colonIdx = line.indexOf(":");
  if (colonIdx === -1) return null;

  const key = line.slice(0, colonIdx).trim().toLowerCase();
  const rawValue = line.slice(colonIdx + 1).trim();
  const decoded = decodeEncodedWords(rawValue);

  // Parse parameters (e.g., Content-Type: text/plain; charset=utf-8)
  const semicolonIdx = decoded.indexOf(";");
  if (semicolonIdx === -1) {
    return { key, value: decoded };
  }

  const value = decoded.slice(0, semicolonIdx).trim();
  const paramStr = decoded.slice(semicolonIdx + 1);
  const params: Record<string, string> = {};

  // Parse semicolon-separated parameters
  const paramRegex = /;\s*([^=\s]+)\s*=\s*(?:"([^"]*(?:\\.[^"]*)*)"|([^\s;]*))/g;
  const fullStr = ";" + paramStr;
  let paramMatch: RegExpExecArray | null;
  while ((paramMatch = paramRegex.exec(fullStr)) !== null) {
    const rawName = paramMatch[1];
    if (rawName === undefined) continue;
    const paramName = rawName.toLowerCase();
    const paramValue = paramMatch[2] ?? paramMatch[3] ?? "";
    params[paramName] = paramValue;
  }

  return { key, value, params };
}

function parseHeaders(headerBlock: string): MimeHeader[] {
  const headers: MimeHeader[] = [];
  // Unfold continuation lines (lines starting with whitespace)
  const unfolded = headerBlock.replace(/\r?\n([ \t]+)/g, " ");
  const lines = unfolded.split(/\r?\n/);

  for (const line of lines) {
    if (line.length === 0) continue;
    const header = parseHeaderLine(line);
    if (header) {
      headers.push(header);
    }
  }

  return headers;
}

function getHeader(headers: MimeHeader[], key: string): MimeHeader | undefined {
  return headers.find((h) => h.key === key);
}

function getHeaderValue(headers: MimeHeader[], key: string): string | undefined {
  return getHeader(headers, key)?.value;
}

// --- Address Parsing ---

function parseAddressList(value: string | undefined): EmailAddress[] {
  if (!value) return [];

  const addresses: EmailAddress[] = [];
  // Split on commas that are not inside quotes
  const parts = splitAddresses(value);

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    // Format: "Display Name" <email@example.com> or email@example.com
    const angleMatch = /^(?:"?([^"]*?)"?\s*)?<([^>]+)>$/.exec(trimmed);
    if (angleMatch?.[2] !== undefined) {
      addresses.push({
        name: angleMatch[1]?.trim() || undefined,
        address: angleMatch[2].trim(),
      });
    } else if (trimmed.includes("@")) {
      addresses.push({ address: trimmed });
    }
  }

  return addresses;
}

function splitAddresses(input: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let inQuote = false;
  let current = "";

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === undefined) continue;
    if (ch === '"' && (i === 0 || input[i - 1] !== "\\")) {
      inQuote = !inQuote;
    }
    if (!inQuote) {
      if (ch === "(") depth++;
      else if (ch === ")") depth--;
      else if (ch === "," && depth === 0) {
        parts.push(current);
        current = "";
        continue;
      }
    }
    current += ch;
  }
  if (current) parts.push(current);
  return parts;
}

// --- MIME Part ---

interface MimePart {
  headers: MimeHeader[];
  body: Uint8Array;
  parts: MimePart[];
}

// --- Body Parsing ---

function splitHeaderAndBody(raw: Uint8Array): { headerBlock: string; bodyStart: number } {
  const text = new TextDecoder("utf-8", { fatal: false }).decode(raw);

  // Find blank line separating headers from body
  let idx = text.indexOf("\r\n\r\n");
  if (idx !== -1) {
    return { headerBlock: text.slice(0, idx), bodyStart: idx + 4 };
  }

  idx = text.indexOf("\n\n");
  if (idx !== -1) {
    return { headerBlock: text.slice(0, idx), bodyStart: idx + 2 };
  }

  // No body
  return { headerBlock: text, bodyStart: text.length };
}

function parseMimePart(raw: Uint8Array): MimePart {
  const { headerBlock, bodyStart } = splitHeaderAndBody(raw);
  const headers = parseHeaders(headerBlock);
  const body = raw.slice(bodyStart);

  const contentType = getHeader(headers, "content-type");
  const mediaType = contentType?.value?.toLowerCase() ?? "text/plain";

  // If multipart, recursively parse sub-parts
  if (mediaType.startsWith("multipart/") && contentType?.params?.["boundary"]) {
    const boundary = contentType.params["boundary"];
    const parts = splitMultipart(body, boundary);
    return { headers, body, parts: parts.map(parseMimePart) };
  }

  return { headers, body, parts: [] };
}

function splitMultipart(body: Uint8Array, boundary: string): Uint8Array[] {
  const text = new TextDecoder("utf-8", { fatal: false }).decode(body);
  const delimiter = `--${boundary}`;
  const endDelimiter = `--${boundary}--`;

  const parts: Uint8Array[] = [];
  const segments = text.split(delimiter);

  for (let i = 1; i < segments.length; i++) {
    const segment = segments[i];
    if (segment === undefined) continue;

    // Skip the closing delimiter segment
    if (segment.trimStart().startsWith("--")) continue;

    // Remove leading CRLF
    let content = segment;
    if (content.startsWith("\r\n")) content = content.slice(2);
    else if (content.startsWith("\n")) content = content.slice(1);

    // Remove trailing delimiter indicator
    const endIdx = content.indexOf(endDelimiter);
    if (endIdx !== -1) {
      content = content.slice(0, endIdx);
    }

    // Trim trailing CRLF before next boundary
    if (content.endsWith("\r\n")) content = content.slice(0, -2);
    else if (content.endsWith("\n")) content = content.slice(0, -1);

    const encoder = new TextEncoder();
    parts.push(encoder.encode(content));
  }

  return parts;
}

// --- Content Decoding ---

function decodePartBody(part: MimePart): Uint8Array {
  const encoding = getHeaderValue(part.headers, "content-transfer-encoding")?.toLowerCase();
  const bodyText = new TextDecoder("utf-8", { fatal: false }).decode(part.body);

  switch (encoding) {
    case "base64":
      return decodeBase64(bodyText);
    case "quoted-printable":
      return decodeQuotedPrintable(bodyText);
    case "7bit":
    case "8bit":
    case "binary":
    default:
      return part.body;
  }
}

function getPartText(part: MimePart): string {
  const decoded = decodePartBody(part);
  const contentType = getHeader(part.headers, "content-type");
  const charset = contentType?.params?.["charset"] ?? "utf-8";
  return decodeCharset(decoded, charset);
}

// --- Checksum ---

async function sha256Hex(data: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// --- Extract Parts ---

interface ExtractedContent {
  text?: string;
  html?: string;
  attachments: ParsedAttachment[];
}

async function extractContent(part: MimePart): Promise<ExtractedContent> {
  const result: ExtractedContent = { attachments: [] };
  await extractContentRecursive(part, result);
  return result;
}

async function extractContentRecursive(part: MimePart, result: ExtractedContent): Promise<void> {
  const contentType = getHeader(part.headers, "content-type");
  const mediaType = contentType?.value?.toLowerCase() ?? "text/plain";
  const disposition = getHeaderValue(part.headers, "content-disposition")?.toLowerCase();

  // Recurse into multipart
  if (part.parts.length > 0) {
    for (const subPart of part.parts) {
      await extractContentRecursive(subPart, result);
    }
    return;
  }

  // Check if this is an attachment
  const isAttachment =
    disposition?.startsWith("attachment") ||
    (disposition?.startsWith("inline") && !mediaType.startsWith("text/"));

  if (isAttachment || (!mediaType.startsWith("text/") && !mediaType.startsWith("multipart/"))) {
    const decoded = decodePartBody(part);
    const filename =
      contentType?.params?.["name"] ??
      parseDispositionFilename(disposition ?? "") ??
      "unnamed";

    const attachment: ParsedAttachment = {
      filename: decodeEncodedWords(filename),
      contentType: mediaType,
      contentDisposition: disposition?.startsWith("inline") ? "inline" : "attachment",
      contentId: getHeaderValue(part.headers, "content-id")?.replace(/^<|>$/g, ""),
      size: decoded.length,
      content: decoded,
      checksum: await sha256Hex(decoded),
    };

    result.attachments.push(attachment);
    return;
  }

  // Text content
  if (mediaType === "text/plain" && !result.text) {
    result.text = getPartText(part);
  } else if (mediaType === "text/html" && !result.html) {
    result.html = getPartText(part);
  }
}

function parseDispositionFilename(disposition: string): string | undefined {
  const match = /filename\*?=(?:"([^"]+)"|([^\s;]+))/i.exec(disposition);
  if (match) {
    const value = match[1] ?? match[2];
    // Handle RFC 5987 encoding: charset'language'encoded_value
    if (value?.includes("''")) {
      const parts = value.split("''");
      const encoded = parts[1] ?? "";
      return decodeURIComponent(encoded);
    }
    return value;
  }
  return undefined;
}

// --- Extract Message-ID References ---

function parseMessageIdList(value: string | undefined): string[] {
  if (!value) return [];
  const ids: string[] = [];
  const regex = /<([^>]+)>/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(value)) !== null) {
    const id = match[1];
    if (id !== undefined) ids.push(id);
  }
  return ids;
}

// --- Main Parser ---

export class MimeParser {
  /**
   * Parse a raw email message into a structured ParsedEmail.
   */
  async parse(raw: Uint8Array): Promise<ParsedEmail> {
    const rootPart = parseMimePart(raw);
    const headers = rootPart.headers;

    const content = await extractContent(rootPart);

    const messageIdRaw = getHeaderValue(headers, "message-id");
    const messageId = messageIdRaw?.replace(/^<|>$/g, "") ?? `generated-${Date.now()}@emailed.dev`;

    const dateStr = getHeaderValue(headers, "date");
    let date: Date | undefined;
    if (dateStr) {
      const parsed = new Date(dateStr);
      if (!isNaN(parsed.getTime())) date = parsed;
    }

    return {
      messageId,
      date,
      from: parseAddressList(decodeEncodedWords(getHeaderValue(headers, "from") ?? "")),
      to: parseAddressList(decodeEncodedWords(getHeaderValue(headers, "to") ?? "")),
      cc: parseAddressList(decodeEncodedWords(getHeaderValue(headers, "cc") ?? "")),
      bcc: parseAddressList(decodeEncodedWords(getHeaderValue(headers, "bcc") ?? "")),
      replyTo: parseAddressList(decodeEncodedWords(getHeaderValue(headers, "reply-to") ?? "")),
      subject: decodeEncodedWords(getHeaderValue(headers, "subject") ?? ""),
      inReplyTo: getHeaderValue(headers, "in-reply-to")?.replace(/^<|>$/g, ""),
      references: parseMessageIdList(getHeaderValue(headers, "references")),
      headers,
      text: content.text,
      html: content.html,
      attachments: content.attachments,
      rawSize: raw.length,
    };
  }
}
