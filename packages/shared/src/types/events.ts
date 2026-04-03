/** All possible event types emitted by the platform. */
export type EmailEventType =
  | "email.queued"
  | "email.sent"
  | "email.delivered"
  | "email.bounced"
  | "email.deferred"
  | "email.dropped"
  | "email.failed"
  | "email.opened"
  | "email.clicked"
  | "email.unsubscribed"
  | "email.complained"
  | "domain.verified"
  | "domain.failed";

/** Bounce classification. */
export type BounceType = "hard" | "soft";

/** Bounce category for diagnostics. */
export type BounceCategory =
  | "unknown_user"
  | "mailbox_full"
  | "domain_not_found"
  | "policy_rejection"
  | "spam_block"
  | "rate_limited"
  | "protocol_error"
  | "content_rejected"
  | "authentication_failed"
  | "other";

/** Base fields shared by all events. */
export interface BaseEvent {
  readonly id: string;
  readonly accountId: string;
  readonly messageId: string;
  readonly type: EmailEventType;
  readonly timestamp: Date;
  readonly metadata?: Readonly<Record<string, string>>;
}

/** Generic email lifecycle event. */
export interface EmailEvent extends BaseEvent {
  readonly recipient: string;
  readonly tags?: readonly string[];
}

/** Delivery confirmation event. */
export interface DeliveryEvent extends BaseEvent {
  readonly type: "email.delivered";
  readonly recipient: string;
  readonly mxHost: string;
  readonly smtpResponse: string;
  /** Delivery latency in milliseconds from queue time */
  readonly deliveryTimeMs: number;
}

/** Bounce event with classification details. */
export interface BounceEvent extends BaseEvent {
  readonly type: "email.bounced";
  readonly recipient: string;
  readonly bounceType: BounceType;
  readonly bounceCategory: BounceCategory;
  readonly diagnosticCode?: string;
  readonly remoteMta?: string;
  readonly smtpResponse?: string;
}

/** Spam complaint event (feedback loop). */
export interface ComplaintEvent extends BaseEvent {
  readonly type: "email.complained";
  readonly recipient: string;
  readonly feedbackType: "abuse" | "fraud" | "virus" | "other";
  readonly feedbackProvider?: string;
  readonly originalMessageId?: string;
}

/** Click tracking event. */
export interface ClickEvent extends BaseEvent {
  readonly type: "email.clicked";
  readonly recipient: string;
  readonly url: string;
  readonly userAgent?: string;
  readonly ipAddress?: string;
}

/** Open tracking event. */
export interface OpenEvent extends BaseEvent {
  readonly type: "email.opened";
  readonly recipient: string;
  readonly userAgent?: string;
  readonly ipAddress?: string;
}

/** Webhook delivery payload sent to customer endpoints. */
export interface WebhookEvent {
  readonly id: string;
  readonly webhookId: string;
  readonly event: EmailEvent | DeliveryEvent | BounceEvent | ComplaintEvent | ClickEvent | OpenEvent;
  /** HMAC-SHA256 signature of the payload body */
  readonly signature: string;
  readonly timestamp: Date;
  /** Number of delivery attempts for this webhook event */
  readonly attemptCount: number;
}
