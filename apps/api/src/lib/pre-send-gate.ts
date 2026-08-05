/**
 * The pre-send gate — one callable stack every outbound-queue producer runs.
 *
 * Known issue #151: four code paths enqueue onto the outbound queue, and only
 * `routes/messages.ts` ran the abuse controls. `lib/agent-send.ts`,
 * `routes/agent.ts` and `routes/unsubscribe.ts` skipped all of them, so
 * AI-generated mail — drafted by a model from the content of an incoming
 * message — was sent with no content scoring and against no quota. The gates
 * live here, in one place, precisely because bolting a partial copy onto each
 * producer is how the split happened in the first place.
 *
 * Order is load-bearing and matches what messages.ts did:
 *
 *   1. quota       — before everything, so an over-quota account cannot
 *                    consume warm-up slots or queue capacity on its way to
 *                    being refused.
 *   2. suppression — before warm-up/enqueue, so a suppressed address cannot
 *                    burn a warm-up slot or a quota count.
 *   3. compliance  — CAN-SPAM / GDPR / CASL.
 *   4. spam        — the only check that reads what the message SAYS.
 *   5. anomaly     — catches a blast of individually-bland messages that the
 *                    content scorer cannot see.
 *   6. headers     — CRLF/Bcc injection and platform-controlled headers.
 *
 * The gate returns a status + body rather than a Response so non-route callers
 * (agent-send.ts is a library) can turn a refusal into a thrown error while
 * routes return it verbatim. The bodies are byte-identical to the ones
 * messages.ts returned inline, so extracting this changed no API contract.
 *
 * What is NOT here: warm-up enforcement and DKIM. Those live in the MTA worker
 * and already apply to everything on the queue regardless of producer — see
 * issue #139 and #144. This gate is the API-side half only.
 */

import { and, eq } from "drizzle-orm";
import { getDatabase, suppressionLists } from "@alecrae/db";
import { ComplianceEngine, type EmailMetadata } from "@alecrae/reputation";
import { checkQuota } from "./quota.js";
import { checkOutboundSpam } from "./outbound-spam-gate.js";
import { checkSendAnomaly } from "./send-anomaly.js";
import {
  validateCustomHeaders,
  HEADER_INJECTION_REJECTED,
} from "@alecrae/mta/lib";

export interface PreSendGateInput {
  readonly accountId: string;
  /** The sender domain's row id — suppression is scoped to it. */
  readonly domainId: string;
  readonly messageId: string;
  readonly from: string;
  /** Every recipient: to + cc + bcc. */
  readonly recipients: readonly string[];
  readonly subject: string;
  readonly text?: string | undefined;
  readonly html?: string | undefined;
  readonly headers?: Record<string, unknown> | null | undefined;
  /**
   * What kind of mail this is, which decides whether the marketing-only
   * compliance rules apply. See `classifyContent` for how callers derive it
   * and why the previous "everything that isn't transactional is marketing"
   * rule made the send path refuse ordinary mail.
   */
  readonly contentClass: ContentClass;
}

/**
 * The compliance-relevant kind of a message.
 *
 * `@alecrae/reputation`'s `EmailMetadata.contentType` is a binary
 * `"marketing" | "transactional"`, where the transactional branch means
 * "not commercial bulk mail — marketing requirements waived". Three real
 * kinds map onto those two values, and conflating two of them is what broke
 * the send path:
 *
 *  - `transactional`  — password reset, verification, magic link.
 *  - `correspondence` — an ordinary person-to-person message, including an
 *                       agent-drafted reply. Not commercial bulk mail under
 *                       CAN-SPAM, GDPR or CASL, so the marketing rules do not
 *                       apply. Maps onto the engine's exempt branch.
 *  - `marketing`      — a campaign, newsletter or other bulk commercial send.
 *                       Full checks.
 */
export type ContentClass = "transactional" | "correspondence" | "marketing";

