// =============================================================================
// @alecrae/ai-engine — Phishing Detection Engine
// =============================================================================
// Multi-signal phishing detector: URL analysis, domain spoofing detection,
// content pattern matching, and urgency language detection.

import type {
  EmailMessage,
  PhishingDetectionResult,
  UrlAnalysisResult,
  DomainSpoofingResult,
  ContentPatternResult,
  UrgencyAnalysisResult,
  PhishingIndicator,
  ConfidenceScore,
  Result,
} from '../types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Well-known brands commonly impersonated in phishing attacks */
const KNOWN_BRANDS: ReadonlyMap<string, readonly string[]> = new Map([
  ['paypal', ['paypal.com', 'paypal.me']],
  ['apple', ['apple.com', 'icloud.com']],
  ['google', ['google.com', 'gmail.com', 'accounts.google.com']],
  ['microsoft', ['microsoft.com', 'outlook.com', 'live.com', 'office.com', 'office365.com']],
  ['amazon', ['amazon.com', 'amazon.co.uk', 'aws.amazon.com']],
  ['netflix', ['netflix.com']],
  ['facebook', ['facebook.com', 'fb.com', 'meta.com']],
  ['instagram', ['instagram.com']],
  ['chase', ['chase.com']],
  ['bank_of_america', ['bankofamerica.com', 'bofa.com']],
  ['wells_fargo', ['wellsfargo.com']],
  ['dropbox', ['dropbox.com']],
  ['linkedin', ['linkedin.com']],
  ['dhl', ['dhl.com']],
  ['fedex', ['fedex.com']],
  ['ups', ['ups.com']],
  ['usps', ['usps.com']],
  ['irs', ['irs.gov']],
]);

/** Common homoglyph substitutions used in domain spoofing */
const HOMOGLYPHS: ReadonlyMap<string, readonly string[]> = new Map([
  ['a', ['\u0430', '\u00e0', '\u00e1', '\u00e2', '\u00e3', '\u00e4']],  // Cyrillic а, accented variants
  ['e', ['\u0435', '\u00e8', '\u00e9', '\u00ea', '\u00eb']],
  ['o', ['\u043e', '\u00f2', '\u00f3', '\u00f4', '\u00f5', '\u00f6', '0']],
  ['i', ['\u0456', '\u00ec', '\u00ed', '\u00ee', '\u00ef', '1', 'l']],
  ['l', ['1', 'I', '\u0049', '\u006c']],
  ['c', ['\u0441', '\u00e7']],
  ['p', ['\u0440']],
  ['s', ['\u0455', '5']],
  ['n', ['\u0578']],
  ['d', ['\u0501']],
  ['g', ['q', '9']],
  ['t', ['\u0442', '7']],
  ['u', ['\u00fc', '\u00f9', '\u00fa', '\u00fb']],
]);

const URL_SHORTENERS = new Set([
  'bit.ly', 'tinyurl.com', 'goo.gl', 't.co', 'ow.ly', 'is.gd',
  'buff.ly', 'rebrand.ly', 'bl.ink', 'short.io', 'cutt.ly', 'rb.gy',
]);

