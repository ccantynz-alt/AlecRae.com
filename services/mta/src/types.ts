/**
 * @alecrae/mta - TypeScript type definitions
 * All types for the Mail Transfer Agent service.
 */

// ─── SMTP Types ──────────────────────────────────────────────────────────────

export const SMTP_COMMANDS = [
  "EHLO",
  "HELO",
  "MAIL",
  "RCPT",
  "DATA",
  "RSET",
  "NOOP",
  "QUIT",
  "STARTTLS",
  "AUTH",
  "VRFY",
  "EXPN",
  "HELP",
] as const;

export type SmtpCommand = (typeof SMTP_COMMANDS)[number];

export type SmtpState =
  | "GREETING"
  | "READY"
  | "MAIL_FROM"
  | "RCPT_TO"
  | "DATA"
  | "DATA_RECEIVING"
  | "QUIT"
  | "CLOSED";

export interface SmtpEnvelope {
  mailFrom: SmtpMailFrom | null;
  rcptTo: SmtpRcptTo[];
  data: string;
}

export interface SmtpMailFrom {
  address: string;
  params: Record<string, string>;
}

export interface SmtpRcptTo {
  address: string;
  params: Record<string, string>;
}

export interface SmtpParsedCommand {
  command: SmtpCommand | "UNKNOWN";
  argument: string;
  rawLine: string;
}

export interface SmtpResponse {
  code: number;
  enhanced?: string;
  message: string | string[];
  isMultiline: boolean;
}

export interface SmtpSession {
  id: string;
  remoteAddress: string;
  remotePort: number;
  state: SmtpState;
  ehlo: string | null;
  envelope: SmtpEnvelope;
  tls: boolean;
  authenticated: boolean;
  authUser: string | null;
  messageCount: number;
  startedAt: Date;
}

export interface SmtpServerConfig {
  host: string;
  port: number;
  hostname: string;
  maxMessageSize: number;
  maxRecipients: number;
  maxConnections: number;
  connectionTimeout: number;
  socketTimeout: number;
  banner: string;
  tls?: TlsConfig;
  requireAuth: boolean;
  enableStarttls: boolean;
}

export interface SmtpClientConfig {
  host: string;
  port: number;
  localHostname: string;
  connectTimeout: number;
  socketTimeout: number;
  greetingTimeout: number;
  opportunisticTls: boolean;
  requireTls: boolean;
  tlsOptions?: {
    rejectUnauthorized?: boolean;
    minVersion?: string;
  };
}

// ─── TLS Types ───────────────────────────────────────────────────────────────

export interface TlsConfig {
  key: string;
  cert: string;
  ca?: string;
  minVersion: "TLSv1.2" | "TLSv1.3";
  ciphers?: string;
}

export interface TlsCertificate {
  domain: string;
  keyPath: string;
  certPath: string;
  caPath?: string;
  expiresAt: Date;
  issuedAt: Date;
  issuer: string;
  fingerprint: string;
}

export interface TlsManagerConfig {
  certsDir: string;
  defaultMinVersion: "TLSv1.2" | "TLSv1.3";
  autoRenewDays: number;
}

// ─── DKIM Types ──────────────────────────────────────────────────────────────

export interface DkimSignOptions {
  domain: string;
  selector: string;
  privateKey: string;
  algorithm: "rsa-sha256";
  canonicalization: DkimCanonicalization;
  headersToSign: string[];
  bodyLengthLimit?: number;
}

export type DkimCanonicalization =
  | "simple/simple"
  | "simple/relaxed"
  | "relaxed/simple"
  | "relaxed/relaxed";

export interface DkimSignature {
  raw: string;
  headerValue: string;
  domain: string;
  selector: string;
  algorithm: string;
  bodyHash: string;
  signature: string;
  signedHeaders: string[];
  timestamp: number;
  expiration?: number;
}

export interface DkimVerificationResult {
  status: DkimStatus;
  domain: string;
  selector: string;
  error?: string;
  info?: string;
}

export type DkimStatus = "pass" | "fail" | "neutral" | "temperror" | "permerror" | "none";

// ─── SPF Types ───────────────────────────────────────────────────────────────

export type SpfResult = "pass" | "fail" | "softfail" | "neutral" | "none" | "temperror" | "permerror";

export interface SpfCheckResult {
  result: SpfResult;
  domain: string;
  explanation?: string;
  mechanismMatched?: string;
}

export type SpfMechanismType =
  | "all"
  | "include"
  | "a"
  | "mx"
  | "ptr"
  | "ip4"
  | "ip6"
  | "exists"
  | "redirect"
  | "exp";

export type SpfQualifier = "+" | "-" | "~" | "?";

export interface SpfMechanism {
  qualifier: SpfQualifier;
  type: SpfMechanismType;
  value: string;
}

export interface SpfRecord {
  version: "spf1";
  mechanisms: SpfMechanism[];
  raw: string;
}

