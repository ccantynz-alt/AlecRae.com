/**
 * @emailed/imap - TypeScript type definitions
 * IMAP4rev2 (RFC 9051) and IMAP4rev1 (RFC 3501) compatibility types.
 * This service acts as a compatibility bridge: speaks IMAP to clients
 * but uses the same underlying mailbox storage as JMAP.
 */

// ─── Result Type (same pattern as MTA) ──────────────────────────────────────

export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

// ─── IMAP Protocol Constants ────────────────────────────────────────────────

/**
 * IMAP session states per RFC 9051 Section 3.
 */
export type ImapState =
  | "not_authenticated"
  | "authenticated"
  | "selected"
  | "logout";

/**
 * Known IMAP commands per RFC 9051 and RFC 2177 (IDLE).
 */
export const IMAP_COMMANDS = [
  // Any state
  "CAPABILITY",
  "NOOP",
  "LOGOUT",
  // Not authenticated
  "STARTTLS",
  "AUTHENTICATE",
  "LOGIN",
  // Authenticated
  "SELECT",
  "EXAMINE",
  "CREATE",
  "DELETE",
  "RENAME",
  "SUBSCRIBE",
  "UNSUBSCRIBE",
  "LIST",
  "LSUB",
  "NAMESPACE",
  "STATUS",
  "APPEND",
  // Selected
  "CLOSE",
  "UNSELECT",
  "EXPUNGE",
  "SEARCH",
  "FETCH",
  "STORE",
  "COPY",
  "MOVE",
  "UID",
  "IDLE",
  // Extension
  "ID",
  "ENABLE",
] as const;

export type ImapCommandName = (typeof IMAP_COMMANDS)[number];

// ─── Parsed Command ─────────────────────────────────────────────────────────

/**
 * A parsed IMAP command with its tag, command name, and arguments.
 * IMAP commands have the format: tag SP command [SP arguments] CRLF
 */
export interface ImapCommand {
  /** The command tag (e.g., "A001", "a1"). Used for response correlation. */
  tag: string;
  /** The command name (e.g., "LOGIN", "FETCH"). */
  name: ImapCommandName | "UNKNOWN";
  /** Raw argument string after the command name. */
  args: string;
  /** The original raw line as received. */
  rawLine: string;
}

// ─── Session ────────────────────────────────────────────────────────────────

/**
 * Represents an active IMAP client connection session.
 */
export interface ImapSession {
  /** Unique session identifier (UUID). */
  id: string;
  /** Current protocol state. */
  state: ImapState;
  /** Remote client IP address. */
  remoteAddress: string;
  /** Remote client port. */
  remotePort: number;
  /** Authenticated username, or null if not yet authenticated. */
  user: string | null;
  /** Currently selected mailbox, or null if none selected. */
  selectedMailbox: SelectedMailbox | null;
  /** Advertised capabilities for this session. */
  capabilities: string[];
  /** Whether the connection is using TLS. */
  tls: boolean;
  /** Whether the client has issued IDLE and is waiting for updates. */
  idling: boolean;
  /** Timestamp when the session was created. */
  startedAt: Date;
  /** Number of consecutive failed auth attempts. */
  failedAuthAttempts: number;
  /** Enabled extensions (via ENABLE command). */
  enabledExtensions: Set<string>;
}

/**
 * Represents a mailbox that is currently selected in a session.
 */
export interface SelectedMailbox {
  /** Mailbox name (e.g., "INBOX"). */
  name: string;
  /** Whether the mailbox is open read-only (EXAMINE vs SELECT). */
  readOnly: boolean;
  /** UIDVALIDITY value per RFC 9051 Section 2.3.1.1. */
  uidValidity: number;
  /** Predicted next UID. */
  uidNext: number;
}

// ─── Server Configuration ───────────────────────────────────────────────────

/**
 * IMAP server configuration options.
 */
export interface ImapServerConfig {
  /** Bind address for the server. */
  host: string;
  /** Port for IMAP with STARTTLS (default: 143). */
  port: number;
  /** Port for implicit TLS / IMAPS (default: 993). */
  tlsPort: number;
  /** Server hostname used in greeting and responses. */
  hostname: string;
  /** TLS certificate/key configuration. */
  tls?: TlsConfig;
  /** Maximum number of concurrent client connections. */
  maxConnections: number;
  /** Connection timeout in milliseconds (idle connections). */
  connectionTimeout: number;
  /** Socket read timeout in milliseconds. */
  socketTimeout: number;
  /** Maximum number of failed auth attempts before disconnect. */
  maxFailedAuth: number;
  /** Maximum line length accepted from clients (bytes). */
  maxLineLength: number;
  /** Maximum literal size accepted from clients (bytes). */
  maxLiteralSize: number;
}

export interface TlsConfig {
  key: string;
  cert: string;
  ca?: string;
  minVersion: "TLSv1.2" | "TLSv1.3";
  ciphers?: string;
}

// ─── Mailbox Types ──────────────────────────────────────────────────────────

/**
 * IMAP mailbox representation with status counters.
 * Mapped from the shared JMAP mailbox storage.
 */