// Content patterns that indicate phishing
const PHISHING_CONTENT_PATTERNS = {
  accountVerification: [
    /verify\s+your\s+(account|identity|email)/i,
    /confirm\s+your\s+(account|identity|information)/i,
    /account\s+verification\s+required/i,
    /validate\s+your\s+(account|credentials)/i,
  ],
  passwordReset: [
    /password\s+(has\s+been\s+)?(reset|changed|expired)/i,
    /reset\s+your\s+password/i,
    /update\s+your\s+password/i,
    /your\s+password\s+will\s+expire/i,
  ],
  suspendedAccount: [
    /account\s+(has\s+been\s+)?(suspended|locked|disabled|restricted)/i,
    /temporarily\s+(locked|suspended|disabled)/i,
    /unusual\s+(activity|sign[\s-]?in|login)/i,
    /unauthorized\s+(access|activity|login)/i,
  ],
  paymentRequired: [
    /payment\s+(failed|declined|required|overdue)/i,
    /update\s+your\s+(payment|billing|credit\s+card)/i,
    /invoice\s+attached/i,
    /outstanding\s+balance/i,
  ],
  prizeClaim: [
    /you('ve|\s+have)\s+(won|been\s+selected)/i,
    /claim\s+your\s+(prize|reward|gift)/i,
    /lottery\s+(winner|notification)/i,
    /congratulations.*winner/i,
  ],
  documentSharing: [
    /shared?\s+a?\s*document\s+with\s+you/i,
    /view\s+(the\s+)?document/i,
    /review\s+(and\s+)?sign/i,
    /important\s+document/i,
  ],
} as const;

// Urgency / threat language
const URGENCY_PATTERNS = {
  deadline: [
    /within\s+\d+\s+(hours?|days?|minutes?)/i,
    /expires?\s+(in\s+)?\d+/i,
    /before\s+(midnight|end\s+of\s+day|close\s+of\s+business)/i,
    /immediate(ly)?\s+(action|attention|response)/i,
    /urgent(ly)?/i,
    /as\s+soon\s+as\s+possible/i,
    /time[\s-]?sensitive/i,
  ],
  threats: [
    /will\s+be\s+(suspended|terminated|closed|deleted|locked)/i,
    /failure\s+to\s+(respond|comply|verify|act)/i,
    /legal\s+(action|consequences|proceedings)/i,
    /law\s+enforcement/i,
    /permanent(ly)?\s+(delete|remove|suspend|lock)/i,
    /report(ed)?\s+to\s+(authorities|police)/i,
  ],
  scarcity: [
    /limited\s+(time|offer|availability|spots?)/i,
    /only\s+\d+\s+(left|remaining|available)/i,
    /last\s+chance/i,
    /final\s+(notice|warning|reminder)/i,
    /don'?t\s+miss\s+(out|this)/i,
    /one[\s-]?time\s+(offer|opportunity)/i,
  ],
} as const;

// ---------------------------------------------------------------------------
// URL Analysis
// ---------------------------------------------------------------------------

function analyzeUrl(url: string, displayText?: string): UrlAnalysisResult {
  const reasons: string[] = [];
  let riskScore = 0;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return {
      url,
      ...(displayText !== undefined ? { displayText } : {}),
      isSuspicious: true,
      reasons: ['Malformed URL'],
      usesUrlShortener: false,
      hasIpAddress: false,
      hasMismatchedDisplay: false,
      riskScore: 0.8,
    };
  }

  const hostname = parsed.hostname.toLowerCase();

  // IP address check
  const hasIpAddress = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname);
  if (hasIpAddress) {
    reasons.push('Direct IP address URL');
    riskScore += 0.5;
  }

  // URL shortener
  const usesUrlShortener = URL_SHORTENERS.has(hostname);
  if (usesUrlShortener) {
    reasons.push('Uses URL shortener to hide destination');
    riskScore += 0.3;
  }

  // Display text mismatch (e.g., <a href="evil.com">paypal.com</a>)
  let hasMismatchedDisplay = false;
  if (displayText) {
    const displayLower = displayText.toLowerCase().trim();
    // Check if display text looks like a URL/domain but differs from actual
    if (/^(https?:\/\/)?[a-z0-9.-]+\.[a-z]{2,}/i.test(displayLower)) {
      try {
        const displayUrl = new URL(displayLower.startsWith('http') ? displayLower : `https://${displayLower}`);
        if (displayUrl.hostname !== hostname) {
          hasMismatchedDisplay = true;
          reasons.push(`Display text "${displayText}" does not match actual URL domain "${hostname}"`);
          riskScore += 0.6;
        }
      } catch {
        // display text is not a valid URL, that's fine
      }
    }
  }

  // Brand impersonation via Levenshtein distance
  let levenshteinToKnownBrand: { brand: string; distance: number } | undefined;
  const domainBase = hostname.replace(/^www\./, '').split('.')[0] ?? '';

  for (const [brand, domains] of KNOWN_BRANDS) {
    for (const legitDomain of domains) {
      const legitBase = legitDomain.split('.')[0] ?? '';
      if (domainBase === legitBase) continue; // Exact match is fine
      const distance = levenshteinDistance(domainBase, legitBase);
      if (distance > 0 && distance <= 2 && domainBase.length >= 3) {
        if (!levenshteinToKnownBrand || distance < levenshteinToKnownBrand.distance) {
          levenshteinToKnownBrand = { brand, distance };
        }
        reasons.push(`Domain "${domainBase}" is ${distance} edit(s) from known brand "${brand}" (${legitDomain})`);
        riskScore += 0.5;
      }
    }
  }

  // Suspicious path patterns (login, signin, verify, etc.)
  if (/\/(login|signin|verify|confirm|secure|account|update|auth|banking)/i.test(parsed.pathname)) {
    reasons.push('URL path contains sensitive action keywords');
    riskScore += 0.2;
  }

  // Data exfiltration via query params (encoded email, base64)
  if (parsed.search.length > 200) {
    reasons.push('Excessively long query string');
    riskScore += 0.15;
  }

  // Excessive subdomains
  const subdomainCount = hostname.split('.').length;
  if (subdomainCount > 4) {
    reasons.push('Excessive subdomain nesting');
    riskScore += 0.25;
  }

  // Non-standard port
  if (parsed.port && parsed.port !== '80' && parsed.port !== '443') {
    reasons.push(`Non-standard port: ${parsed.port}`);
    riskScore += 0.2;
  }

  return {
    url,
    ...(displayText !== undefined ? { displayText } : {}),
    isSuspicious: riskScore > 0.2,
    reasons,
    usesUrlShortener,
    ...(levenshteinToKnownBrand !== undefined ? { levenshteinToKnownBrand } : {}),
    hasIpAddress,
    hasMismatchedDisplay,
    riskScore: Math.min(riskScore, 1),
  };
}

