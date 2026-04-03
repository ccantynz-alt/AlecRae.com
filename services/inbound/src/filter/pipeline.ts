import type { ParsedEmail, SmtpSession, SmtpEnvelope, AuthenticationResult, FilterVerdict } from "../types.js";

/**
 * A single filter stage in the processing pipeline.
 */
interface FilterStage {
  name: string;
  process(ctx: FilterContext): Promise<FilterAction>;
}

type FilterAction =
  | { type: "continue" }
  | { type: "reject"; reason: string }
  | { type: "quarantine"; reason: string }
  | { type: "defer"; reason: string };

interface FilterContext {
  session: SmtpSession;
  envelope: SmtpEnvelope;
  email: ParsedEmail;
  verdict: FilterVerdict;
}

// --- Authentication Check Stage ---

class AuthenticationCheckStage implements FilterStage {
  name = "authentication";

  async process(ctx: FilterContext): Promise<FilterAction> {
    const results: AuthenticationResult[] = [];

    // SPF check: verify the sending IP is authorized for the envelope sender domain
    const spfResult = await this.checkSpf(ctx);
    results.push(spfResult);

    // DKIM check: verify the signature in the email headers
    const dkimResult = await this.checkDkim(ctx);
    results.push(dkimResult);

    // DMARC check: verify alignment between SPF/DKIM and the From domain
    const dmarcResult = await this.checkDmarc(ctx, spfResult, dkimResult);
    results.push(dmarcResult);

    ctx.verdict.authResults.push(...results);

    // Hard fail on DMARC reject policy
    if (dmarcResult.result === "fail" && dmarcResult.details?.includes("p=reject")) {
      return { type: "reject", reason: `DMARC policy rejection for domain ${dmarcResult.domain}` };
    }

    // Flag for further inspection on SPF/DKIM failures
    if (spfResult.result === "fail") {
      ctx.verdict.flags.add("spf_fail");
      ctx.verdict.score = (ctx.verdict.score ?? 0) + 3;
    }
    if (dkimResult.result === "fail") {
      ctx.verdict.flags.add("dkim_fail");
      ctx.verdict.score = (ctx.verdict.score ?? 0) + 2;
    }

    return { type: "continue" };
  }

  private async checkSpf(ctx: FilterContext): Promise<AuthenticationResult> {
    const senderDomain = ctx.envelope.mailFrom.split("@")[1];
    // In production: perform DNS TXT lookup for SPF record and validate
    // the connecting IP against the policy.
    return {
      method: "spf",
      result: "neutral",
      domain: senderDomain,
      details: `SPF check for ${senderDomain} from ${ctx.session.remoteAddress}`,
    };
  }

  private async checkDkim(ctx: FilterContext): Promise<AuthenticationResult> {
    const dkimHeader = ctx.email.headers.find((h) => h.key === "dkim-signature");
    if (!dkimHeader) {
      return { method: "dkim", result: "none", details: "No DKIM signature found" };
    }

    // In production: parse the DKIM-Signature header, fetch the public key
    // from DNS, and verify the cryptographic signature.
    const domainMatch = dkimHeader.value.match(/d=([^;\s]+)/);
    const selectorMatch = dkimHeader.value.match(/s=([^;\s]+)/);

    return {
      method: "dkim",
      result: "neutral",
      domain: domainMatch?.[1],
      selector: selectorMatch?.[1],
      details: "DKIM signature present but verification deferred to production",
    };
  }

  private async checkDmarc(
    ctx: FilterContext,
    spf: AuthenticationResult,
    dkim: AuthenticationResult,
  ): Promise<AuthenticationResult> {
    const fromDomain = ctx.email.from[0]?.address.split("@")[1];
    if (!fromDomain) {
      return { method: "dmarc", result: "none", details: "No From domain" };
    }

    // In production: fetch _dmarc.{domain} TXT record and evaluate alignment
    const spfAligned = spf.result === "pass" && spf.domain === fromDomain;
    const dkimAligned = dkim.result === "pass" && dkim.domain === fromDomain;

    if (spfAligned || dkimAligned) {
      return { method: "dmarc", result: "pass", domain: fromDomain };
    }

    return {
      method: "dmarc",
      result: "neutral",
      domain: fromDomain,
      details: "DMARC evaluation deferred to production DNS lookups",
    };
  }
}

// --- Spam Filter Stage ---

class SpamFilterStage implements FilterStage {
  name = "spam";

