/**
 * Typed SMTP errors for the inbound pipeline.
 *
 * Before this existed, every throw from message handling became
 * `451 Temporary failure: <reason>` on the wire. That was wrong twice over:
 *
 *  1. A permanent rejection (spam) answered 451 tells a conforming sender to
 *     retry — so rejected spam was redelivered for days instead of being
 *     refused once with a 550.
 *  2. The verbatim reason (including the spam score and which filter fired)
 *     went back to the sender — a tuning oracle a spammer can iterate against.
 *
 * The wire response now carries only a generic, code-appropriate phrase.
 * Full detail (verdict reason, score, stage) goes to the logs, where it
 * belongs.
 */

/** SMTP verdict error carrying the wire response code + generic message. */
export class SmtpError extends Error {
  /** SMTP reply code to send on the wire (e.g. 550, 451). */
  readonly code: number;

  constructor(code: number, message: string) {
    super(message);
    this.name = "SmtpError";
    this.code = code;
  }
}

/**
 * Permanent rejection (e.g. spam filter verdict). Deliberately generic on the
 * wire — the real reason is logged server-side only.
 */
export function smtpReject(): SmtpError {
  return new SmtpError(550, "5.7.1 Message rejected");
}

/**
 * Temporary failure (filter pipeline error / defer verdict). Tells a
 * conforming sender to retry later; the message is NOT stored.
 */
export function smtpDefer(): SmtpError {
  return new SmtpError(451, "4.7.1 Temporary failure, try again later");
}