// ---------------------------------------------------------------------------
// Domain Spoofing Detection
// ---------------------------------------------------------------------------

function detectDomainSpoofing(senderDomain: string): DomainSpoofingResult {
  const domainLower = senderDomain.toLowerCase();
  const domainBase = domainLower.replace(/^www\./, '');

  for (const [, domains] of KNOWN_BRANDS) {
    for (const legitDomain of domains) {
      if (domainBase === legitDomain) {
        return { isSpoofed: false, similarity: 1.0 };
      }

      // Typosquat detection
      const legitBase = legitDomain.split('.')[0] ?? '';
      const senderBase = domainBase.split('.')[0] ?? '';
      const distance = levenshteinDistance(senderBase, legitBase);

      if (distance === 1 && senderBase.length >= 3) {
        return {
          isSpoofed: true,
          legitimateDomain: legitDomain,
          spoofingTechnique: 'typosquat',
          similarity: 1 - distance / Math.max(senderBase.length, legitBase.length),
        };
      }

      // Homoglyph detection
      if (containsHomoglyphs(senderBase, legitBase)) {
        return {
          isSpoofed: true,
          legitimateDomain: legitDomain,
          spoofingTechnique: 'homoglyph',
          similarity: 0.95,
        };
      }

      // Subdomain trick: e.g., paypal.evil.com looks like paypal at a glance
      if (domainBase.startsWith(`${legitBase}.`) && domainBase !== legitDomain) {
        return {
          isSpoofed: true,
          legitimateDomain: legitDomain,
          spoofingTechnique: 'subdomain',
          similarity: 0.7,
        };
      }

      // TLD swap: paypal.co instead of paypal.com
      if (senderBase === legitBase && domainBase !== legitDomain) {
        return {
          isSpoofed: true,
          legitimateDomain: legitDomain,
          spoofingTechnique: 'tld_swap',
          similarity: 0.85,
        };
      }

      // Combosquat: paypal-secure.com, paypal-login.com
      if (senderBase.includes(legitBase) && senderBase !== legitBase && senderBase.length < legitBase.length + 10) {
        return {
          isSpoofed: true,
          legitimateDomain: legitDomain,
          spoofingTechnique: 'combosquat',
          similarity: 0.75,
        };
      }
    }
  }

  return { isSpoofed: false, similarity: 0 };
}

function containsHomoglyphs(candidate: string, target: string): boolean {
  if (candidate.length !== target.length) return false;

  let homoglyphCount = 0;
  for (let i = 0; i < candidate.length; i++) {
    const candidateChar = candidate[i];
    const targetChar = target[i];
    if (candidateChar === undefined || targetChar === undefined) continue;
    if (candidateChar === targetChar) continue;

    const substitutes = HOMOGLYPHS.get(targetChar);
    if (substitutes?.includes(candidateChar)) {
      homoglyphCount++;
    } else {
      return false; // Non-homoglyph difference
    }
  }
  return homoglyphCount > 0;
}

