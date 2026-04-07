/** RFC 5322 compliant email address with optional display name. */
export interface EmailAddress {
    /** Display name, e.g. "Alice Smith" */
    readonly name?: string;
    /** Email address, e.g. "alice@example.com" */
    readonly address: string;
}
/** Standard and custom email headers. */
export interface EmailHeaders {
    readonly messageId: string;
    readonly from: EmailAddress;
    readonly to: readonly EmailAddress[];
    readonly cc?: readonly EmailAddress[];
    readonly bcc?: readonly EmailAddress[];
    readonly replyTo?: EmailAddress;
    readonly subject: string;
    readonly date: Date;
    readonly inReplyTo?: string;
    readonly references?: readonly string[];
    /** MIME version, typically "1.0" */
    readonly mimeVersion?: string;
    readonly contentType?: string;
    /** Custom headers as key-value pairs */
    readonly custom?: Readonly<Record<string, string>>;
}
/** Email attachment with content and metadata. */
export interface Attachment {
    readonly filename: string;
    /** MIME type, e.g. "application/pdf" */
    readonly contentType: string;
    /** Base64-encoded content */
    readonly content: string;
    /** Size in bytes */
    readonly size: number;
    /** Content-ID for inline attachments */
    readonly contentId?: string;
    /** "attachment" or "inline" */
    readonly disposition: "attachment" | "inline";
}
/**
 * Tracks the lifecycle of an email from acceptance through delivery.
 *
 * Flow: queued -> processing -> sent -> delivered
 * Error states can branch at processing or sent.
 */
export type EmailStatus = "queued" | "processing" | "sent" | "delivered" | "bounced" | "deferred" | "dropped" | "failed" | "complained";
/** Result of attempting to deliver an email to a single recipient. */
export interface DeliveryResult {
    readonly recipient: EmailAddress;
    readonly status: EmailStatus;
    /** Remote MTA response code */
    readonly remoteResponseCode?: number;
    /** Remote MTA response message */
    readonly remoteResponse?: string;
    /** MX host that accepted (or rejected) the message */
    readonly mxHost?: string;
    readonly attemptCount: number;
    readonly firstAttemptAt: Date;
    readonly lastAttemptAt: Date;
    readonly deliveredAt?: Date;
}
/** A complete email message with all metadata. */
export interface EmailMessage {
    /** Internal unique identifier */
    readonly id: string;
    /** Account that sent this message */
    readonly accountId: string;
    /** Domain used for sending */
    readonly domainId: string;
    readonly headers: EmailHeaders;
    /** Plain text body */
    readonly textBody?: string;
    /** HTML body */
    readonly htmlBody?: string;
    readonly attachments: readonly Attachment[];
    readonly status: EmailStatus;
    readonly deliveryResults: readonly DeliveryResult[];
    /** Tags for categorization and filtering */
    readonly tags: readonly string[];
    /** Arbitrary metadata set by the sender */
    readonly metadata?: Readonly<Record<string, string>>;
    readonly createdAt: Date;
    readonly updatedAt: Date;
    /** Scheduled send time; null means send immediately */
    readonly scheduledAt?: Date;
}
//# sourceMappingURL=email.d.ts.map