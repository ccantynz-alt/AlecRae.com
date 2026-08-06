/**
 * Stable conversation identity for a message (Known Issue #76b).
 *
 * `emails` has no `threadId` column, so nothing in the API ever told the client
 * which messages belong to the same conversation. Thread muting fell back to
 * using the *message* id as the thread id — the inbox literally checked
 * `mutedIds.has(email.id)` — so muting a thread muted exactly one message and
 * every reply arrived unmuted. The feature could not do the one thing its name
 * promises.
 *
 * Adding a column would be a schema migration, which is Craig's call under
 * Boss Rule #7. It is also unnecessary: RFC 5322 already carries the answer in
 * headers we persist.
 *
 * ── How the key is derived ──────────────────────────────────────────────────
 * `References` holds the ancestor chain, oldest first, so `references[0]` is
 * the message that started the thread. A message with no ancestors is itself
 * the root. Hence:
 *
 *     references[0]  ??  inReplyTo  ??  own messageId
 *
 * Every message in a chain resolves to the same root id, including the root
 * itself, which is what makes the key stable and shared. A direct reply whose
 * client omitted `References` still lands on the right value through
 * `inReplyTo`, because its parent — having no ancestors — keys on its own id.
 *
 * This is header-derived, so it inherits the limits of the headers: a client
 * that sends neither header starts a new thread, and a "reply" composed by
 * changing the subject of an unrelated message will not join. Both are how
 * every other mail client behaves, because both are all the message says.
 */

export interface ThreadKeyInput {
  /** The message's own RFC 5322 Message-ID. */
  readonly messageId: string;
  /** The In-Reply-To header, if any. */
  readonly inReplyTo?: string | null;
  /** The References header chain, oldest first, if any. */
  readonly references?: string[] | null;
}

/**
 * Resolve the conversation key for one message.
 *
 * Never returns empty: a message always has its own id to fall back on, so
 * every message belongs to exactly one thread even when the headers are absent
 * or malformed.
 */
export function threadKeyFor(input: ThreadKeyInput): string {
  const root = input.references?.find(
    (ref) => typeof ref === "string" && ref.trim() !== "",
  );
  if (root !== undefined) return normalize(root);

  const parent = input.inReplyTo?.trim();
  if (parent !== undefined && parent !== "") return normalize(parent);

  return normalize(input.messageId);
}

/**
 * Message-IDs are conventionally written inside angle brackets and compared
 * without them. Stripping here means a chain whose headers disagree on the
 * convention — which happens between mail clients — still resolves to one key.
 */
function normalize(messageId: string): string {
  return messageId.trim().replace(/^</, "").replace(/>$/, "");
}