// ---------------------------------------------------------------------------
// Content Pattern Analysis
// ---------------------------------------------------------------------------

function analyzeContentPatterns(text: string): ContentPatternResult {
  const matchedPatterns: string[] = [];
  let patternScore = 0;

  const results = {
    accountVerification: false,
    passwordReset: false,
    suspendedAccount: false,
    paymentRequired: false,
    prizeClaim: false,
    documentSharing: false,
  } as Record<string, boolean>;

  for (const [category, patterns] of Object.entries(PHISHING_CONTENT_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        results[category] = true;
        matchedPatterns.push(`${category}: ${pattern.source}`);
        patternScore += 0.15;
        break; // Only count each category once
      }
    }
  }

  return {
    accountVerification: results['accountVerification'] ?? false,
    passwordReset: results['passwordReset'] ?? false,
    suspendedAccount: results['suspendedAccount'] ?? false,
    paymentRequired: results['paymentRequired'] ?? false,
    prizeClaim: results['prizeClaim'] ?? false,
    documentSharing: results['documentSharing'] ?? false,
    matchedPatterns,
    patternScore: Math.min(patternScore, 1),
  };
}

// ---------------------------------------------------------------------------
// Urgency Language Detection
// ---------------------------------------------------------------------------

function analyzeUrgency(text: string): UrgencyAnalysisResult {
  const matchedPhrases: string[] = [];

  let hasDeadline = false;
  for (const pattern of URGENCY_PATTERNS.deadline) {
    const match = text.match(pattern);
    if (match) {
      hasDeadline = true;
      matchedPhrases.push(match[0]);
    }
  }

  let hasThreats = false;
  for (const pattern of URGENCY_PATTERNS.threats) {
    const match = text.match(pattern);
    if (match) {
      hasThreats = true;
      matchedPhrases.push(match[0]);
    }
  }

  let hasScarcityLanguage = false;
  for (const pattern of URGENCY_PATTERNS.scarcity) {
    const match = text.match(pattern);
    if (match) {
      hasScarcityLanguage = true;
      matchedPhrases.push(match[0]);
    }
  }

  const urgencyScore = Math.min(
    1,
    (hasDeadline ? 0.3 : 0) +
    (hasThreats ? 0.4 : 0) +
    (hasScarcityLanguage ? 0.2 : 0) +
    matchedPhrases.length * 0.05,
  );

  return { hasDeadline, hasThreats, hasScarcityLanguage, urgencyScore, matchedPhrases };
}

// ---------------------------------------------------------------------------
// Levenshtein Distance
// ---------------------------------------------------------------------------

function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;

  // Use two-row optimisation for O(min(m,n)) space
  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);

  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        (prev[j] ?? 0) + 1,       // deletion
        (curr[j - 1] ?? 0) + 1,   // insertion
        (prev[j - 1] ?? 0) + cost, // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }

  return prev[n] ?? 0;
}

// ---------------------------------------------------------------------------
// URL Extraction from HTML
// ---------------------------------------------------------------------------

