/**
 * IMAP4rev2 command parser (RFC 9051).
 *
 * Parses the wire-format IMAP command lines into structured objects
 * that the server can dispatch on.  Handles:
 *   - Tagged commands  (e.g.  `A001 SELECT INBOX`)
 *   - Atoms, quoted strings, literals (`{N}\r\n...`)
 *   - Parenthesized lists  (e.g.  `(FLAGS (\Seen))`)
 *   - Sequence sets          (e.g.  `1:*`, `1,3:5`)
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ImapCommand {
  /** The tag that prefixes the command (e.g. "A001"). "*" for untagged. */
  tag: string;
  /** Upper-cased command name (e.g. "SELECT", "UID"). */
  command: string;
  /** Remaining arguments as parsed tokens. */
  args: ImapToken[];
}

/** A parsed token is either a simple string, a Buffer (literal), or a list. */
export type ImapToken = string | Buffer | ImapToken[];

// ---------------------------------------------------------------------------
// Sequence-set helpers
// ---------------------------------------------------------------------------

export interface SequenceRange {
  start: number; // 0 means "*"
  end: number;   // 0 means "*"
}

/**
 * Parse an IMAP sequence-set string like `1:*`, `1,3,5`, `2:4,7`.
 * Returns an array of ranges.  A value of 0 represents `*`.
 */
export function parseSequenceSet(s: string): SequenceRange[] {
  const ranges: SequenceRange[] = [];
  for (const part of s.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) {
      const n = trimmed === "*" ? 0 : parseInt(trimmed, 10);
      ranges.push({ start: n, end: n });
    } else {
      const left = trimmed.slice(0, colonIdx);
      const right = trimmed.slice(colonIdx + 1);
      const s = left === "*" ? 0 : parseInt(left, 10);
      const e = right === "*" ? 0 : parseInt(right, 10);
      ranges.push({ start: s, end: e });
    }
  }
  return ranges;
}

/**
 * Test whether a given sequence number (or UID) falls inside a parsed
 * sequence-set.  `maxSeq` is the highest sequence number in the mailbox
 * (used to resolve `*`).
 */
export function sequenceContains(
  ranges: SequenceRange[],
  num: number,
  maxSeq: number,
): boolean {
  for (const r of ranges) {
    const lo = r.start === 0 ? maxSeq : r.start;
    const hi = r.end === 0 ? maxSeq : r.end;
    const actualLo = Math.min(lo, hi);
    const actualHi = Math.max(lo, hi);
    if (num >= actualLo && num <= actualHi) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Tokeniser
// ---------------------------------------------------------------------------

/**
 * Tokenise a raw IMAP command line (without the trailing CRLF).
 *
 * Literals are **not** resolved here because they require reading additional
 * data from the socket.  Instead the tokeniser returns a special
 * `{N}` marker; the caller (ImapSession) is responsible for reading
 * the literal payload and splicing it into the token list before handing
 * the result to command dispatch.
 */
export function tokenize(line: string): ImapToken[] {
  const tokens: ImapToken[] = [];
  let i = 0;

  const skipSpaces = () => {
    while (i < line.length && line[i] === " ") i++;
  };

  const readAtom = (): string => {
    const start = i;
    while (i < line.length) {
      const ch = line[i];
      if (ch === undefined || isAtomSpecial(ch)) break;
      i++;
    }
    return line.slice(start, i);
  };

  const readQuoted = (): string => {
    i++; // skip opening "
    let result = "";
    while (i < line.length) {
      const ch = line[i];
      if (ch === undefined) break;
      if (ch === "\\") {
        i++;
        if (i < line.length) result += line[i];
        i++;
        continue;
      }
      if (ch === '"') {
        i++; // skip closing "
        return result;
      }
      result += ch;
      i++;
    }
    return result; // unterminated — best effort
  };

  const readList = (): ImapToken[] => {
    i++; // skip (
    const list: ImapToken[] = [];
    while (i < line.length) {
      skipSpaces();
      if (i >= line.length) break;
      if (line[i] === ")") {
        i++;
        return list;
      }
      list.push(readToken());
    }
    return list;
  };

  const readToken = (): ImapToken => {
    skipSpaces();
    const ch = line[i];
    if (ch === undefined) return "";
    if (ch === '"') return readQuoted();
    if (ch === "(") return readList();
    if (ch === "{") {
      // Literal marker — return the marker string; the session will handle it.
      const start = i;
      while (i < line.length && line[i] !== "}") i++;
      i++; // skip }
      return line.slice(start, i); // e.g. "{42}"
    }
    return readAtom();
  };

  while (i < line.length) {
    skipSpaces();
    if (i >= line.length) break;
    tokens.push(readToken());
  }

  return tokens;
}

function isAtomSpecial(ch: string): boolean {
  return (
    ch === " " ||
    ch === "(" ||
    ch === ")" ||
    ch === "{" ||
    ch === '"' ||
    ch === "\\" ||
    ch === "]" ||
    // RFC 9051 list of atom-specials:
    ch === "\r" ||
    ch === "\n" ||
    ch === "\x00" ||
    // We intentionally do NOT include "[" here so that BODY[...] stays as a
    // single atom when parsed.  The bracket content is later extracted by
    // the FETCH handler.
    false
  );
}

// ---------------------------------------------------------------------------
// Command parser (top-level)
// ---------------------------------------------------------------------------

/**
 * Parse a complete IMAP command line (tag + command + args).
 *
 * The line must NOT include the trailing CRLF.
 */
export function parseCommand(line: string): ImapCommand {
  const tokens = tokenize(line);
  if (tokens.length === 0) {
    return { tag: "*", command: "", args: [] };
  }

  const tag = String(tokens[0]);
  const command = tokens.length > 1 ? String(tokens[1]).toUpperCase() : "";
  const args = tokens.slice(2);

  return { tag, command, args };
}

/**
 * Extract the literal byte count from a `{N}` token.
 * Returns -1 if the token is not a literal marker.
 */
export function extractLiteralSize(token: ImapToken): number {
  if (typeof token !== "string") return -1;
  const m = /^\{(\d+)\+?\}$/.exec(token);
  if (!m || m[1] === undefined) return -1;
  return parseInt(m[1], 10);
}

/**
 * Flatten an ImapToken[] of strings into a single string array,
 * ignoring nested lists (used for simple string-arg commands).
 */
export function flattenStrings(tokens: ImapToken[]): string[] {
  const out: string[] = [];
  for (const t of tokens) {
    if (typeof t === "string") out.push(t);
    else if (Buffer.isBuffer(t)) out.push(t.toString("utf-8"));
    else out.push(...flattenStrings(t));
  }
  return out;
}