  private static readonly SPAM_PHRASES = [
    "buy now", "act now", "limited time", "click here immediately",
    "you have been selected", "congratulations you won",
    "nigerian prince", "wire transfer", "million dollars",
  ];

  private static readonly HEADER_CHECKS = [
    { header: "x-mailer", pattern: /mass\s*mail/i, score: 4 },
    { header: "precedence", pattern: /bulk/i, score: 2 },
  ];

  async process(ctx: FilterContext): Promise<FilterAction> {
    let score = ctx.verdict.score ?? 0;

    // Check for known spam phrases in subject and body
    const textContent = [
      ctx.email.subject,
      ctx.email.text ?? "",
      ctx.email.html ?? "",
    ].join(" ").toLowerCase();

    for (const phrase of SpamFilterStage.SPAM_PHRASES) {
      if (textContent.includes(phrase)) {
        score += 2;
        ctx.verdict.flags.add(`spam_phrase:${phrase}`);
      }
    }

    // Header-based checks
    for (const check of SpamFilterStage.HEADER_CHECKS) {
      const header = ctx.email.headers.find((h) => h.key === check.header);
      if (header && check.pattern.test(header.value)) {
        score += check.score;
        ctx.verdict.flags.add(`spam_header:${check.header}`);
      }
    }

    // Missing or suspicious headers
    if (!ctx.email.messageId) {
      score += 1;
      ctx.verdict.flags.add("missing_message_id");
    }
    if (!ctx.email.date) {
      score += 1;
      ctx.verdict.flags.add("missing_date");
    }

    // Excessive recipients
    if (ctx.envelope.rcptTo.length > 20) {
      score += 2;
      ctx.verdict.flags.add("excessive_recipients");
    }

    ctx.verdict.score = score;

    // Score thresholds
    if (score >= 10) {
      return { type: "reject", reason: `Spam score ${score} exceeds threshold` };
    }
    if (score >= 6) {
      return { type: "quarantine", reason: `Spam score ${score} flagged for review` };
    }

    return { type: "continue" };
  }
}

// --- Phishing Filter Stage ---

class PhishingFilterStage implements FilterStage {
  name = "phishing";

  private static readonly SUSPICIOUS_URL_PATTERNS = [
    /https?:\/\/[^/]*\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/i, // IP-based URLs
    /https?:\/\/[^/]*@[^/]*/i, // URLs with @ (credential harvesting)
    /%[0-9a-f]{2}.*%[0-9a-f]{2}/i, // Heavily encoded URLs
  ];