/**
 * Derive the content class from the signals a send actually carries.
 *
 * The rule this replaces was `isTransactional ? transactional : marketing`,
 * which classified every ordinary email as commercial bulk mail. Run against
 * the real engine that produces TEN critical violations — no physical postal
 * address, no unsubscribe link, no List-Unsubscribe header, no recorded GDPR
 * or CASL consent — and `messages.ts` refuses on `violations.length > 0`. So
 * `POST /v1/messages` answered 422 for every non-transactional message: a
 * plain reply from your own domain was rejected as a non-compliant marketing
 * campaign. It went unseen because `messages.test.ts` mocks `ComplianceEngine`
 * to return zero violations, so the real engine had never run in a test.
 *
 * Marketing is now identified positively rather than by elimination. A send is
 * commercial bulk mail when it says so — an explicit tag, or a template, which
 * is how campaigns are actually assembled in this API. Anything else is
 * correspondence.
 *
 * Deliberately conservative in the direction that matters: a genuine campaign
 * that forgets its tag but uses a template is still fully checked, and adding
 * a new bulk mechanism means adding its signal here. The failure mode of the
 * old rule was blocking all legitimate mail; the failure mode to avoid now is
 * letting an untagged campaign skip CAN-SPAM, which is why the template signal
 * is included rather than relying on tags alone.
 */
export function classifyContent(opts: {
  readonly tags?: readonly string[] | undefined;
  readonly templateId?: string | undefined;
}): ContentClass {
  const tags = (opts.tags ?? []).map((t) => t.toLowerCase());
  const templateId = (opts.templateId ?? "").toLowerCase();

  if (
    tags.includes("transactional") ||
    templateId.includes("verify") ||
    templateId.includes("password-reset") ||
    templateId.includes("magic-link")
  ) {
    return "transactional";
  }

  const MARKETING_TAGS = ["marketing", "campaign", "newsletter", "bulk", "promotional"];
  if (tags.some((t) => MARKETING_TAGS.includes(t)) || templateId.length > 0) {
    return "marketing";
  }

  return "correspondence";
}

export type PreSendGateVerdict =
  | {
      readonly allowed: true;
      /**
       * The validated custom headers, which callers write onto the message.
       * Returned from here rather than re-derived so the value that was
       * checked is the value that gets sent — re-running the validator at the
       * call site would let the two drift.
       */
      readonly sanitizedHeaders: Record<string, string>;
    }
  | {
      readonly allowed: false;
      /** HTTP status a route should answer with. */
      readonly status: 400 | 422 | 429;
      /** Response body, verbatim from the original inline checks. */
      readonly body: unknown;
      /** Stable machine code, for logs and for non-HTTP callers. */
      readonly code: string;
      /** One-line reason suitable for a thrown Error's message. */
      readonly reason: string;
    };

function domainOf(address: string): string {
  const idx = address.lastIndexOf("@");
  return idx === -1 ? address : address.slice(idx + 1).toLowerCase();
}

// ── Compliance content detection ─────────────────────────────────────
//
// These two fields used to be hardcoded `false`, which made the marketing
// branch of every compliance framework unsatisfiable: a campaign carrying a
// perfect unsubscribe link and postal address was still refused for lacking
// both, because the gate never looked at the message. Heuristics err toward
// detection — a sender who genuinely included the mechanism must pass; total
// absence is still refused.

