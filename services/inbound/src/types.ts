/**
 * Inbound email processing types.
 */

export interface EmailAddress {
  name?: string | undefined;
  address: string;
}

export interface MimeHeader {
  key: string;
  value: string;
  params?: Record<string, string> | undefined;
}

export interface ParsedAttachment {
  filename: string;
  contentType: string;
  contentDisposition: "attachment" | "inline";
  contentId?: string | undefined;
  size: number;
  content: Uint8Array;
  checksum: string;
}

export interface ParsedEmail {
  messageId: string;
  date?: Date | undefined;
  from: EmailAddress[];
  to: EmailAddress[];
  cc: EmailAddress[];
  bcc: EmailAddress[];
  replyTo: EmailAddress[];
  subject: string;
  inReplyTo?: string | undefined;
  references: string[];
  headers: MimeHeader[];
  text?: string | undefined;
  html?: string | undefined;
  attachments: ParsedAttachment[];
  rawSize: number;
}

export interface SmtpSession {
  id: string;
  remoteAddress: string;
  remotePort: number;
  clientHostname?: string | undefined;
  heloHostname?: string | undefined;
  secure: boolean;
  mailFrom?: string | undefined;
  rcptTo: string[];
  authenticatedUser?: string | undefined;
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
  domain?: string | undefined;
  selector?: string | undefined;
  details?: string | undefined;
}

export interface FilterVerdict {
  action: "accept" | "reject" | "quarantine" | "defer";
  reason?: string | undefined;
  score?: number | undefined;
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
  threadId?: string | undefined;
  from: EmailAddress | EmailAddress[];
  to: EmailAddress[];
  cc: EmailAddress[];
  bcc?: EmailAddress[] | undefined;
  replyTo?: EmailAddress | EmailAddress[] | undefined;
  subject: string;
  snippet: string;
  textBody?: string | undefined;
  htmlBody?: string | undefined;
  attachments?: {
    id: string;
    filename: string;
    contentType: string;
    size: number;
    contentId?: string | undefined;
  }[] | undefined;
  hasAttachments?: boolean | undefined;
  size: number;
  flags: Set<string>;
  labels: string[];
  headers?: Record<string, string> | MimeHeader[] | undefined;
  filterVerdict?: FilterVerdict | undefined;
  receivedAt: Date;
  internalDate: Date;
}
