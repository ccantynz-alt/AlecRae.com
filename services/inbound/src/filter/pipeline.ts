import { checkSpf } from "@emailed/mta/src/spf/validator.js";
import { evaluateDmarc, determineAction } from "@emailed/mta/src/dmarc/enforcer.js";
import { verifyDkim } from "./dkim-verifier.js";
import type { DkimVerifyResult } from "./dkim-verifier.js";
import type { ParsedEmail, AuthenticationResult, FilterVerdict, SmtpEnvelope } from "../types.js";
import { classifyEmail, isAIAvailable } from "@emailed/ai-engine/classifier";
import type { EmailClassificationInput } from "@emailed/ai-engine/classifier";

// --- Filter Stage Interface ---

interface FilterContext {
  envelope: SmtpEnvelope;
  email: ParsedEmail;
  senderIp: string;
  rawHeaders: string;
  rawBody: Uint8Array;
  verdict: FilterVerdict;
  metadata: Map<string, unknown>;
}

type FilterStage = (ctx: FilterContext) => Promise<FilterContext>;

// --- Authentication Check Stage ---

async function authenticationCheck(ctx: FilterContext): Promise<FilterContext> {
  const { email, envelope, senderIp } = ctx;

  // ── SPF: real DNS-based validation via RFC 7208 ──────────────────────
  const senderDomain = envelope.mailFrom.split("@")[1];
  let spfAuthResult: AuthenticationResult;

  if (senderDomain && senderIp) {
    try {
      const spfCheck = await checkSpf(senderIp, senderDomain);
      spfAuthResult = {
        method: "spf",
        result: spfCheck.result,
        domain: spfCheck.domain,
        details: spfCheck.mechanismMatched
          ? `mechanism: ${spfCheck.mechanismMatched}`
          : spfCheck.explanation ?? `SPF ${spfCheck.result} for ${senderDomain}`,
      };
    } catch {
      spfAuthResult = {
        method: "spf",
        result: "temperror",
        domain: senderDomain,
        details: "SPF lookup failed",
      };
    }
  } else {
    spfAuthResult = {
      method: "spf",
      result: "none",
      domain: senderDomain,
      details: senderIp ? "No sender domain" : "No sender IP available",
    };
  }
  ctx.verdict.authResults.push(spfAuthResult);

  // Add spam score for SPF failures
  if (spfAuthResult.result === "fail") {
    ctx.verdict.score = (ctx.verdict.score ?? 0) + 2;
    ctx.verdict.flags.add("spf_fail");
  } else if (spfAuthResult.result === "softfail") {
    ctx.verdict.score = (ctx.verdict.score ?? 0) + 1;
    ctx.verdict.flags.add("spf_softfail");
  }

  // ── DKIM: full cryptographic verification via RFC 6376 ──────────────
  let dkimResults: DkimVerifyResult[];
  try {
    dkimResults = await verifyDkim(ctx.rawHeaders, ctx.rawBody);
  } catch {
    dkimResults = [{
      status: "temperror",
      domain: "",
      selector: "",
      details: "DKIM verification threw an unexpected error",
    }];
  }

  // The best result is first (sorted by verifyDkim)
  const bestDkim = dkimResults[0]!;
  const dkimDomain: string | undefined = bestDkim.domain || undefined;
  const dkimSelector: string | undefined = bestDkim.selector || undefined;
  const dkimStatus: AuthenticationResult["result"] = bestDkim.status === "none"
    ? "none"
    : bestDkim.status as AuthenticationResult["result"];

  // Push a result for each DKIM signature verified
  for (const dkimResult of dkimResults) {
    ctx.verdict.authResults.push({
      method: "dkim",
      result: dkimResult.status === "none" ? "none" : dkimResult.status as AuthenticationResult["result"],
      domain: dkimResult.domain || undefined,
      selector: dkimResult.selector || undefined,
      details: dkimResult.details,
    });
  }

  // Add spam score for DKIM failures
  if (dkimStatus === "fail") {
    ctx.verdict.score = (ctx.verdict.score ?? 0) + 2;
    ctx.verdict.flags.add("dkim_fail");
  } else if (dkimStatus === "permerror") {
    ctx.verdict.score = (ctx.verdict.score ?? 0) + 1;
    ctx.verdict.flags.add("dkim_permerror");
  }

  // ── DMARC: real DNS-based policy evaluation via RFC 7489 ─────────────
  const fromDomain = email.from[0]?.address.split("@")[1];
  if (fromDomain) {
    try {
      const dmarcEval = await evaluateDmarc(
        fromDomain,
        {
          result: spfAuthResult.result === "pass" ? "pass" : spfAuthResult.result === "fail" ? "fail" : "neutral",
          domain: spfAuthResult.domain ?? senderDomain ?? "",
        },
        {
          status: dkimStatus === "pass" ? "pass" : dkimStatus === "fail" ? "fail" : "neutral",
          domain: dkimDomain ?? "",
          selector: dkimSelector ?? "",
        },
      );

      const dmarcAuthResult: AuthenticationResult = {
        method: "dmarc",
        result: dmarcEval.result === "pass" ? "pass" : dmarcEval.result === "fail" ? "fail" : "none",
        domain: fromDomain,
        details: `policy=${dmarcEval.policy}, applied=${dmarcEval.appliedPolicy}, ` +
          `spfAligned=${dmarcEval.spfAligned}, dkimAligned=${dmarcEval.dkimAligned}`,
      };
      ctx.verdict.authResults.push(dmarcAuthResult);

      // Apply DMARC policy to filter verdict
      const dmarcAction = determineAction(dmarcEval);
      if (dmarcAction === "reject") {
        ctx.verdict.action = "reject";
        ctx.verdict.reason = `DMARC policy rejection for ${fromDomain} (p=${dmarcEval.policy})`;
        ctx.verdict.flags.add("dmarc_reject");
      } else if (dmarcAction === "quarantine") {
        ctx.verdict.score = (ctx.verdict.score ?? 0) + 4;
        ctx.verdict.flags.add("dmarc_quarantine");
      } else if (dmarcEval.result === "fail") {
        // DMARC failed but policy is "none" — still add score
        ctx.verdict.score = (ctx.verdict.score ?? 0) + 2;
        ctx.verdict.flags.add("dmarc_fail");
      }
    } catch {
      // DMARC lookup failure — don't block the message
      ctx.verdict.authResults.push({
        method: "dmarc",
        result: "temperror",
        domain: fromDomain,
        details: "DMARC evaluation failed",
      });
    }
  }

  return ctx;
}

