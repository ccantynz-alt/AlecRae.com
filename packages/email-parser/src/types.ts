/** A parsed email address with optional display name. */
export interface ParsedAddress {
  readonly name?: string;
  readonly address: string;
}

/** A single MIME part within a multipart message. */
export interface MimePart {
  readonly headers: ReadonlyMap<string, string>;
  readonly contentType: string;
  readonly charset?: string;
  readonly encoding?: string;
  readonly body: string;
  readonly parts?: readonly MimePart[];
}

/** A parsed email attachment. */
export interface ParsedAttachment {
  readonly filename: string;
  readonly contentType: string;
  /** Raw content (decoded from transfer encoding) */
  readonly content: Uint8Array;
  readonly size: number;
  readonly contentId?: string;
  readonly disposition: "attachment" | "inline";
}

/** Complete parsed email message. */
export interface ParsedEmail {
  readonly messageId: string;
  readonly from: ParsedAddress;
  readonly to: readonly ParsedAddress[];
  readonly cc: readonly ParsedAddress[];
  readonly bcc: readonly ParsedAddress[];
  readonly replyTo?: ParsedAddress;
  readonly subject: string;
  readonly date?: Date;
  readonly inReplyTo?: string;
  readonly references: readonly string[];
  readonly textBody?: string;
  readonly htmlBody?: string;
  readonly attachments: readonly ParsedAttachment[];
  readonly headers: ReadonlyMap<string, string[]>;
  readonly rawHeaders: string;
  readonly rawBody: string;
}

/** Options for email building. */
export interface EmailBuildOptions {
  /** Whether to generate a Message-ID automatically. Default: true */
  readonly autoMessageId?: boolean;
  /** Whether to set Date header automatically. Default: true */
  readonly autoDate?: boolean;
  /** Domain for Message-ID generation. */
  readonly messageDomain?: string;
}
