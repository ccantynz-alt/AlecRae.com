/**
 * SMTP response codes per RFC 5321.
 * Organized by category for clarity.
 */
export declare const SMTP_RESPONSE_CODES: {
    readonly SYSTEM_STATUS: 211;
    readonly HELP_MESSAGE: 214;
    readonly SERVICE_READY: 220;
    readonly SERVICE_CLOSING: 221;
    readonly AUTH_SUCCESS: 235;
    readonly OK: 250;
    readonly USER_NOT_LOCAL_WILL_FORWARD: 251;
    readonly CANNOT_VERIFY_USER: 252;
    readonly AUTH_CONTINUE: 334;
    readonly START_MAIL_INPUT: 354;
    readonly SERVICE_NOT_AVAILABLE: 421;
    readonly MAILBOX_BUSY: 450;
    readonly LOCAL_ERROR: 451;
    readonly INSUFFICIENT_STORAGE: 452;
    readonly TEMP_AUTH_FAILURE: 454;
    readonly PARAMETERS_NOT_ACCOMMODATED: 455;
    readonly SYNTAX_ERROR: 500;
    readonly SYNTAX_ERROR_PARAMETERS: 501;
    readonly COMMAND_NOT_IMPLEMENTED: 502;
    readonly BAD_SEQUENCE: 503;
    readonly PARAMETER_NOT_IMPLEMENTED: 504;
    readonly AUTH_REQUIRED: 530;
    readonly AUTH_FAILED: 535;
    readonly MAILBOX_NOT_FOUND: 550;
    readonly USER_NOT_LOCAL: 551;
    readonly EXCEEDED_STORAGE: 552;
    readonly MAILBOX_NAME_INVALID: 553;
    readonly TRANSACTION_FAILED: 554;
    readonly PARAMETERS_NOT_RECOGNIZED: 555;
};
export type SmtpResponseCode = (typeof SMTP_RESPONSE_CODES)[keyof typeof SMTP_RESPONSE_CODES];
/** SMTP command verbs. */
export declare const SMTP_COMMANDS: {
    readonly EHLO: "EHLO";
    readonly HELO: "HELO";
    readonly MAIL_FROM: "MAIL FROM";
    readonly RCPT_TO: "RCPT TO";
    readonly DATA: "DATA";
    readonly QUIT: "QUIT";
    readonly RSET: "RSET";
    readonly NOOP: "NOOP";
    readonly VRFY: "VRFY";
    readonly EXPN: "EXPN";
    readonly HELP: "HELP";
    readonly STARTTLS: "STARTTLS";
    readonly AUTH: "AUTH";
};
export type SmtpCommand = (typeof SMTP_COMMANDS)[keyof typeof SMTP_COMMANDS];
/** Standard SMTP/submission port numbers. */
export declare const SMTP_PORTS: {
    /** Standard SMTP relay port */
    readonly SMTP: 25;
    /** SMTP submission (STARTTLS) */
    readonly SUBMISSION: 587;
    /** SMTP submission (implicit TLS) */
    readonly SUBMISSIONS: 465;
};
/** Timeout values in milliseconds for SMTP operations. */
export declare const SMTP_TIMEOUTS: {
    /** Initial connection timeout */
    readonly CONNECT: 30000;
    /** Waiting for server greeting */
    readonly GREETING: 30000;
    /** EHLO/HELO command */
    readonly EHLO: 30000;
    /** STARTTLS negotiation */
    readonly TLS: 30000;
    /** AUTH command */
    readonly AUTH: 60000;
    /** MAIL FROM command */
    readonly MAIL_FROM: 30000;
    /** RCPT TO command */
    readonly RCPT_TO: 30000;
    /** DATA command (initial response) */
    readonly DATA_INIT: 120000;
    /** DATA block transfer */
    readonly DATA_BLOCK: 180000;
    /** Final "." response after DATA */
    readonly DATA_DONE: 600000;
    /** QUIT command */
    readonly QUIT: 10000;
    /** Time between retries for deferred messages */
    readonly RETRY_BASE: 60000;
};
/** Maximum number of retry attempts for deferred messages. */
export declare const SMTP_MAX_RETRIES = 8;
/** Maximum line length per RFC 5321 (including CRLF). */
export declare const SMTP_MAX_LINE_LENGTH = 998;
/** Maximum command line length per RFC 5321. */
export declare const SMTP_MAX_COMMAND_LENGTH = 512;
/** Maximum reply line length per RFC 5321. */
export declare const SMTP_MAX_REPLY_LENGTH = 512;
/** Maximum number of recipients per SMTP transaction. */
export declare const SMTP_MAX_RECIPIENTS = 100;
/** CRLF line ending required by SMTP. */
export declare const CRLF = "\r\n";
//# sourceMappingURL=smtp.d.ts.map