// --- Spam Filter Stage ---

const SPAM_HEADER_INDICATORS = [
  { pattern: /x-mailer:.*bulk/i, score: 2, flag: "bulk_mailer" },
  { pattern: /precedence:\s*bulk/i, score: 1, flag: "precedence_bulk" },
  { pattern: /list-unsubscribe/i, score: -1, flag: "has_unsubscribe" },
];

const SPAM_BODY_PATTERNS = [
  { pattern: /\bcialis\b|\bviagra\b|\brolex\b/i, score: 5, flag: "pharma_spam" },
  { pattern: /\bclick here\b.*\bfree\b/i, score: 2, flag: "clickbait" },
  { pattern: /\bunsubscribe\b/i, score: -0.5, flag: "has_unsubscribe_body" },
  { pattern: /\bdear\s+(?:sir|madam|customer|user|friend)\b/i, score: 1.5, flag: "generic_greeting" },
  { pattern: /\burgent\b.*\bact\s+now\b/i, score: 3, flag: "urgency_spam" },
];

async function spamFilter(ctx: FilterContext): Promise<FilterContext> {
  const { email } = ctx;
  let score = ctx.verdict.score ?? 0;

  // Check headers
  for (const header of email.headers) {
    const headerLine = `${header.key}: ${header.value}`;
    for (const indicator of SPAM_HEADER_INDICATORS) {
      if (indicator.pattern.test(headerLine)) {
        score += indicator.score;
        ctx.verdict.flags.add(indicator.flag);
      }
    }
  }

  // Check body content
  const bodyText = (email.text ?? "") + " " + (email.html ?? "");
  for (const pattern of SPAM_BODY_PATTERNS) {
    if (pattern.pattern.test(bodyText)) {
      score += pattern.score;
      ctx.verdict.flags.add(pattern.flag);
    }
  }

  // Ratio of images to text (common in spam)
  if (email.html) {
    const imgCount = (email.html.match(/<img/gi) ?? []).length;
    const textLength = email.text?.length ?? 0;
    if (imgCount > 3 && textLength < 100) {
      score += 2;
      ctx.verdict.flags.add("image_heavy");
    }
  }

  // Empty subject
  if (!email.subject || email.subject.trim().length === 0) {
    score += 1;
    ctx.verdict.flags.add("empty_subject");
  }

  // ALL CAPS subject
  if (email.subject && email.subject === email.subject.toUpperCase() && email.subject.length > 10) {
    score += 1.5;
    ctx.verdict.flags.add("caps_subject");
  }

  ctx.verdict.score = score;

  // Threshold decisions
  if (score >= 8) {
    ctx.verdict.action = "reject";
    ctx.verdict.reason = `Spam score ${score} exceeds rejection threshold`;
  } else if (score >= 5) {
    ctx.verdict.action = "quarantine";
    ctx.verdict.reason = `Spam score ${score} exceeds quarantine threshold`;
  }

  return ctx;
}