export interface ImapMailbox {
  /** Mailbox name using IMAP hierarchy (e.g., "INBOX", "Folder/Subfolder"). */
  name: string;
  /** UIDVALIDITY value. Changes if mailbox UIDs are renumbered. */
  uidValidity: number;
  /** Predicted next UID to be assigned. */
  uidNext: number;
  /** Total number of messages in the mailbox. */
  messageCount: number;
  /** Number of messages with the \Recent flag. */
  recentCount: number;
  /** Number of messages without the \Seen flag. */
  unseenCount: number;
  /** Sequence number of the first unseen message, or null if all seen. */
  firstUnseen: number | null;
  /** Flags defined for this mailbox. */
  flags: string[];
  /** Permanent flags that can be set by the client. */
  permanentFlags: string[];
  /** Hierarchy delimiter character (typically "/"). */
  delimiter: string;
  /** Mailbox attributes (e.g., \Noselect, \HasChildren). */
  attributes: string[];
}

// ─── Message Types ──────────────────────────────────────────────────────────

/**
 * Represents an email message in IMAP format.
 */
export interface ImapMessage {
  /** Unique identifier within the mailbox. */
  uid: number;
  /** Sequence number (position in the mailbox, 1-based). */
  sequenceNumber: number;
  /** Message flags (e.g., \Seen, \Flagged, \Deleted). */
  flags: string[];
  /** Date/time the message was received by the server (INTERNALDATE). */
  internalDate: Date;
  /** Size of the message in octets (RFC822.SIZE). */
  size: number;
  /** Parsed envelope structure per RFC 9051 Section 7.5.2. */
  envelope: ImapEnvelope;
  /** MIME body structure per RFC 9051 Section 7.5.2. */
  bodyStructure: ImapBodyStructure;
}

/**
 * IMAP ENVELOPE structure per RFC 9051 Section 7.5.2.
 */
export interface ImapEnvelope {
  /** Date header value. */
  date: string | null;
  /** Subject header value. */
  subject: string | null;
  /** From addresses. */
  from: ImapAddress[];
  /** Sender addresses (usually same as from). */
  sender: ImapAddress[];
  /** Reply-To addresses. */
  replyTo: ImapAddress[];
  /** To addresses. */
  to: ImapAddress[];
  /** Cc addresses. */
  cc: ImapAddress[];
  /** Bcc addresses. */
  bcc: ImapAddress[];
  /** In-Reply-To header. */
  inReplyTo: string | null;
  /** Message-ID header. */
  messageId: string | null;
}

/**
 * IMAP address structure (name, route, mailbox, host).
 */
export interface ImapAddress {
  /** Display name. */
  name: string | null;
  /** Source route (usually null, deprecated by RFC 5321). */
  route: string | null;
  /** Local part of the email address. */
  mailbox: string | null;
  /** Domain part of the email address. */
  host: string | null;
}

/**
 * MIME body structure for IMAP BODYSTRUCTURE response.
 */
export interface ImapBodyStructure {
  /** MIME type (e.g., "text"). */
  type: string;
  /** MIME subtype (e.g., "plain"). */
  subtype: string;
  /** Body parameters (e.g., charset). */
  params: Record<string, string>;
  /** Content-ID. */
  id: string | null;
  /** Content-Description. */
  description: string | null;
  /** Content-Transfer-Encoding (e.g., "7bit", "base64"). */
  encoding: string;
  /** Size in octets. */
  size: number;
  /** Number of text lines (only for text/* types). */
  lines?: number;
  /** Nested parts for multipart types. */
  parts?: ImapBodyStructure[];
  /** Content-Disposition. */
  disposition?: { type: string; params: Record<string, string> } | null;
}

// ─── Fetch Types ────────────────────────────────────────────────────────────

/**
 * Specifies what data to retrieve in a FETCH command.
 */
export interface ImapFetchItem {
  /** Fetch the message flags. */
  flags: boolean;
  /** Fetch the envelope structure. */
  envelope: boolean;
  /** Fetch the body structure (BODYSTRUCTURE). */
  bodyStructure: boolean;
  /** Fetch the internal date. */
  internalDate: boolean;
  /** Fetch the message size (RFC822.SIZE). */
  size: boolean;
  /** Fetch the UID. */
  uid: boolean;
  /** Fetch specific body sections (e.g., BODY[HEADER], BODY[1]). */
  bodySections: ImapBodySection[];
  /** Fetch the full message (RFC822). */
  rfc822: boolean;
  /** Fetch just the headers (RFC822.HEADER). */
  rfc822Header: boolean;
  /** Fetch just the text (RFC822.TEXT). */
  rfc822Text: boolean;
}

/**
 * Specifies a body section to fetch (e.g., BODY[HEADER.FIELDS (FROM TO)]).
 */
export interface ImapBodySection {
  /** Section specifier (e.g., "HEADER", "TEXT", "1", "1.MIME"). */
  section: string;
  /** Specific header fields to fetch (for HEADER.FIELDS). */
  headerFields?: string[];
  /** Whether to negate header fields (HEADER.FIELDS.NOT). */
  headerFieldsNot: boolean;
  /** Partial fetch: starting octet. */
  partialStart?: number;
  /** Partial fetch: number of octets. */
  partialCount?: number;
  /** Whether this is a BODY.PEEK (does not set \Seen flag). */
  peek: boolean;
}

