/**
 * Outbound Spam Gate — reputation protection on the send path.
 *
 * WHY THIS EXISTS
 * ---------------
 * Every other pre-send check protects the *recipient* or the *customer*:
 * suppression lists, CAN-SPAM/GDPR compliance, header-injection rejection,
 * warm-up limits, per-account quota. None of them look at what the message
 * actually says. So an authenticated account — a customer's own, or one that
 * has been compromised — could push 419/phishing content through the API and
 * we would sign it with DKIM and relay it from our sending IP. That is how a
 * sending domain gets blocklisted, and unlike a broken page, a blocklisting
 * is slow and expensive to undo. Issue #105 (nine days as an open relay,
 * actively abused) is the same failure mode arriving through a different door.
 *
 * `services/ai-engine`'s `SpamClassifier` was already built and tested for
 * this, with **zero production callers** — nothing but its own test file
 * imported it. This module wires it to the outbound path.
 *
 * WHICH LAYERS APPLY TO OUTBOUND MAIL
 * -----------------------------------
 * The classifier is designed for *inbound* mail and combines four layers.
 * Two of them are meaningless — and actively harmful — for a message we are
 * about to compose and send:
 *
 *   - Bayesian: an untrained model returns a flat `spamProbability: 0.5`
 *     (classifier.ts: `if (totalDocs === 0)`). No trained model is shipped or
 *     persisted anywhere, so including this layer would add a constant 0.5
 *     to every legitimate send — a false-positive floor that would block real
 *     customer mail. Weighted to 0 until a trained model actually exists.
 *   - Header: scores the Received chain and authentication results. An
 *     outbound message has neither yet (we are the first hop, and SPF/DKIM/
 *     DMARC are applied downstream by the MTA worker), so this layer would
 *     score a constant ~0.33 for the same reason. Weighted to 0.
 *
 * That leaves the content layer, which is the one that genuinely inspects
 * what is being sent: spam phrases, caps ratio, exclamation density,
 * URL shorteners, IP-literal hosts, embedded-credential URLs, excessive
 * subdomain depth and image-to-text ratio. Precisely the outbound-abuse
 * signals worth blocking on.
 *
 * Claude escalation is disabled: this sits on the synchronous send path, and
 * an LLM round trip per message is the wrong latency and cost profile.
 *
 * FAIL-OPEN
 * ---------
 * A classifier error must not stop a customer's mail — availability of a
 * legitimate send outranks a probabilistic check. Errors fail open and log
 * loudly, matching how `ai-quota.ts` degrades. The hard reputation controls
 * (warm-up limits, suppression, per-ISP throttles) are unaffected either way.
 */

import { SpamClassifier } from "@alecrae/ai-engine/spam";
import type { EmailMessage } from "@alecrae/ai-engine/types";

/**
 * Score at or above which a send is refused outright.
 * Content-only scoring is conservative — a legitimate transactional or
 * marketing message scores far below this; it takes a genuine pile-up of
 * spam signals to reach it.
 */
const DEFAULT_BLOCK_SCORE = 0.7;

/** Score at or above which a send proceeds but is recorded for review. */
const DEFAULT_REVIEW_SCORE = 0.45;

function envScore(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : fallback;
}

export interface OutboundSpamInput {
  messageId: string;
  accountId: string;
  from: string;
  to: string[];
  subject: string;
  text?: string | undefined;
  html?: string | undefined;
}

export interface OutboundSpamResult {
  /** False only when the content scored at or above the block threshold. */
  allowed: boolean;
  /** 0-1 composite from the content layer. Null when the check could not run. */
  score: number | null;
  /** True when the score warrants a look but not a block. */
  review: boolean;
  /** Human-readable signals behind the score, for the error body and logs. */
  reasons: string[];
  /** True when the classifier failed and the send was allowed through. */
  degraded: boolean;
}

/**
 * Content-only classifier. Constructed once — it is stateless with the
 * Bayesian layer disabled, so there is nothing per-request to build.
 */
const classifier = new SpamClassifier(undefined, {
  disableClaude: true,
  weights: { bayesian: 0, header: 0, content: 1, claude: 0 },
});

/** Split an address into the { address, domain } shape the classifier expects. */
function addr(address: string): { address: string; domain: string } {
  const at = address.lastIndexOf("@");
  return { address, domain: at >= 0 ? address.slice(at + 1).toLowerCase() : "" };
}

/** Build the classifier's inbound-shaped input from an outbound draft. */
function toEmailMessage(input: OutboundSpamInput): EmailMessage {
  const body = input.text ?? "";
  const html = input.html ?? "";
  return {
    id: input.messageId,
    accountId: input.accountId,
    headers: {
      messageId: input.messageId,
      from: addr(input.from),
      to: input.to.map(addr),
      subject: input.subject,
      date: new Date(),
      // Genuinely empty for a message we have not sent yet — see the header-
      // layer note above, which is why that layer is weighted to 0.
      receivedChain: [],
      raw: new Map<string, readonly string[]>(),
    },
    content: {
      ...(body ? { textBody: body } : {}),
      ...(html ? { htmlBody: html } : {}),
      attachments: [],
      inlineImages: [],
    },
    size: body.length + html.length,
    receivedAt: new Date(),
  } as EmailMessage;
}

/**
 * Score an outbound message and decide whether to relay it.
 *
 * Never throws: a failure returns `allowed: true, degraded: true` so a
 * classifier problem cannot take down sending.
 */
export async function checkOutboundSpam(
  input: OutboundSpamInput,
): Promise<OutboundSpamResult> {
  const blockAt = envScore("OUTBOUND_SPAM_BLOCK_SCORE", DEFAULT_BLOCK_SCORE);
  const reviewAt = envScore("OUTBOUND_SPAM_REVIEW_SCORE", DEFAULT_REVIEW_SCORE);

  try {
    const result = await classifier.classify(toEmailMessage(input));

    if (!result.ok) {
      console.error(
        `[outbound-spam] classification failed for ${input.messageId}: ${result.error.message} — allowing send (fail-open)`,
      );
      return { allowed: true, score: null, review: false, reasons: [], degraded: true };
    }

    const { score } = result.value;
    // Only report reasons from the layer that actually scored. The classifier
    // collects reasons from every layer regardless of weight, so an outbound
    // message would otherwise be refused citing "Authentication failures
    // detected" — nonsense for a message that has not been sent yet and has no
    // Received chain, and doubly so since that layer is weighted to 0 here.
    const reasons = result.value.reasons
      .filter((r) => r.layer === "content")
      .map((r) => r.description);

    if (score >= blockAt) {
      // Loud, because this is either a compromised account or an abusive
      // customer, and both need to be visible rather than silently 422'd.
      console.error(
        `[outbound-spam] BLOCKED account=${input.accountId} message=${input.messageId} ` +
          `score=${score.toFixed(3)} threshold=${blockAt} reasons=${JSON.stringify(reasons)}`,
      );
      return { allowed: false, score, review: false, reasons, degraded: false };
    }

    if (score >= reviewAt) {
      console.warn(
        `[outbound-spam] REVIEW account=${input.accountId} message=${input.messageId} ` +
          `score=${score.toFixed(3)} reasons=${JSON.stringify(reasons)}`,
      );
      return { allowed: true, score, review: true, reasons, degraded: false };
    }

    return { allowed: true, score, review: false, reasons, degraded: false };
  } catch (err) {
    console.error(
      `[outbound-spam] unexpected error for ${input.messageId}: ${
        err instanceof Error ? err.message : String(err)
      } — allowing send (fail-open)`,
    );
    return { allowed: true, score: null, review: false, reasons: [], degraded: true };
  }
}
