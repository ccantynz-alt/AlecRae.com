// =============================================================================
// @alecrae/ai-engine — AI-Powered Email Classifier (Claude API)
// =============================================================================
// Fast email classification using Claude Haiku. Includes an in-memory LRU cache
// keyed by SHA-256 content hash, a 2-second hard timeout, and graceful fallback
// to rule-based scoring when the API is unavailable or slow.

import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "node:crypto";
import type { Result } from "./types.js";

// ---------------------------------------------------------------------------
// Public Types
// ---------------------------------------------------------------------------

export type EmailCategory =
  | "spam"
  | "phishing"
  | "malware"
  | "legitimate"
  | "marketing"
  | "transactional";

export interface EmailClassificationInput {
  readonly from: string;
  readonly to: string;
  readonly subject: string;
  readonly textBody?: string;
  readonly htmlBody?: string;
  readonly headers?: readonly { key: string; value: string }[];
}

export interface EmailClassificationResult {
  readonly spamScore: number; // 0-10
  readonly categories: readonly EmailCategory[];
  readonly confidence: number; // 0-1
  readonly reasoning: string;
  readonly source: "ai" | "rule-based";
  readonly cached: boolean;
  readonly durationMs: number;
}

export interface ThreatIndicator {
  readonly type:
    | "urgency_manipulation"
    | "social_engineering"
    | "brand_impersonation"
    | "suspicious_urls";
  readonly detected: boolean;
  readonly confidence: number; // 0-1
  readonly details: string;
}

export interface ContentAnalysisResult {
  readonly indicators: readonly ThreatIndicator[];
  readonly overallThreatScore: number; // 0-1
  readonly source: "ai" | "rule-based";
  readonly durationMs: number;
}

// ---------------------------------------------------------------------------
// LRU Cache
// ---------------------------------------------------------------------------