// --- AI Classification Stage ---
// Runs after rule-based spam filter for ambiguous scores (between 3 and 7).
// Gracefully skips when ANTHROPIC_API_KEY is not configured.

async function aiClassification(ctx: FilterContext): Promise<FilterContext> {
  // Skip if already rejected or if AI is not available
  if (ctx.verdict.action === "reject") return ctx;
  if (!isAIAvailable()) return ctx;

  const score = ctx.verdict.score ?? 0;

  // Only invoke AI for ambiguous rule-based scores (3-7 range).
  // Clear spam (>=8) and clean mail (<3) don't need expensive AI analysis.
  if (score < 3 || score > 7) return ctx;

  const { email } = ctx;

  const input: EmailClassificationInput = {
    from: email.from[0]?.address ?? "",
    to: email.to[0]?.address ?? "",
    subject: email.subject,
    textBody: email.text,
    htmlBody: email.html,
    headers: email.headers.map((h) => ({ key: h.key, value: h.value })),
  };

  try {
    const result = await classifyEmail(input);
    if (!result.ok) return ctx;

    const classification = result.value;

    // Store AI classification metadata for auditing
    ctx.metadata.set("ai_classification", classification);

    // Add AI spam score contribution (weighted at 50% of AI score)
    ctx.verdict.score = score + classification.spamScore * 0.5;

    // Add AI classification flags
    for (const category of classification.categories) {
      ctx.verdict.flags.add(`ai:${category}`);
    }
    ctx.verdict.flags.add(
      `ai_source:${classification.source}`,
    );
    ctx.verdict.flags.add(
      `ai_confidence:${classification.confidence.toFixed(2)}`,
    );

    // High-confidence AI spam detection: quarantine
    if (
      classification.categories.includes("spam") &&
      classification.confidence > 0.9
    ) {
      ctx.verdict.action = "quarantine";
      ctx.verdict.reason = `AI classified as spam with ${(classification.confidence * 100).toFixed(0)}% confidence: ${classification.reasoning}`;
      ctx.verdict.flags.add("ai_quarantine");
    }

    // High-confidence AI phishing detection: reject
    if (
      classification.categories.includes("phishing") &&
      classification.confidence > 0.8
    ) {
      ctx.verdict.action = "reject";
      ctx.verdict.reason = `AI classified as phishing with ${(classification.confidence * 100).toFixed(0)}% confidence: ${classification.reasoning}`;
      ctx.verdict.flags.add("ai_phishing_reject");
    }
  } catch {
    // AI classification failed — continue without it (graceful degradation)
    ctx.verdict.flags.add("ai_classification_error");
  }

  return ctx;
}