// ─── Search Types ───────────────────────────────────────────────────────────

/**
 * IMAP SEARCH criteria per RFC 9051 Section 6.4.4.
 * Criteria can be combined with AND (default) and OR.
 */
export type ImapSearchCriteria =
  | { type: "all" }
  | { type: "answered" }
  | { type: "deleted" }
  | { type: "draft" }
  | { type: "flagged" }
  | { type: "new" }
  | { type: "old" }
  | { type: "recent" }
  | { type: "seen" }
  | { type: "unanswered" }
  | { type: "undeleted" }
  | { type: "undraft" }
  | { type: "unflagged" }
  | { type: "unseen" }
  | { type: "bcc"; value: string }
  | { type: "before"; value: Date }
  | { type: "body"; value: string }
  | { type: "cc"; value: string }
  | { type: "from"; value: string }
  | { type: "keyword"; value: string }
  | { type: "larger"; value: number }
  | { type: "on"; value: Date }
  | { type: "sentbefore"; value: Date }
  | { type: "senton"; value: Date }
  | { type: "sentsince"; value: Date }
  | { type: "since"; value: Date }
  | { type: "smaller"; value: number }
  | { type: "subject"; value: string }
  | { type: "text"; value: string }
  | { type: "to"; value: string }
  | { type: "uid"; value: string }
  | { type: "unkeyword"; value: string }
  | { type: "header"; name: string; value: string }
  | { type: "not"; criteria: ImapSearchCriteria }
  | { type: "or"; left: ImapSearchCriteria; right: ImapSearchCriteria }
  | { type: "and"; criteria: ImapSearchCriteria[] }
  | { type: "sequenceSet"; value: string };

// ─── Response Types ─────────────────────────────────────────────────────────

/**
 * IMAP response status codes per RFC 9051 Section 7.1.
 */
export type ImapResponseStatus = "OK" | "NO" | "BAD" | "BYE" | "PREAUTH";

/**
 * An IMAP response line (tagged, untagged, or continuation).
 */
export interface ImapResponse {
  /** The tag ("*" for untagged, "+" for continuation, or a command tag). */
  tag: string;
  /** Response status (OK, NO, BAD). Only for status responses. */
  status?: ImapResponseStatus;
  /** Optional response code in brackets (e.g., [UIDVALIDITY 12345]). */
  code?: string;
  /** The response text/data. */
  text: string;
}

// ─── IMAP Server Events ────────────────────────────────────────────────────

export interface ImapServerEvents {
  connection: [session: ImapSession];
  authenticate: [username: string, session: ImapSession];
  select: [mailbox: string, session: ImapSession];
  fetch: [sequenceSet: string, session: ImapSession];
  error: [error: Error, session?: ImapSession];
  close: [session: ImapSession];
  listening: [address: { host: string; port: number }];
}

// ─── Store Operation ────────────────────────────────────────────────────────

/**
 * Represents a STORE command operation on message flags.
 */
export type StoreAction = "FLAGS" | "+FLAGS" | "-FLAGS";

export interface StoreOperation {
  /** The action to perform. */
  action: StoreAction;
  /** Whether to suppress the untagged FETCH response (.SILENT). */
  silent: boolean;
  /** The flags to set/add/remove. */
  flags: string[];
}

// ─── Namespace ──────────────────────────────────────────────────────────────

/**
 * IMAP NAMESPACE response per RFC 2342.
 */
export interface ImapNamespace {
  /** Personal namespaces. */
  personal: NamespaceEntry[];
  /** Other users' namespaces. */
  otherUsers: NamespaceEntry[];
  /** Shared namespaces. */
  shared: NamespaceEntry[];
}

export interface NamespaceEntry {
  /** Namespace prefix (e.g., "", "INBOX."). */
  prefix: string;
  /** Hierarchy delimiter (e.g., "/", "."). */
  delimiter: string;
}

// ─── Well-Known IMAP Flags ──────────────────────────────────────────────────

export const SYSTEM_FLAGS = [
  "\\Seen",
  "\\Answered",
  "\\Flagged",
  "\\Deleted",
  "\\Draft",
  "\\Recent",
] as const;

export type SystemFlag = (typeof SYSTEM_FLAGS)[number];

// ─── Default Capabilities ───────────────────────────────────────────────────

/**
 * Default IMAP capabilities advertised by the server.
 * Per RFC 9051 (IMAP4rev2) and backward-compatible extensions.
 */
export const DEFAULT_CAPABILITIES = [
  "IMAP4rev1",
  "IMAP4rev2",
  "LITERAL+",
  "IDLE",
  "NAMESPACE",
  "ID",
  "ENABLE",
  "UIDPLUS",
  "MOVE",
  "UNSELECT",
  "CHILDREN",
  "LIST-EXTENDED",
  "SASL-IR",
  "AUTH=PLAIN",
  "STARTTLS",
] as const;
