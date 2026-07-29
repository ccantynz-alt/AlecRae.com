/**
 * Header-value sanitisation for outbound mail.
 *
 * Issue #124 fixed CRLF injection on the `/v1/messages/send` path: a subject
 * like `"Hi\r\nBcc: victim@example.com"` became a genuine Bcc header on a
 * message we DKIM-sign and relay from our own IP. That fix guarded the schema
 * boundary and added a defensive strip inside `messages.ts`'s own message
 * builder.
 *
 * It did not cover `lib/agent-send.ts`, which has a SECOND RFC-5322 builder of
 * its own and wrote every header value straight through. The AI agent's draft
 * subject is generated from the content of an incoming email, so the value is
 * attacker-influenced by prompt injection rather than attacker-supplied
 * directly — which is exactly the reasoning that makes per-producer analysis
 * the wrong approach. Whether a given producer *can* emit a newline is a
 * question you get wrong once; stripping at the point of use is a question you
 * answer once.
 *
 * Shared rather than copied so a third message builder inherits it instead of
 * re-deriving it. Duplication is how the agent path came to be missed.
 */

/**
 * Make a value safe to write on a single header line.
 *
 * CR, LF and NUL are replaced with a space rather than removed: deleting them
 * silently joins words that were on separate lines, which changes the meaning
 * of a subject a user wrote. A space preserves the reading.
 */
export function headerValue(raw: string): string {
  // eslint-disable-next-line no-control-regex -- stripping CR/LF/NUL is the point
  return raw.replace(/[\r\n\u0000]/g, " ").trim();
}