const UNSUB_URL =
  /https?:\/\/[^\s"'<>]*(?:unsubscribe|opt[-_]?out|email[-_]?preferences|manage[-_]?preferences)[^\s"'<>]*/i;
const UNSUB_MAILTO = /mailto:[^\s"'<>]*(?:unsubscribe|opt[-_]?out)[^\s"'<>]*/i;
const UNSUB_ANCHOR_TEXT =
  /<a\b[^>]*>[^<]*(?:unsubscribe|opt[\s-]?out|manage (?:your )?preferences)[^<]*<\/a>/i;

/** Does the message body contain a visible unsubscribe mechanism? */
export function detectUnsubscribeLink(
  text: string | undefined,
  html: string | undefined,
): boolean {
  const combined = `${text ?? ""}\n${html ?? ""}`;
  return (
    UNSUB_URL.test(combined) ||
    UNSUB_MAILTO.test(combined) ||
    (html !== undefined && UNSUB_ANCHOR_TEXT.test(html))
  );
}

const PO_BOX = /\bP\.?\s?O\.?\s+Box\s+\d+/i;
const STREET_ADDRESS =
  /\b\d{1,6}\s+(?:[A-Za-z][A-Za-z.'-]*\s+){1,5}(?:st(?:reet)?|ave(?:nue)?|road|rd|blvd|boulevard|lane|ln|drive|court|ct|way|place|pl|terrace|parade|crescent|highway|hwy|square|sq|suite|ste|floor)\b/i;

/** Does the message body contain something that reads as a postal address? */
export function detectPhysicalAddress(
  text: string | undefined,
  html: string | undefined,
): boolean {
  const combined = `${text ?? ""}\n${html ?? ""}`;
  return PO_BOX.test(combined) || STREET_ADDRESS.test(combined);
}

/**
 * Run every API-side pre-send control. Returns `{ allowed: true }` or the
 * refusal a caller should surface.
 */
export async function runPreSendGate(
  input: PreSendGateInput,
): Promise<PreSendGateVerdict> {
  const db = getDatabase();

  // ── 1. Hard quota enforcement ─────────────────────────────────────
  const quota = await checkQuota(input.accountId);
  if (!quota.allowed) {
    return {
      allowed: false,
      status: 429,
      code: "QUOTA_EXCEEDED",
      reason: `Monthly email limit reached (${quota.sent}/${quota.limit}).`,
      body: {
        error: "QUOTA_EXCEEDED",
        message: `Monthly email limit reached (${quota.sent}/${quota.limit}). Upgrade your plan or wait until next billing cycle.`,
        plan: quota.plan,
        limit: quota.limit,
        sent: quota.sent,
        resetsAt: quota.resetsAt,
      },
    };
  }

  // ── 2. Suppression list ───────────────────────────────────────────
  for (const recipientEmail of input.recipients) {
    const [suppressed] = await db
      .select({
        email: suppressionLists.email,
        reason: suppressionLists.reason,
      })
      .from(suppressionLists)
      .where(
        and(
          eq(suppressionLists.email, recipientEmail.toLowerCase()),
          eq(suppressionLists.domainId, input.domainId),
        ),
      )
      .limit(1);

    if (suppressed) {
      const reason =
        suppressed.reason === "bounce"
          ? "hard_bounce"
          : suppressed.reason === "complaint"
            ? "complaint"
            : suppressed.reason === "unsubscribe"
              ? "manual_unsubscribe"
              : suppressed.reason;
      return {
        allowed: false,
        status: 422,
        code: "RECIPIENT_SUPPRESSED",
        reason: `Recipient ${suppressed.email} is suppressed (${reason}).`,
        body: {
          error: "RECIPIENT_SUPPRESSED",
          reason,
          address: suppressed.email,
        },
      };
    }
  }

  // ── 3. Compliance (CAN-SPAM / GDPR / CASL) ────────────────────────
  const complianceEngine = new ComplianceEngine({ exemptTransactional: true });
  const headersMap = new Map<string, string>(
    Object.entries(input.headers ?? {}).map(([k, v]) => [k, String(v)]),
  );
  const complianceMeta: EmailMetadata = {
    from: input.from,
    to: input.recipients[0] ?? input.from,
    subject: input.subject,
    headers: headersMap,
    // buildRawMessage emits RFC 8058 List-Unsubscribe + one-click POST
    // headers on every message it assembles (whenever an email id exists),
    // so the header is guaranteed present on the wire even when absent from
    // the caller-supplied custom headers checked here.
    hasUnsubscribeHeader: true,
    hasUnsubscribeLink: detectUnsubscribeLink(input.text, input.html),
    hasPhysicalAddress: detectPhysicalAddress(input.text, input.html),
    // "correspondence" takes the engine's exempt branch alongside
    // "transactional": neither is commercial bulk mail, so the marketing-only
    // requirements (physical address, unsubscribe link, recorded consent) do
    // not apply. Only a genuine campaign is checked against them.
    contentType: input.contentClass === "marketing" ? "marketing" : "transactional",
    senderDomain: domainOf(input.from),
  };
  const complianceResult = complianceEngine.checkAll(complianceMeta);
  if (!complianceResult.ok) {
    const message =
      complianceResult.error instanceof Error
        ? complianceResult.error.message
        : "Compliance check failed";
    return {
      allowed: false,
      status: 422,
      code: "compliance_violation",
      reason: message,
      body: {
        error: {
          type: "compliance_error",
          message,
          code: "compliance_violation",
        },
      },
    };
  }
  const violations = complianceResult.value.flatMap((r) => r.violations ?? []);
  if (violations.length > 0) {
    const message = `Email blocked: ${violations
      .map((v) => v.description ?? v.rule)
      .join("; ")}`;
    return {
      allowed: false,
      status: 422,
      code: "compliance_violation",
      reason: message,
      body: {
        error: {
          type: "compliance_error",
          message,
          code: "compliance_violation",
          violations,
        },
      },
    };
  }

  // ── 4. Outbound spam gate (reputation protection) ─────────────────
  // The only control that reads what the message actually says. Everything
  // above protects the recipient or the customer.
  const spamVerdict = await checkOutboundSpam({
    messageId: input.messageId,
    accountId: input.accountId,
    from: input.from,
    to: [...input.recipients],
    subject: input.subject,
    text: input.text,
    html: input.html,
  });
  if (!spamVerdict.allowed) {
    return {
      allowed: false,
      status: 422,
      code: "outbound_spam_rejected",
      reason: `Content scored as spam (${spamVerdict.score ?? "n/a"}): ${spamVerdict.reasons.join("; ")}`,
      body: {
        error: {
          type: "spam_content_rejected",
          message:
            "This message was refused because its content scored as spam. " +
            "If you believe this is wrong, contact support — sending it would " +
            "put the delivery reputation of every account on this platform at risk.",
          code: "outbound_spam_rejected",
          score: spamVerdict.score,
          reasons: spamVerdict.reasons,
        },
      },
    };
  }

  // ── 5. Send-volume anomaly (compromised-account detection) ────────
  const anomaly = await checkSendAnomaly(input.accountId);
  if (!anomaly.allowed) {
    return {
      allowed: false,
      status: 429,
      code: "send_volume_anomaly",
      reason: `Send volume ${anomaly.currentHour} exceeds threshold ${anomaly.threshold} for this account.`,
      body: {
        error: {
          type: "send_volume_anomaly",
          message:
            "Sending is paused on this account: volume this hour is far above its " +
            "normal rate, which usually means credentials have been compromised. " +
            "Contact support to resume.",
          code: "send_volume_anomaly",
          sentThisHour: anomaly.currentHour,
          threshold: anomaly.threshold,
        },
      },
    };
  }

  // ── 6. Custom header validation ───────────────────────────────────
  const headerCheck = validateCustomHeaders(
    (input.headers ?? null) as Record<string, unknown> | null,
  );
  if (!headerCheck.ok) {
    return {
      allowed: false,
      status: 400,
      code: HEADER_INJECTION_REJECTED,
      reason: headerCheck.reason ?? "Invalid custom header",
      body: {
        error: {
          type: "validation_error",
          message: headerCheck.reason,
          code: HEADER_INJECTION_REJECTED,
        },
      },
    };
  }

  return { allowed: true, sanitizedHeaders: headerCheck.sanitized };
}

/**
 * Thrown by non-route callers when the gate refuses. Carries the same status
 * and body so a route wrapping such a caller can still answer precisely,
 * rather than flattening every refusal into a 500.
 */
export class PreSendGateError extends Error {
  readonly status: 400 | 422 | 429;
  readonly body: unknown;
  readonly code: string;

  constructor(verdict: Extract<PreSendGateVerdict, { allowed: false }>) {
    super(verdict.reason);
    this.name = "PreSendGateError";
    this.status = verdict.status;
    this.body = verdict.body;
    this.code = verdict.code;
  }
}