function extractUrlsFromHtml(html: string): { url: string; displayText?: string }[] {
  const results: { url: string; displayText?: string }[] = [];
  const anchorRegex = /<a\s[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;

  let match: RegExpExecArray | null;
  while ((match = anchorRegex.exec(html)) !== null) {
    const url = match[1];
    const displayRaw = match[2];
    if (url) {
      const displayText = displayRaw?.replace(/<[^>]+>/g, '').trim();
      results.push(displayText ? { url, displayText } : { url });
    }
  }

  return results;
}

function extractUrlsFromText(text: string): { url: string }[] {
  const urlRegex = /https?:\/\/[^\s"'<>)]+/gi;
  return [...text.matchAll(urlRegex)].map((m) => ({ url: m[0] }));
}

// ---------------------------------------------------------------------------
// Phishing Detector
// ---------------------------------------------------------------------------

export class PhishingDetector {
  /**
   * Analyse an email for phishing indicators.
   * Returns a composite result with per-signal breakdown.
   */
  async detect(email: EmailMessage): Promise<Result<PhishingDetectionResult>> {
    try {
      const textBody = email.content.textBody ?? '';
      const htmlBody = email.content.htmlBody ?? '';
      const combinedText = textBody || this.stripHtml(htmlBody);

      // 1. URL analysis
      const rawUrls = htmlBody
        ? extractUrlsFromHtml(htmlBody)
        : extractUrlsFromText(textBody);

      const urlAnalysis: UrlAnalysisResult[] = rawUrls.map((u) => {
        const displayText = 'displayText' in u ? (u as { displayText?: string }).displayText : undefined;
        return displayText !== undefined
          ? analyzeUrl(u.url, displayText)
          : analyzeUrl(u.url);
      });

      // 2. Domain spoofing
      const domainSpoofing = detectDomainSpoofing(email.headers.from.domain);

      // 3. Content patterns
      const contentPatterns = analyzeContentPatterns(combinedText);

      // 4. Urgency analysis
      const urgencyAnalysis = analyzeUrgency(combinedText);

      // Collect indicators
      const indicators: PhishingIndicator[] = [];

      for (const urlResult of urlAnalysis) {
        if (urlResult.isSuspicious) {
          indicators.push({
            type: 'url',
            description: urlResult.reasons.join('; '),
            severity: urlResult.riskScore >= 0.7 ? 'critical' : urlResult.riskScore >= 0.4 ? 'high' : 'medium',
          });
        }
      }

      if (domainSpoofing.isSpoofed) {
        indicators.push({
          type: 'domain',
          description: `Domain "${email.headers.from.domain}" appears to impersonate ${domainSpoofing.legitimateDomain} via ${domainSpoofing.spoofingTechnique}`,
          severity: 'critical',
        });
      }

      if (contentPatterns.patternScore > 0) {
        indicators.push({
          type: 'content',
          description: `Phishing content patterns detected: ${contentPatterns.matchedPatterns.join(', ')}`,
          severity: contentPatterns.patternScore >= 0.5 ? 'high' : 'medium',
        });
      }

      if (urgencyAnalysis.urgencyScore > 0.2) {
        indicators.push({
          type: 'urgency',
          description: `Urgency/threat language: ${urgencyAnalysis.matchedPhrases.join(', ')}`,
          severity: urgencyAnalysis.hasThreats ? 'high' : 'medium',
        });
      }

      // Authentication failures as sender indicator
      const auth = email.headers.authenticationResults;
      if (auth && (auth.spf === 'fail' || auth.dkim === 'fail' || auth.dmarc === 'fail')) {
        indicators.push({
          type: 'sender',
          description: 'Email authentication failures (SPF/DKIM/DMARC)',
          severity: 'high',
        });
      }

      // Composite score
      const maxUrlRisk = urlAnalysis.reduce((max, u) => Math.max(max, u.riskScore), 0);
      const score = Math.min(1, (
        maxUrlRisk * 0.3 +
        (domainSpoofing.isSpoofed ? domainSpoofing.similarity * 0.3 : 0) +
        contentPatterns.patternScore * 0.2 +
        urgencyAnalysis.urgencyScore * 0.2
      ));

      const isPhishing = score >= 0.5;
      const confidence = this.computeConfidence(score, indicators.length);

      return {
        ok: true,
        value: {
          isPhishing,
          confidence,
          score,
          urlAnalysis,
          domainSpoofing,
          contentPatterns,
          urgencyAnalysis,
          indicators,
        },
      };
    } catch (err) {
      return {
        ok: false,
        error: {
          code: 'PHISHING_DETECTION_ERROR',
          message: err instanceof Error ? err.message : 'Unknown error',
          retryable: true,
        },
      };
    }
  }

  private computeConfidence(score: number, indicatorCount: number): ConfidenceScore {
    // More indicators = higher confidence in the classification
    const distance = Math.abs(score - 0.5) * 2;
    const indicatorBoost = Math.min(indicatorCount * 0.1, 0.3);
    const adjustedScore = Math.min(1, distance + indicatorBoost);

    let level: ConfidenceScore['level'];
    if (adjustedScore >= 0.9) level = 'very_high';
    else if (adjustedScore >= 0.7) level = 'high';
    else if (adjustedScore >= 0.5) level = 'medium';
    else if (adjustedScore >= 0.3) level = 'low';
    else level = 'very_low';

    return { score: adjustedScore, level };
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}

export { levenshteinDistance };
