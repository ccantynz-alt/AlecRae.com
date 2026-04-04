/**
 * Inbound email processing types.
 */

export interface EmailAddress {
  name?: string;
  address: string;
}

export interface MimeHeader {
  key: string;
  value: string;
  params?: Record<string, string>;
}

export interface ParsedAttachment {
  filename: string;
  contentType: string;
  contentDisposition: "attachment" | "inline";
  contentId?: string;
  size: number;
  content: Uint8Array;
  checksum: string;
}

export interface ParsedEmail {
  messageId: string;
  date?: Date;
  from: EmailAddress[];
  to: EmailAddress[];
  cc: EmailAddress[];
  bcc: EmailAddress[];
  replyTo: EmailAddress[];
  subject: string;
  inReplyTo?: string;
  references: string[];
  headers: MimeHeader[];
  text?: string;
  html?: string;
  attachments: ParsedAttachment[];
  rawSize: number;
}

export interface SmtpSession {
  id: string;
  remoteAddress: string;
  remotePort: number;
  clientHostname?: string;
  heloHostname?: string;
  secure: boolean;
  mailFrom?: string;
  rcptTo: string[];
  authenticatedUser?: string;
  startedAt: Date;
}

export interface SmtpEnvelope {
  mailFrom: string;
  rcptTo: string[];
}

export interface InboundMessage {
  id: string;
  envelope: SmtpEnvelope;
  session: SmtpSession;
  parsed: ParsedEmail;
  rawData: Uint8Array;
  receivedAt: Date;
}

export interface AuthenticationResult {
  method: "spf" | "dkim" | "dmarc" | "arc";
  result: "pass" | "fail" | "softfail" | "neutral" | "none" | "temperror" | "permerror";
  domain?: string;
  selector?: string;
  details?: string;
}

export interface FilterVerdict {
  action: "accept" | "reject" | "quarantine" | "defer";
  reason?: string;
  score?: number;
  flags: Set<string>;
  authResults: AuthenticationResult[];
}

export interface RoutingRule {
  id: string;
  pattern: string;
  type: "exact" | "prefix" | "regex" | "catch-all";
  action: "deliver" | "forward" | "reject" | "drop";
  destination: string;
  priority: number;
}

export interface ResolvedRecipient {
  originalAddress: string;
  resolvedAddress: string;
  mailboxId: string;
  accountId: string;
  rule: RoutingRule;
}

export interface StoredEmail {
  id: string;
  accountId: string;
  mailboxId: string;
  messageId: string;
  threadId?: string;
  from: EmailAddress | EmailAddress[];
  to: EmailAddress[];
  cc: EmailAddress[];
  bcc?: EmailAddress[];
  replyTo?: EmailAddress | EmailAddress[];
  subject: string;
  snippet: string;
  textBody?: string;
  htmlBody?: string;
  attachments?: Array<{
    id: string;
    filename: string;
    contentType: string;
    size: number;
    contentId?: string;
  }>;
  hasAttachments?: boolean;
  size: number;
  flags: Set<string>;
  labels: string[];
  headers?: Record<string, string> | MimeHeader[];
  filterVerdict?: FilterVerdict;
  receivedAt: Date;
  internalDate: Date;
}