  async process(ctx: FilterContext): Promise<FilterAction> {
    let score = ctx.verdict.score ?? 0;
    const html = ctx.email.html ?? "";

    // Check for mismatched display text and href in links
    const linkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/gi;
    let linkMatch: RegExpExecArray | null;

    while ((linkMatch = linkRegex.exec(html)) !== null) {
      const href = linkMatch[1]!;
      const displayText = linkMatch[2]!.trim();

      // If display text looks like a URL but differs from href
      if (displayText.match(/^https?:\/\//i) && !href.includes(displayText)) {
        score += 4;
        ctx.verdict.flags.add("phishing:mismatched_url");
      }
    }

    // Check for suspicious URL patterns
    const allUrls = html.match(/https?:\/\/[^\s"'<>]+/gi) ?? [];
    for (const url of allUrls) {
      for (const pattern of PhishingFilterStage.SUSPICIOUS_URL_PATTERNS) {
        if (pattern.test(url)) {
          score += 3;
          ctx.verdict.flags.add("phishing:suspicious_url");
          break;
        }
      }
    }

    // Form action in email HTML
    if (/<form[^>]+action/i.test(html)) {
      score += 5;
      ctx.verdict.flags.add("phishing:form_in_email");
    }

    ctx.verdict.score = score;

    if (score >= 12) {
      return { type: "reject", reason: "Phishing content detected" };
    }

    return { type: "continue" };
  }
}

// --- Content Filter Stage ---

class ContentFilterStage implements FilterStage {
  name = "content";

  private static readonly DANGEROUS_CONTENT_TYPES = new Set([
    "application/x-msdownload",
    "application/x-msdos-program",
    "application/vnd.microsoft.portable-executable",
    "application/x-sh",
    "application/x-csh",
  ]);

  private static readonly DANGEROUS_EXTENSIONS = new Set([
    ".exe", ".scr", ".bat", ".cmd", ".com", ".pif", ".vbs",
    ".js", ".wsh", ".wsf", ".ps1", ".reg", ".dll",
  ]);

  async process(ctx: FilterContext): Promise<FilterAction> {
    for (const attachment of ctx.email.attachments) {
      // Check content type
      if (ContentFilterStage.DANGEROUS_CONTENT_TYPES.has(attachment.contentType)) {
        ctx.verdict.flags.add(`blocked_content_type:${attachment.contentType}`);
        return {
          type: "reject",
          reason: `Blocked attachment type: ${attachment.contentType}`,
        };
      }

      // Check file extension
      const ext = attachment.filename.toLowerCase().match(/\.[^.]+$/)?.[0];
      if (ext && ContentFilterStage.DANGEROUS_EXTENSIONS.has(ext)) {
        ctx.verdict.flags.add(`blocked_extension:${ext}`);
        return {
          type: "reject",
          reason: `Blocked attachment extension: ${ext}`,
        };
      }

      // Check for double extensions (e.g., document.pdf.exe)
      const parts = attachment.filename.split(".");
      if (parts.length > 2) {
        const lastExt = `.${parts[parts.length - 1]!.toLowerCase()}`;
        if (ContentFilterStage.DANGEROUS_EXTENSIONS.has(lastExt)) {
          ctx.verdict.flags.add("blocked_double_extension");
          return {
            type: "reject",
            reason: `Blocked double extension in ${attachment.filename}`,
          };
        }
      }
    }

    return { type: "continue" };
  }
}

// --- Malware Scan Stage ---

class MalwareScanStage implements FilterStage {
  name = "malware";

  // Known malware signatures (CRC-based, for demo purposes).
  // In production: integrate with ClamAV, VirusTotal, or similar service.
  private static readonly EICAR_SIGNATURE = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR";

  async process(ctx: FilterContext): Promise<FilterAction> {
    for (const attachment of ctx.email.attachments) {
      const content = new TextDecoder("utf-8", { fatal: false }).decode(attachment.content);

      // Check for EICAR test string
      if (content.includes(MalwareScanStage.EICAR_SIGNATURE)) {
        ctx.verdict.flags.add("malware:eicar_test");
        return {
          type: "reject",
          reason: `Malware detected in attachment: ${attachment.filename}`,
        };
      }

      // In production: submit attachment hash/content to malware scanning service
      // and await verdict. For large attachments, use streaming scan.
    }

    return { type: "continue" };
  }
}

// --- Pipeline ---

export class FilterPipeline {
  private stages: FilterStage[];

  constructor(stages?: FilterStage[]) {
    this.stages = stages ?? [
      new AuthenticationCheckStage(),
      new SpamFilterStage(),
      new PhishingFilterStage(),
      new ContentFilterStage(),
      new MalwareScanStage(),
    ];
  }

  /**
   * Run the email through all filter stages sequentially.
   * Stops at the first stage that returns a non-continue action.
   */
  async process(
    session: SmtpSession,
    envelope: SmtpEnvelope,
    email: ParsedEmail,
  ): Promise<FilterVerdict> {
    const verdict: FilterVerdict = {
      action: "accept",
      score: 0,
      flags: new Set(),
      authResults: [],
    };

    const ctx: FilterContext = { session, envelope, email, verdict };

    for (const stage of this.stages) {
      try {
        const action = await stage.process(ctx);

        switch (action.type) {
          case "reject":
            verdict.action = "reject";
            verdict.reason = `[${stage.name}] ${action.reason}`;
            return verdict;
          case "quarantine":
            verdict.action = "quarantine";
            verdict.reason = `[${stage.name}] ${action.reason}`;
            return verdict;
          case "defer":
            verdict.action = "defer";
            verdict.reason = `[${stage.name}] ${action.reason}`;
            return verdict;
          case "continue":
            break;
        }
      } catch (err) {
        // Stage errors should not prevent delivery, but log them.
        console.error(`[FilterPipeline] Stage "${stage.name}" threw:`, err);
        verdict.flags.add(`stage_error:${stage.name}`);
      }
    }

    return verdict;
  }

  /**
   * Add a custom filter stage to the pipeline.
   */
  addStage(stage: FilterStage, position?: number): void {
    if (position !== undefined) {
      this.stages.splice(position, 0, stage);
    } else {
      this.stages.push(stage);
    }
  }

  /**
   * Remove a stage by name.
   */
  removeStage(name: string): boolean {
    const idx = this.stages.findIndex((s) => s.name === name);
    if (idx === -1) return false;
    this.stages.splice(idx, 1);
    return true;
  }

  getStageNames(): string[] {
    return this.stages.map((s) => s.name);
  }
}
