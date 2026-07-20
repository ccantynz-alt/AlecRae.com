/**
 * PII redaction — a real minimization gate before content reaches a
 * third-party AI provider.
 *
 * Found in the audit: apps/api/src/lib/ai.ts's aiComplete() and the
 * Whisper dictation path pass full email bodies / audio to Claude/OpenAI
 * with zero redaction step anywhere in the pipeline. The only PII-related
 * code in the repo (attachment-intelligence.ts) is a detector feeding a
 * reporting dashboard, not a redaction gate — it tells you PII was
 * present after the fact, it doesn't stop it from being sent.
 *
 * This is regex-based, not a full PII classifier — it catches the common,
 * high-confidence, structurally-recognizable cases (SSNs, credit cards,
 * common secret/API-key shapes) that are cheap to detect with very low
 * false-positive risk. It will not catch names, addresses, or PII with no
 * fixed structure — that needs a real classifier, a larger project than
 * this pass. Catching the highest-confidence cases is still a real
 * reduction in what leaves the building, not a complete solution.
 */

interface RedactionRule {
  type: string;
  pattern: RegExp;
  mask: (match: string) => string;
}

const RULES: RedactionRule[] = [
  {
    type: "ssn",
    pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
    mask: () => "[REDACTED-SSN]",
  },
  {
    type: "credit_card",
    // 13-19 digit PAN, optionally grouped by spaces/dashes — covers the
    // common 4x4 (16-digit) card format plus Amex (15) and some debit/
    // corporate card lengths, without matching arbitrary long digit runs
    // (phone numbers, IDs) via a plausible total-length bound.
    pattern: /\b(?:\d[ -]?){13,19}\b/g,
    mask: (match) => {
      const digits = match.replace(/[ -]/g, "");
      if (digits.length < 13 || digits.length > 19) return match;
      return "[REDACTED-CARD]";
    },
  },
  {
    type: "api_key",
    // Common secret-key prefixes (Anthropic, OpenAI, Stripe, AWS, GitHub,
    // Slack, generic "sk-"/"key-" bearer tokens) followed by a long
    // token-like suffix.
    pattern:
      /\b(?:sk-ant-|sk-proj-|sk-|pk_(?:live|test)_|rk_(?:live|test)_|AKIA|ghp_|gho_|ghu_|ghs_|xox[baprs]-)[A-Za-z0-9_-]{10,}\b/g,
    mask: (match) => `[REDACTED-KEY:${match.slice(0, 6)}...]`,
  },
];

export interface RedactionResult {
  text: string;
  redactedTypes: string[];
}

/**
 * Redact high-confidence PII/secrets from text before it's sent to a
 * third-party AI provider. Pure, synchronous, never throws.
 */
export function redactPii(text: string): RedactionResult {
  let result = text;
  const redactedTypes = new Set<string>();

  for (const rule of RULES) {
    result = result.replace(rule.pattern, (match) => {
      const masked = rule.mask(match);
      if (masked !== match) redactedTypes.add(rule.type);
      return masked;
    });
  }

  return { text: result, redactedTypes: Array.from(redactedTypes) };
}