class LRUCache<K, V> {
  private readonly map = new Map<K, V>();
  private readonly maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    const value = this.map.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.map.delete(key);
      this.map.set(key, value);
    }
    return value;
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.maxSize) {
      // Evict least recently used (first entry)
      const firstKey = this.map.keys().next().value;
      if (firstKey !== undefined) {
        this.map.delete(firstKey);
      }
    }
    this.map.set(key, value);
  }

  get size(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CLASSIFICATION_TIMEOUT_MS = 2000;
const ANALYSIS_TIMEOUT_MS = 2000;
const CACHE_MAX_ENTRIES = 5000;
const HAIKU_MODEL = "claude-haiku-4-20250414";

// ---------------------------------------------------------------------------
// Content Hashing
// ---------------------------------------------------------------------------

function hashEmailContent(email: EmailClassificationInput): string {
  const content = [
    email.from,
    email.to,
    email.subject,
    email.textBody ?? "",
    email.htmlBody ?? "",
  ].join("\x00");
  return createHash("sha256").update(content).digest("hex");
}

function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

// ---------------------------------------------------------------------------
// Rule-Based Fallback Classifier
// ---------------------------------------------------------------------------

const SPAM_KEYWORDS = [
  "viagra",
  "cialis",
  "free gift",
  "act now",
  "click here",
  "limited time",
  "buy now",
  "winner",
  "congratulations",
  "million dollars",
  "nigerian prince",
  "wire transfer",
  "earn extra cash",
  "work from home",
  "no obligation",
  "risk free",
  "weight loss",
  "diet pill",
];

const PHISHING_PATTERNS = [
  /verify\s+your\s+(?:account|identity|password)/i,
  /suspended?\s+(?:your\s+)?account/i,
  /confirm\s+your\s+(?:identity|billing|payment)/i,
  /unusual\s+(?:activity|sign[- ]?in)/i,
  /update\s+your\s+(?:payment|billing)/i,
  /your\s+account\s+(?:has been|will be)\s+(?:locked|suspended|closed)/i,
];

const URGENCY_PATTERNS = [
  /urgent/i,
  /act\s+now/i,
  /immediately/i,
  /expire[sd]?\s+(?:soon|today|tomorrow)/i,
  /last\s+chance/i,
  /don't\s+(?:miss|wait|delay)/i,
  /limited\s+time/i,
  /within\s+\d+\s+hours?/i,
];

const SOCIAL_ENGINEERING_PATTERNS = [
  /(?:dear|hello)\s+(?:sir|madam|customer|user|friend)/i,
  /i\s+am\s+(?:a\s+)?(?:prince|minister|doctor|lawyer|barrister)/i,
  /you\s+have\s+been\s+(?:selected|chosen)/i,
  /confidential/i,
  /do\s+not\s+share/i,
];

const BRAND_IMPERSONATION_DOMAINS = [
  "paypal",
  "amazon",
  "apple",
  "microsoft",
  "google",
  "netflix",
  "facebook",
  "instagram",
  "bank of america",
  "chase",
  "wells fargo",
  "usps",
  "fedex",
  "ups",
  "dhl",
];

function ruleBasedClassify(
  email: EmailClassificationInput,
): EmailClassificationResult {
  const startTime = performance.now();
  const body = (
    (email.textBody ?? "") +
    " " +
    (email.htmlBody ?? "")
  ).toLowerCase();
  const subject = (email.subject ?? "").toLowerCase();
  const combined = subject + " " + body;

  let spamScore = 0;
  const categories: EmailCategory[] = [];

  // Spam keyword matching
  let spamKeywordHits = 0;
  for (const keyword of SPAM_KEYWORDS) {
    if (combined.includes(keyword)) {
      spamKeywordHits++;
    }
  }
  spamScore += Math.min(spamKeywordHits * 1.5, 6);

  // Phishing pattern matching
  let phishingHits = 0;
  for (const pattern of PHISHING_PATTERNS) {
    if (pattern.test(combined)) phishingHits++;
  }
  if (phishingHits >= 2) {
    categories.push("phishing");
    spamScore += 3;
  }

  // ALL CAPS subject
  if (
    email.subject &&
    email.subject === email.subject.toUpperCase() &&
    email.subject.length > 10
  ) {
    spamScore += 1;
  }

  // Exclamation density
  const exclamations = (combined.match(/!/g) ?? []).length;
  if (exclamations > 5) {
    spamScore += 1;
  }

  // Categorize
  if (spamScore >= 5) {
    categories.push("spam");
  } else if (spamScore <= 2 && phishingHits === 0) {
    categories.push("legitimate");
  }

  if (categories.length === 0) {
    categories.push(spamScore >= 3 ? "spam" : "legitimate");
  }

  spamScore = Math.max(0, Math.min(10, Math.round(spamScore)));

  return {
    spamScore,
    categories,
    confidence: 0.4, // Low confidence for rule-based
    reasoning: "Rule-based classification (AI unavailable)",
    source: "rule-based",
    cached: false,
    durationMs: performance.now() - startTime,
  };
}

function ruleBasedAnalyzeContent(text: string): ContentAnalysisResult {
  const startTime = performance.now();
  const lower = text.toLowerCase();
  const indicators: ThreatIndicator[] = [];

  // Urgency manipulation
  let urgencyHits = 0;
  for (const pattern of URGENCY_PATTERNS) {
    if (pattern.test(lower)) urgencyHits++;
  }
  indicators.push({
    type: "urgency_manipulation",
    detected: urgencyHits >= 2,
    confidence: Math.min(urgencyHits * 0.25, 0.9),
    details:
      urgencyHits > 0
        ? `${urgencyHits} urgency pattern(s) detected`
        : "No urgency manipulation detected",
  });

  // Social engineering
  let socialHits = 0;
  for (const pattern of SOCIAL_ENGINEERING_PATTERNS) {
    if (pattern.test(lower)) socialHits++;
  }
  indicators.push({
    type: "social_engineering",
    detected: socialHits >= 1,
    confidence: Math.min(socialHits * 0.3, 0.9),
    details:
      socialHits > 0
        ? `${socialHits} social engineering pattern(s) detected`
        : "No social engineering detected",
  });

  // Brand impersonation
  let brandHits = 0;
  for (const brand of BRAND_IMPERSONATION_DOMAINS) {
    if (lower.includes(brand)) brandHits++;
  }
  // Brand mention alone is not impersonation; combined with phishing patterns it is
  let phishingHits = 0;
  for (const pattern of PHISHING_PATTERNS) {
    if (pattern.test(lower)) phishingHits++;
  }
  const brandImpersonation = brandHits > 0 && phishingHits > 0;
  indicators.push({
    type: "brand_impersonation",
    detected: brandImpersonation,
    confidence: brandImpersonation ? Math.min(0.5 + phishingHits * 0.15, 0.9) : 0,
    details: brandImpersonation
      ? `Brand mention with phishing patterns detected`
      : "No brand impersonation detected",
  });

  // Suspicious URLs
  const urlRegex = /https?:\/\/[^\s"'<>)]+/gi;
  const urls = lower.match(urlRegex) ?? [];
  let suspiciousUrlCount = 0;
  for (const url of urls) {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname;
      if (/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(host)) {
        suspiciousUrlCount++;
      } else if (host.split(".").length > 4) {
        suspiciousUrlCount++;
      }
    } catch {
      suspiciousUrlCount++;
    }
  }
  indicators.push({
    type: "suspicious_urls",
    detected: suspiciousUrlCount > 0,
    confidence: Math.min(suspiciousUrlCount * 0.3, 0.9),
    details:
      suspiciousUrlCount > 0
        ? `${suspiciousUrlCount} suspicious URL(s) found`
        : "No suspicious URLs detected",
  });

  const overallThreatScore = Math.min(
    1,
    indicators.reduce(
      (sum, ind) => sum + (ind.detected ? ind.confidence * 0.25 : 0),
      0,
    ),
  );

  return {
    indicators,
    overallThreatScore,
    source: "rule-based",
    durationMs: performance.now() - startTime,
  };
}

// ---------------------------------------------------------------------------
// AI Classifier
// ---------------------------------------------------------------------------

let anthropicClient: Anthropic | null = null;

function getClient(): Anthropic | null {
  if (anthropicClient) return anthropicClient;
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return null;
  anthropicClient = new Anthropic({ apiKey });
  return anthropicClient;
}

// Module-level caches
const classificationCache = new LRUCache<string, EmailClassificationResult>(
  CACHE_MAX_ENTRIES,
);
const analysisCache = new LRUCache<string, ContentAnalysisResult>(
  CACHE_MAX_ENTRIES,
);

/**
 * Classify an email using Claude Haiku for fast AI-powered spam/content detection.
 *
 * - Caches results by SHA-256 of email content
 * - 2-second timeout; falls back to rule-based classification on timeout or error
 * - Gracefully degrades when ANTHROPIC_API_KEY is not set
 */
export async function classifyEmail(
  email: EmailClassificationInput,
): Promise<Result<EmailClassificationResult>> {
  const startTime = performance.now();

  try {
    // Check cache first
    const contentHash = hashEmailContent(email);
    const cached = classificationCache.get(contentHash);
    if (cached) {
      return {
        ok: true,
        value: { ...cached, cached: true, durationMs: performance.now() - startTime },
      };
    }

    // Check if AI is available
    const client = getClient();
    if (!client) {
      const result = ruleBasedClassify(email);
      return { ok: true, value: result };
    }

    // Build prompt
    const truncatedBody = (email.textBody ?? email.htmlBody ?? "").slice(
      0,
      2000,
    );
    const headersSummary = (email.headers ?? [])
      .slice(0, 10)
      .map((h) => `${h.key}: ${h.value}`)
      .join("\n");

    const prompt = `Analyze this email and classify it. Respond with ONLY valid JSON, no other text.

From: ${email.from}
To: ${email.to}
Subject: ${email.subject}
${headersSummary ? `Headers:\n${headersSummary}` : ""}

Body (truncated):
${truncatedBody}

Respond with this exact JSON structure:
{
  "spamScore": <number 0-10, where 0 is definitely not spam and 10 is definitely spam>,
  "categories": [<one or more of: "spam", "phishing", "malware", "legitimate", "marketing", "transactional">],
  "confidence": <number 0-1>,
  "reasoning": "<brief explanation>"
}`;

    // Call Claude with timeout
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      CLASSIFICATION_TIMEOUT_MS,
    );

    let response: Anthropic.Message;
    try {
      response = await client.messages.create(
        {
          model: HAIKU_MODEL,
          max_tokens: 256,
          messages: [{ role: "user", content: prompt }],
        },
        { signal: controller.signal },
      );
    } finally {
      clearTimeout(timeout);
    }

    // Parse response
    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      const result = ruleBasedClassify(email);
      return { ok: true, value: result };
    }

    const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      const result = ruleBasedClassify(email);
      return { ok: true, value: result };
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      spamScore?: number;
      categories?: string[];
      confidence?: number;
      reasoning?: string;
    };

    const validCategories: EmailCategory[] = (parsed.categories ?? []).filter(
      (c): c is EmailCategory =>
        [
          "spam",
          "phishing",
          "malware",
          "legitimate",
          "marketing",
          "transactional",
        ].includes(c),
    );

    const result: EmailClassificationResult = {
      spamScore: Math.max(
        0,
        Math.min(10, Math.round(parsed.spamScore ?? 5)),
      ),
      categories:
        validCategories.length > 0 ? validCategories : ["legitimate"],
      confidence: Math.max(0, Math.min(1, parsed.confidence ?? 0.5)),
      reasoning: parsed.reasoning ?? "No reasoning provided",
      source: "ai",
      cached: false,
      durationMs: performance.now() - startTime,
    };

    // Cache the result
    classificationCache.set(contentHash, result);

    return { ok: true, value: result };
  } catch {
    // Timeout, network error, or parse failure — fall back to rule-based
    const result = ruleBasedClassify(email);
    return { ok: true, value: result };
  }
}

