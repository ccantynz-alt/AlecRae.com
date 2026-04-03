/**
 * SMTP response codes per RFC 5321.
 * Organized by category for clarity.
 */
export const SMTP_RESPONSE_CODES = {
  // 2xx - Success
  SYSTEM_STATUS: 211,
  HELP_MESSAGE: 214,
  SERVICE_READY: 220,
  SERVICE_CLOSING: 221,
  AUTH_SUCCESS: 235,
  OK: 250,
  USER_NOT_LOCAL_WILL_FORWARD: 251,
  CANNOT_VERIFY_USER: 252,

  // 3xx - Intermediate
  AUTH_CONTINUE: 334,
  START_MAIL_INPUT: 354,

  // 4xx - Transient failure
  SERVICE_NOT_AVAILABLE: 421,
  MAILBOX_BUSY: 450,
  LOCAL_ERROR: 451,
  INSUFFICIENT_STORAGE: 452,
  TEMP_AUTH_FAILURE: 454,
  PARAMETERS_NOT_ACCOMMODATED: 455,

  // 5xx - Permanent failure
  SYNTAX_ERROR: 500,
  SYNTAX_ERROR_PARAMETERS: 501,
  COMMAND_NOT_IMPLEMENTED: 502,
  BAD_SEQUENCE: 503,
  PARAMETER_NOT_IMPLEMENTED: 504,
  AUTH_REQUIRED: 530,
  AUTH_FAILED: 535,
  MAILBOX_NOT_FOUND: 550,
  USER_NOT_LOCAL: 551,
  EXCEEDED_STORAGE: 552,
  MAILBOX_NAME_INVALID: 553,
  TRANSACTION_FAILED: 554,
  PARAMETERS_NOT_RECOGNIZED: 555,
} as const;

export type SmtpResponseCode =
  (typeof SMTP_RESPONSE_CODES)[keyof typeof SMTP_RESPONSE_CODES];

/** SMTP command verbs. */
export const SMTP_COMMANDS = {
  EHLO: "EHLO",
  HELO: "HELO",
  MAIL_FROM: "MAIL FROM",
  RCPT_TO: "RCPT TO",
  DATA: "DATA",
  QUIT: "QUIT",
  RSET: "RSET",
  NOOP: "NOOP",
  VRFY: "VRFY",
  EXPN: "EXPN",
  HELP: "HELP",
  STARTTLS: "STARTTLS",
  AUTH: "AUTH",
} as const;

export type SmtpCommand = (typeof SMTP_COMMANDS)[keyof typeof SMTP_COMMANDS];

/** Standard SMTP/submission port numbers. */
export const SMTP_PORTS = {
  /** Standard SMTP relay port */
  SMTP: 25,
  /** SMTP submission (STARTTLS) */
  SUBMISSION: 587,
  /** SMTP submission (implicit TLS) */
  SUBMISSIONS: 465,
} as const;

/** Timeout values in milliseconds for SMTP operations. */
export const SMTP_TIMEOUTS = {
  /** Initial connection timeout */
  CONNECT: 30_000,
  /** Waiting for server greeting */
  GREETING: 30_000,
  /** EHLO/HELO command */
  EHLO: 30_000,
  /** STARTTLS negotiation */
  TLS: 30_000,
  /** AUTH command */
  AUTH: 60_000,
  /** MAIL FROM command */
  MAIL_FROM: 30_000,
  /** RCPT TO command */
  RCPT_TO: 30_000,
  /** DATA command (initial response) */
  DATA_INIT: 120_000,
  /** DATA block transfer */
  DATA_BLOCK: 180_000,
  /** Final "." response after DATA */
  DATA_DONE: 600_000,
  /** QUIT command */
  QUIT: 10_000,
  /** Time between retries for deferred messages */
  RETRY_BASE: 60_000,
} as const;

/** Maximum number of retry attempts for deferred messages. */
export const SMTP_MAX_RETRIES = 8;

/** Maximum line length per RFC 5321 (including CRLF). */
export const SMTP_MAX_LINE_LENGTH = 998;

/** Maximum command line length per RFC 5321. */
export const SMTP_MAX_COMMAND_LENGTH = 512;

/** Maximum reply line length per RFC 5321. */
export const SMTP_MAX_REPLY_LENGTH = 512;

/** Maximum number of recipients per SMTP transaction. */
export const SMTP_MAX_RECIPIENTS = 100;

/** CRLF line ending required by SMTP. */
export const CRLF = "\r\n";