// ─── DMARC Types ─────────────────────────────────────────────────────────────

export type DmarcPolicy = "none" | "quarantine" | "reject";

export type DmarcAlignment = "strict" | "relaxed";

export interface DmarcRecord {
  version: "DMARC1";
  policy: DmarcPolicy;
  subdomainPolicy?: DmarcPolicy | undefined;
  percentage: number;
  dkimAlignment: DmarcAlignment;
  spfAlignment: DmarcAlignment;
  reportingUris: string[];
  forensicUris: string[];
  reportInterval: number;
  failureOptions: string;
  raw: string;
}

export interface DmarcEvaluationResult {
  result: "pass" | "fail" | "none" | "temperror" | "permerror";
  policy: DmarcPolicy;
  appliedPolicy: DmarcPolicy;
  spfResult: SpfCheckResult;
  dkimResult: DkimVerificationResult;
  spfAligned: boolean;
  dkimAligned: boolean;
  fromDomain: string;
}

// ─── Bounce Types ────────────────────────────────────────────────────────────

export type BounceCategory = "hard" | "soft" | "block" | "transient" | "undetermined";

export type BounceType =
  | "invalid-recipient"
  | "mailbox-full"
  | "domain-not-found"
  | "connection-refused"
  | "spam-block"
  | "rate-limited"
  | "policy-violation"
  | "message-too-large"
  | "network-error"
  | "timeout"
  | "content-rejected"
  | "auth-failure"
  | "unknown";

export interface BounceInfo {
  category: BounceCategory;
  type: BounceType;
  statusCode: number;
  enhancedCode?: string;
  diagnosticCode?: string;
  recipient: string;
  remoteMta?: string;
  retryable: boolean;
  timestamp: Date;
}

// ─── Delivery Types ──────────────────────────────────────────────────────────

export interface DeliveryAttempt {
  id: string;
  messageId: string;
  recipient: string;
  mxHost: string;
  status: "pending" | "connecting" | "sending" | "delivered" | "deferred" | "bounced";
  attempts: number;
  maxAttempts: number;
  nextRetryAt: Date | null;
  lastError?: string;
  lastStatusCode?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface IspProfile {
  domain: string;
  maxConcurrentConnections: number;
  maxMessagesPerConnection: number;
  maxMessagesPerHour: number;
  maxMessagesPerDay: number;
  minConnectionInterval: number;
  preferredTls: boolean;
  supportsSmtpUtf8: boolean;
  notes: string;
}

export interface ConnectionPool {
  host: string;
  port: number;
  activeConnections: number;
  idleConnections: number;
  maxConnections: number;
  totalDelivered: number;
  lastActivityAt: Date;
}

export interface RetryStrategy {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  jitterFactor: number;
}

export interface ThrottleState {
  domain: string;
  messagesThisHour: number;
  messagesThisDay: number;
  connectionsActive: number;
  lastSendAt: Date | null;
  throttled: boolean;
  throttledUntil: Date | null;
}

// ─── Queue Types ─────────────────────────────────────────────────────────────

export type QueuePriority = 1 | 2 | 3 | 4 | 5;

export type QueueJobStatus =
  | "waiting"
  | "active"
  | "delayed"
  | "completed"
  | "failed"
  | "stalled";

export interface QueuedEmail {
  id: string;
  accountId: string;
  messageId: string;
  from: string;
  to: string[];
  rawMessage: string;
  priority: QueuePriority;
  attempts: number;
  maxAttempts: number;
  scheduledAt: Date;
  createdAt: Date;
  domain: string;
  metadata: Record<string, unknown>;
}

export interface QueueConfig {
  redisUrl: string;
  queueName: string;
  concurrency: number;
  defaultPriority: QueuePriority;
  maxRetries: number;
  retryDelay: number;
  stalledInterval: number;
  maxStalledCount: number;
}

// ─── Email Message Types ─────────────────────────────────────────────────────

export interface EmailHeader {
  key: string;
  value: string;
}

export interface ParsedEmail {
  headers: EmailHeader[];
  from: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  messageId: string;
  date: Date | null;
  body: string;
  rawHeaders: string;
  rawBody: string;
}

// ─── Server Types ────────────────────────────────────────────────────────────

export interface MtaConfig {
  smtp: SmtpServerConfig;
  client: SmtpClientConfig;
  tls: TlsManagerConfig;
  queue: QueueConfig;
  dkim: DkimSignOptions;
  delivery: {
    defaultRetryStrategy: RetryStrategy;
    maxConcurrentDeliveries: number;
  };
}

export interface MtaServerStatus {
  uptime: number;
  connections: number;
  messagesReceived: number;
  messagesSent: number;
  messagesQueued: number;
  messagesFailed: number;
  startedAt: Date;
}

// ─── Result Type ─────────────────────────────────────────────────────────────

export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}