/**
 * Perform deeper content analysis for threat detection using Claude.
 *
 * Detects: urgency manipulation, social engineering, brand impersonation,
 * suspicious URLs. Returns threat indicators with confidence scores.
 */
export async function analyzeContent(
  text: string,
): Promise<Result<ContentAnalysisResult>> {
  const startTime = performance.now();

  try {
    // Check cache
    const textHash = hashText(text);
    const cached = analysisCache.get(textHash);
    if (cached) {
      return {
        ok: true,
        value: { ...cached, durationMs: performance.now() - startTime },
      };
    }

    const client = getClient();
    if (!client) {
      const result = ruleBasedAnalyzeContent(text);
      return { ok: true, value: result };
    }

    const truncated = text.slice(0, 3000);

    const prompt = `Analyze this email text for security threats. Respond with ONLY valid JSON, no other text.

Text:
${truncated}

Respond with this exact JSON structure:
{
  "indicators": [
    {
      "type": "urgency_manipulation",
      "detected": <boolean>,
      "confidence": <0-1>,
      "details": "<brief explanation>"
    },
    {
      "type": "social_engineering",
      "detected": <boolean>,
      "confidence": <0-1>,
      "details": "<brief explanation>"
    },
    {
      "type": "brand_impersonation",
      "detected": <boolean>,
      "confidence": <0-1>,
      "details": "<brief explanation>"
    },
    {
      "type": "suspicious_urls",
      "detected": <boolean>,
      "confidence": <0-1>,
      "details": "<brief explanation>"
    }
  ],
  "overallThreatScore": <0-1>
}`;

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      ANALYSIS_TIMEOUT_MS,
    );

    let response: Anthropic.Message;
    try {
      response = await client.messages.create(
        {
          model: HAIKU_MODEL,
          max_tokens: 512,
          messages: [{ role: "user", content: prompt }],
        },
        { signal: controller.signal },
      );
    } finally {
      clearTimeout(timeout);
    }

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      const result = ruleBasedAnalyzeContent(text);
      return { ok: true, value: result };
    }

    const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      const result = ruleBasedAnalyzeContent(text);
      return { ok: true, value: result };
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      indicators?: {
        type?: string;
        detected?: boolean;
        confidence?: number;
        details?: string;
      }[];
      overallThreatScore?: number;
    };

    const validTypes = new Set([
      "urgency_manipulation",
      "social_engineering",
      "brand_impersonation",
      "suspicious_urls",
    ]);

    const indicators: ThreatIndicator[] = (parsed.indicators ?? [])
      .filter((ind) => ind.type && validTypes.has(ind.type))
      .map((ind) => ({
        type: ind.type as ThreatIndicator["type"],
        detected: ind.detected ?? false,
        confidence: Math.max(0, Math.min(1, ind.confidence ?? 0)),
        details: ind.details ?? "",
      }));

    // Ensure all 4 indicator types are present
    for (const requiredType of validTypes) {
      if (!indicators.some((ind) => ind.type === requiredType)) {
        indicators.push({
          type: requiredType as ThreatIndicator["type"],
          detected: false,
          confidence: 0,
          details: "Not analyzed",
        });
      }
    }

    const result: ContentAnalysisResult = {
      indicators,
      overallThreatScore: Math.max(
        0,
        Math.min(1, parsed.overallThreatScore ?? 0),
      ),
      source: "ai",
      durationMs: performance.now() - startTime,
    };

    analysisCache.set(textHash, result);

    return { ok: true, value: result };
  } catch {
    const result = ruleBasedAnalyzeContent(text);
    return { ok: true, value: result };
  }
}

/**
 * Clear the classification and analysis caches.
 * Useful for testing or when memory pressure is high.
 */
export function clearCaches(): void {
  classificationCache.clear();
  analysisCache.clear();
}

/**
 * Check whether the AI classifier is available (API key is set).
 */
export function isAIAvailable(): boolean {
  return getClient() !== null;
}