// --- Phishing Filter Stage ---

async function phishingFilter(ctx: FilterContext): Promise<FilterContext> {
  const { email } = ctx;
  if (ctx.verdict.action === "reject") return ctx;

  let score = ctx.verdict.score ?? 0;

  if (email.html) {
    // Check for deceptive links: display text is a URL that doesn't match href
    const linkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/gi;
    let match: RegExpExecArray | null;
    while ((match = linkRegex.exec(email.html)) !== null) {
      const href = match[1]!;
      const displayText = match[2]!.trim();

      // If display text looks like a URL but points elsewhere
      if (displayText.match(/^https?:\/\//)) {
        try {
          const hrefUrl = new URL(href);
          const displayUrl = new URL(displayText);
          if (hrefUrl.hostname !== displayUrl.hostname) {
            score += 4;
            ctx.verdict.flags.add("deceptive_link");
          }
        } catch {
          // Malformed URL in display text
        }
      }
    }

    // Check for known phishing patterns
    const phishingPatterns = [
      /verify\s+your\s+(?:account|identity|password)/i,
      /suspended?\s+(?:your\s+)?account/i,
      /confirm\s+your\s+(?:identity|billing|payment)/i,
      /unusual\s+(?:activity|sign[- ]?in)/i,
    ];

    for (const pattern of phishingPatterns) {
      if (pattern.test(email.html) || (email.text && pattern.test(email.text))) {
        score += 2;
        ctx.verdict.flags.add("phishing_language");
        break;
      }
    }

    // Form elements in HTML email (suspicious)
    if (/<form[^>]*>/i.test(email.html)) {
      score += 3;
      ctx.verdict.flags.add("contains_form");
    }
  }

  ctx.verdict.score = score;

  if (score >= 8) {
    ctx.verdict.action = "quarantine";
    ctx.verdict.reason = `Phishing indicators detected (score: ${score})`;
  }

  return ctx;
}

// --- Content Filter Stage ---

async function contentFilter(ctx: FilterContext): Promise<FilterContext> {
  const { email } = ctx;
  if (ctx.verdict.action === "reject") return ctx;

  // Check attachment types for dangerous content
  const dangerousExtensions = new Set([
    ".exe", ".scr", ".bat", ".cmd", ".com", ".pif", ".vbs", ".vbe",
    ".js", ".jse", ".wsf", ".wsh", ".msi", ".dll", ".cpl",
  ]);

  const dangerousContentTypes = new Set([
    "application/x-msdownload",
    "application/x-executable",
    "application/x-msdos-program",
    "application/vnd.microsoft.portable-executable",
  ]);

  for (const attachment of email.attachments) {
    const ext = attachment.filename.toLowerCase().match(/\.[^.]+$/)?.[0] ?? "";

    if (dangerousExtensions.has(ext)) {
      ctx.verdict.flags.add(`dangerous_attachment:${ext}`);
      ctx.verdict.score = (ctx.verdict.score ?? 0) + 5;
    }

    if (dangerousContentTypes.has(attachment.contentType.toLowerCase())) {
      ctx.verdict.flags.add("dangerous_content_type");
      ctx.verdict.score = (ctx.verdict.score ?? 0) + 5;
    }

    // Double extension check (e.g., invoice.pdf.exe)
    const doubleExt = attachment.filename.match(/\.\w+\.\w+$/);
    if (doubleExt && dangerousExtensions.has(ext)) {
      ctx.verdict.flags.add("double_extension");
      ctx.verdict.score = (ctx.verdict.score ?? 0) + 3;
    }
  }

  // Password-protected archives (common malware vector)
  const bodyText = (email.text ?? "") + " " + (email.html ?? "");
  const hasArchive = email.attachments.some((a) =>
    /\.(zip|rar|7z)$/i.test(a.filename),
  );
  if (hasArchive && /password/i.test(bodyText)) {
    ctx.verdict.flags.add("password_protected_archive");
    ctx.verdict.score = (ctx.verdict.score ?? 0) + 2;
  }

  if ((ctx.verdict.score ?? 0) >= 8 && ctx.verdict.action === "accept") {
    ctx.verdict.action = "quarantine";
    ctx.verdict.reason = "Suspicious content detected";
  }

  return ctx;
}

// --- Malware Scan Stage ---

async function malwareScan(ctx: FilterContext): Promise<FilterContext> {
  const { email } = ctx;
  if (ctx.verdict.action === "reject") return ctx;

  for (const attachment of email.attachments) {
    // Check for EICAR test pattern (standard AV test string)
    const content = new TextDecoder("utf-8", { fatal: false }).decode(attachment.content);
    if (content.includes("X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*")) {
      ctx.verdict.action = "reject";
      ctx.verdict.reason = "Malware detected in attachment";
      ctx.verdict.flags.add("malware_detected");
      return ctx;
    }

    // In production: send to ClamAV or cloud AV scanning service
    // const scanResult = await avScanner.scan(attachment.content);
  }

  return ctx;
}

// --- Pipeline Orchestrator ---

export class FilterPipeline {
  private stages: { name: string; handler: FilterStage }[] = [];

  constructor() {
    // Default pipeline stages in order
    this.stages = [
      { name: "authentication", handler: authenticationCheck },
      { name: "spam", handler: spamFilter },
      { name: "aiClassification", handler: aiClassification },
      { name: "phishing", handler: phishingFilter },
      { name: "content", handler: contentFilter },
      { name: "malware", handler: malwareScan },
    ];
  }

  /**
   * Add a custom filter stage at a specific position.
   */
  addStage(name: string, handler: FilterStage, position?: number): void {
    const stage = { name, handler };
    if (position !== undefined) {
      this.stages.splice(position, 0, stage);
    } else {
      this.stages.push(stage);
    }
  }

  /**
   * Remove a filter stage by name.
   */
  removeStage(name: string): boolean {
    const idx = this.stages.findIndex((s) => s.name === name);
    if (idx === -1) return false;
    this.stages.splice(idx, 1);
    return true;
  }

  /**
   * Run the full filter pipeline on an email.
   * @param senderIp  - The IP address of the sending SMTP server (for SPF checks)
   * @param rawHeaders - The raw header block of the email (for DKIM verification)
   * @param rawBody    - The raw body of the email (for DKIM verification)
   */
  async process(
    envelope: SmtpEnvelope,
    email: ParsedEmail,
    senderIp: string = "",
    rawHeaders: string = "",
    rawBody: Uint8Array = new Uint8Array(0),
  ): Promise<FilterVerdict> {
    let ctx: FilterContext = {
      envelope,
      email,
      senderIp,
      rawHeaders,
      rawBody,
      verdict: {
        action: "accept",
        score: 0,
        flags: new Set(),
        authResults: [],
      },
      metadata: new Map(),
    };

    for (const stage of this.stages) {
      try {
        ctx = await stage.handler(ctx);

        // Short-circuit on hard reject
        if (ctx.verdict.action === "reject") {
          console.log(
            `[FilterPipeline] Rejected at stage '${stage.name}': ${ctx.verdict.reason}`,
          );
          break;
        }
      } catch (err) {
        console.error(`[FilterPipeline] Error in stage '${stage.name}':`, err);
        // On error, defer rather than silently accept
        ctx.verdict.action = "defer";
        ctx.verdict.reason = `Filter error in stage '${stage.name}'`;
        ctx.verdict.flags.add(`error:${stage.name}`);
        break;
      }
    }

    return ctx.verdict;
  }
}
