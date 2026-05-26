// =============================================================================
// @alecrae/ai-engine — Multi-Layer Spam Classifier
// =============================================================================
// Combines Bayesian scoring, content heuristics, header analysis, and Claude AI
// for ambiguous cases. Each layer contributes a weighted score; the final
// verdict is a composite decision with a confidence level.

import type {
  EmailMessage,
  SpamClassificationResult,
  SpamVerdict,
  SpamReason,
  BayesianResult,
  ContentAnalysisResult,
  HeaderAnalysisResult,
  ClaudeAnalysisResult,
  TrainingDocument,
  BayesianModelState,
  TokenScore,
  SuspiciousUrl,
  ConfidenceScore,
  Result,
  AIEngineError,
} from '../types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MODEL_VERSION = '1.0.0';
const BAYESIAN_WEIGHT = 0.35;
const CONTENT_WEIGHT = 0.25;
const HEADER_WEIGHT = 0.20;
const CLAUDE_WEIGHT = 0.20;
const AMBIGUITY_THRESHOLD_LOW = 0.3;
const AMBIGUITY_THRESHOLD_HIGH = 0.7;
const MIN_TOKEN_LENGTH = 2;
const SMOOTHING_FACTOR = 1; // Laplace smoothing

/** Common spam phrases scored with higher weight */
const SPAM_PHRASES: readonly string[] = [
  'act now', 'click here', 'limited time', 'buy now', 'free gift',
  'congratulations', 'you have been selected', 'winner', 'prize',
  'no obligation', 'risk free', 'satisfaction guaranteed', 'double your',
  'earn extra cash', 'million dollars', 'nigerian prince', 'wire transfer',
  'discount', 'order now', 'special promotion', 'apply now',
  'be your own boss', 'work from home', 'make money', 'cash bonus',
  'incredible deal', 'lowest price', 'no credit check', 'no fees',
  'unsecured', 'opt in', 'bulk mail', 'mass email', 'unsubscribe',
  'viagra', 'cialis', 'pharmacy', 'weight loss', 'diet pill',
] as const;

/** URL shortener domains that obscure real destinations */
const URL_SHORTENERS = new Set([
  'bit.ly', 'tinyurl.com', 'goo.gl', 't.co', 'ow.ly', 'is.gd',
  'buff.ly', 'rebrand.ly', 'bl.ink', 'short.io', 'cutt.ly',
]);

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

/** Tokenize text into normalized lowercase word stems */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= MIN_TOKEN_LENGTH)
    .map((t) => t.replace(/^['-]+|['-]+$/g, ''));
}

// ---------------------------------------------------------------------------
// Bayesian Classifier Engine
// ---------------------------------------------------------------------------

export class BayesianClassifier {
  private spamTokenCounts: Map<string, number>;
  private hamTokenCounts: Map<string, number>;
  private totalSpamDocs: number;
  private totalHamDocs: number;
  private version: string;
  private lastTrainedAt: number;

  constructor(state?: BayesianModelState) {
    this.spamTokenCounts = new Map(state?.spamTokenCounts ?? []);
    this.hamTokenCounts = new Map(state?.hamTokenCounts ?? []);
    this.totalSpamDocs = state?.totalSpamDocuments ?? 0;
    this.totalHamDocs = state?.totalHamDocuments ?? 0;
    this.version = state?.version ?? MODEL_VERSION;
    this.lastTrainedAt = state?.lastTrainedAt ?? Date.now();
  }

  /** Train on a batch of labeled documents */
  train(documents: readonly TrainingDocument[]): void {
    for (const doc of documents) {
      const counts = doc.label === 'spam' ? this.spamTokenCounts : this.hamTokenCounts;
      for (const token of doc.tokens) {
        counts.set(token, (counts.get(token) ?? 0) + 1);
      }
      if (doc.label === 'spam') {
        this.totalSpamDocs++;
      } else {
        this.totalHamDocs++;
      }
    }
    this.lastTrainedAt = Date.now();
  }

  /** Incremental training on a single document */
  trainSingle(tokens: readonly string[], label: 'spam' | 'ham'): void {
    const counts = label === 'spam' ? this.spamTokenCounts : this.hamTokenCounts;
    for (const token of tokens) {
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }
    if (label === 'spam') {
      this.totalSpamDocs++;
    } else {
      this.totalHamDocs++;
    }
    this.lastTrainedAt = Date.now();
  }

  /**
   * Classify tokens using log-probability Bayesian scoring.
   * Uses Laplace smoothing to handle unseen tokens.
   */
  classify(tokens: readonly string[]): BayesianResult {
    const totalDocs = this.totalSpamDocs + this.totalHamDocs;
    if (totalDocs === 0) {
      return {
        spamProbability: 0.5,
        topSpamTokens: [],
        topHamTokens: [],
        totalTokensAnalyzed: tokens.length,
      };
    }

    const priorSpam = Math.log(this.totalSpamDocs / totalDocs);
    const priorHam = Math.log(this.totalHamDocs / totalDocs);

    const totalSpamTokens = this.sumValues(this.spamTokenCounts);
    const totalHamTokens = this.sumValues(this.hamTokenCounts);
    const vocabSize = new Set([
      ...this.spamTokenCounts.keys(),
      ...this.hamTokenCounts.keys(),
    ]).size;

    let logSpam = priorSpam;
    let logHam = priorHam;

    const tokenScores: { token: string; spamScore: number; hamScore: number }[] = [];

    for (const token of tokens) {
      const spamCount = this.spamTokenCounts.get(token) ?? 0;
      const hamCount = this.hamTokenCounts.get(token) ?? 0;

      // Laplace-smoothed log-likelihoods
      const pTokenSpam = Math.log(
        (spamCount + SMOOTHING_FACTOR) / (totalSpamTokens + SMOOTHING_FACTOR * vocabSize),
      );
      const pTokenHam = Math.log(
        (hamCount + SMOOTHING_FACTOR) / (totalHamTokens + SMOOTHING_FACTOR * vocabSize),
      );

      logSpam += pTokenSpam;
      logHam += pTokenHam;
      tokenScores.push({ token, spamScore: pTokenSpam, hamScore: pTokenHam });
    }

    // Convert log-probabilities to a normalised probability via log-sum-exp
    const maxLog = Math.max(logSpam, logHam);
    const spamProbability =
      Math.exp(logSpam - maxLog) /
      (Math.exp(logSpam - maxLog) + Math.exp(logHam - maxLog));

    // Sort for top tokens
    const sortedBySpam = [...tokenScores].sort((a, b) => b.spamScore - a.spamScore);
    const sortedByHam = [...tokenScores].sort((a, b) => b.hamScore - a.hamScore);

    const topSpamTokens: TokenScore[] = sortedBySpam.slice(0, 10).map((t) => ({
      token: t.token,
      score: t.spamScore,
      occurrences: this.spamTokenCounts.get(t.token) ?? 0,
    }));

    const topHamTokens: TokenScore[] = sortedByHam.slice(0, 10).map((t) => ({
      token: t.token,
      score: t.hamScore,
      occurrences: this.hamTokenCounts.get(t.token) ?? 0,
    }));

    return {
      spamProbability,
      topSpamTokens,
      topHamTokens,
      totalTokensAnalyzed: tokens.length,
    };
  }

  /** Export the current model state for persistence */
  exportState(): BayesianModelState {
    return {
      spamTokenCounts: new Map(this.spamTokenCounts),
      hamTokenCounts: new Map(this.hamTokenCounts),
      totalSpamDocuments: this.totalSpamDocs,
      totalHamDocuments: this.totalHamDocs,
      version: this.version,
      lastTrainedAt: this.lastTrainedAt,
    };
  }

  private sumValues(map: Map<string, number>): number {
    let sum = 0;
    for (const v of map.values()) {
      sum += v;
    }
    return sum;
  }
}

// ---------------------------------------------------------------------------
// Content Analysis Layer
// ---------------------------------------------------------------------------

function analyzeContent(email: EmailMessage): ContentAnalysisResult {
  const text = (email.content.textBody ?? '').toLowerCase();
  const html = email.content.htmlBody ?? '';
  const combinedText = text || stripHtml(html);

  // Spam phrase matching
  const spamPhraseMatches: string[] = [];
  let phraseScore = 0;
  for (const phrase of SPAM_PHRASES) {
    if (combinedText.includes(phrase)) {
      spamPhraseMatches.push(phrase);
      phraseScore += 0.05;
    }
  }

  // Caps ratio
  const alphaChars = combinedText.replace(/[^a-zA-Z]/g, '');
  const upperChars = combinedText.replace(/[^A-Z]/g, '');
  const capsRatio = alphaChars.length > 0 ? upperChars.length / alphaChars.length : 0;

  // Exclamation density
  const exclamationCount = (combinedText.match(/!/g) ?? []).length;
  const wordCount = combinedText.split(/\s+/).length;
  const exclamationDensity = wordCount > 0 ? exclamationCount / wordCount : 0;

  // URL analysis
  const urls = extractUrls(html || combinedText);
  const suspiciousUrls: SuspiciousUrl[] = [];
  for (const url of urls) {
    const reasons: string[] = [];
    let riskScore = 0;

    try {
      const parsed = new URL(url);
      const hostname = parsed.hostname.toLowerCase();

      if (URL_SHORTENERS.has(hostname)) {
        reasons.push('URL shortener obscures destination');
        riskScore += 0.3;
      }
      if (/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(hostname)) {
        reasons.push('IP address used instead of domain');
        riskScore += 0.5;
      }
      if (parsed.port && parsed.port !== '80' && parsed.port !== '443') {
        reasons.push('Non-standard port');
        riskScore += 0.2;
      }
      if (hostname.split('.').length > 4) {
        reasons.push('Excessive subdomain depth');
        riskScore += 0.3;
      }
      if (/@/.test(parsed.pathname)) {
        reasons.push('Embedded credentials pattern');
        riskScore += 0.4;
      }
    } catch {
      reasons.push('Malformed URL');
      riskScore += 0.5;
    }

    if (reasons.length > 0) {
      suspiciousUrls.push({ url, reason: reasons.join('; '), riskScore: Math.min(riskScore, 1) });
    }
  }

  // Image-to-text ratio (common spam technique)
  const imageCount = (html.match(/<img[\s>]/gi) ?? []).length;
  const textLength = combinedText.length;
  const imageToTextRatio = textLength > 0 ? imageCount / (textLength / 100) : 0;

  const spamPatternScore = Math.min(
    1,
    phraseScore +
      (capsRatio > 0.3 ? 0.2 : 0) +
      (exclamationDensity > 0.1 ? 0.15 : 0) +
      (suspiciousUrls.length > 0 ? 0.2 : 0) +
      (imageToTextRatio > 0.5 ? 0.15 : 0),
  );

  return {
    spamPatternScore,
    suspiciousUrls,
    capsRatio,
    exclamationDensity,
    spamPhraseMatches,
    imageToTextRatio,
  };
}

// ---------------------------------------------------------------------------
// Header Analysis Layer
// ---------------------------------------------------------------------------

function analyzeHeaders(email: EmailMessage): HeaderAnalysisResult {
  const details: string[] = [];
  let authenticationScore = 1.0;
  let routingAnomalyScore = 0;
  let headerForgeScore = 0;

  const auth = email.headers.authenticationResults;

  // Authentication scoring
  if (auth) {
    if (auth.spf !== 'pass') {
      authenticationScore -= 0.3;
      details.push(`SPF result: ${auth.spf}`);
    }
    if (auth.dkim !== 'pass') {
      authenticationScore -= 0.3;
      details.push(`DKIM result: ${auth.dkim}`);
    }
    if (auth.dmarc !== 'pass') {
      authenticationScore -= 0.3;
      details.push(`DMARC result: ${auth.dmarc}`);
    }
  } else {
    authenticationScore = 0.2;
    details.push('No authentication results found');
  }
  authenticationScore = Math.max(0, authenticationScore);

  // Routing anomaly detection
  const receivedChain = email.headers.receivedChain;
  if (receivedChain.length > 8) {
    routingAnomalyScore += 0.3;
    details.push('Unusually long received chain');
  }

  // Check for time anomalies in received chain (out-of-order timestamps)
  for (let i = 1; i < receivedChain.length; i++) {
    const prev = receivedChain[i - 1];
    const curr = receivedChain[i];
    if (prev && curr && prev.timestamp.getTime() < curr.timestamp.getTime()) {
      routingAnomalyScore += 0.2;
      details.push('Timestamp anomaly in received chain');
      break;
    }
  }

  // Check for missing TLS in chain
  const noTls = receivedChain.filter((h) => !h.tlsVersion);
  if (noTls.length > 0) {
    routingAnomalyScore += 0.1;
    details.push(`${noTls.length} hop(s) without TLS`);
  }

  // Envelope mismatch detection
  const fromDomain = email.headers.from.domain;
  const envelopeMismatch =
    email.headers.replyTo !== undefined &&
    email.headers.replyTo.domain !== fromDomain;

  if (envelopeMismatch) {
    headerForgeScore += 0.3;
    details.push('Reply-To domain differs from From domain');
  }

  // Check for suspicious header patterns
  const rawHeaders = email.headers.raw;
  const xMailer = rawHeaders.get('x-mailer');
  if (xMailer && xMailer.some((v) => /mass|bulk|blast/i.test(v))) {
    headerForgeScore += 0.2;
    details.push('Bulk mailer detected in X-Mailer header');
  }

  return {
    authenticationScore,
    routingAnomalyScore: Math.min(routingAnomalyScore, 1),
    headerForgeScore: Math.min(headerForgeScore, 1),
    envelopeMismatch,
    details,
  };
}

// ---------------------------------------------------------------------------
// Claude AI Analysis (for ambiguous cases)
// ---------------------------------------------------------------------------

export interface ClaudeClient {
  analyze(prompt: string): Promise<{ text: string }>;
}

async function analyzeWithClaude(
  email: EmailMessage,
  client: ClaudeClient,
): Promise<ClaudeAnalysisResult> {
  const prompt = buildClaudePrompt(email);
  const response = await client.analyze(prompt);

  return parseClaudeResponse(response.text);
}

function buildClaudePrompt(email: EmailMessage): string {
  const subject = email.headers.subject;
  const from = `${email.headers.from.name ?? ''} <${email.headers.from.address}>`;
  const body = (email.content.textBody ?? '').slice(0, 2000);

  return [
    'Analyze this email and determine if it is spam. Respond with JSON only.',
    'Format: {"verdict":"ham"|"spam"|"likely_spam"|"likely_ham","confidence":0.0-1.0,"reasoning":"...","categories":["..."]}',
    '',
    `From: ${from}`,
    `Subject: ${subject}`,
    `Body (truncated): ${body}`,
  ].join('\n');
}

function parseClaudeResponse(text: string): ClaudeAnalysisResult {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found in response');
    const parsed = JSON.parse(jsonMatch[0]) as {
      verdict?: string;
      confidence?: number;
      reasoning?: string;
      categories?: string[];
    };
    return {
      verdict: (parsed.verdict as SpamVerdict) ?? 'uncertain',
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      reasoning: parsed.reasoning ?? 'No reasoning provided',
      categories: parsed.categories ?? [],
    };
  } catch {
    return {
      verdict: 'uncertain',
      confidence: 0.3,
      reasoning: 'Failed to parse Claude response',
      categories: [],
    };
  }
}

// ---------------------------------------------------------------------------
// Score Aggregation & Verdict
// ---------------------------------------------------------------------------

function computeConfidence(score: number): ConfidenceScore {
  // Distance from 0.5 — the further, the more confident
  const distance = Math.abs(score - 0.5) * 2;
  let level: ConfidenceScore['level'];
  if (distance >= 0.9) level = 'very_high';
  else if (distance >= 0.7) level = 'high';
  else if (distance >= 0.5) level = 'medium';
  else if (distance >= 0.3) level = 'low';
  else level = 'very_low';

  return { score: distance, level };
}

function deriveVerdict(score: number): SpamVerdict {
  if (score >= 0.85) return 'spam';
  if (score >= 0.65) return 'likely_spam';
  if (score <= 0.15) return 'ham';
  if (score <= 0.35) return 'likely_ham';
  return 'uncertain';
}

function collectReasons(
  bayesian: BayesianResult,
  content: ContentAnalysisResult,
  header: HeaderAnalysisResult,
  claude?: ClaudeAnalysisResult,
): SpamReason[] {
  const reasons: SpamReason[] = [];

  if (bayesian.spamProbability > 0.6) {
    reasons.push({
      code: 'BAYES_HIGH',
      description: `Bayesian spam probability: ${(bayesian.spamProbability * 100).toFixed(1)}%`,
      weight: bayesian.spamProbability,
      layer: 'bayesian',
    });
  }

  if (content.spamPhraseMatches.length > 0) {
    reasons.push({
      code: 'SPAM_PHRASES',
      description: `Matched spam phrases: ${content.spamPhraseMatches.join(', ')}`,
      weight: content.spamPatternScore,
      layer: 'content',
    });
  }

  if (content.suspiciousUrls.length > 0) {
    reasons.push({
      code: 'SUSPICIOUS_URLS',
      description: `${content.suspiciousUrls.length} suspicious URL(s) detected`,
      weight: 0.3,
      layer: 'content',
    });
  }

  if (content.capsRatio > 0.3) {
    reasons.push({
      code: 'HIGH_CAPS',
      description: `Excessive capitalization: ${(content.capsRatio * 100).toFixed(0)}%`,
      weight: 0.15,
      layer: 'content',
    });
  }

  if (header.authenticationScore < 0.5) {
    reasons.push({
      code: 'AUTH_FAIL',
      description: `Authentication failures detected (score: ${header.authenticationScore.toFixed(2)})`,
      weight: 1 - header.authenticationScore,
      layer: 'header',
    });
  }

  if (header.envelopeMismatch) {
    reasons.push({
      code: 'ENVELOPE_MISMATCH',
      description: 'Reply-To domain does not match From domain',
      weight: 0.25,
      layer: 'header',
    });
  }

  if (header.routingAnomalyScore > 0.2) {
    reasons.push({
      code: 'ROUTING_ANOMALY',
      description: 'Routing anomalies detected in received chain',
      weight: header.routingAnomalyScore,
      layer: 'header',
    });
  }

  if (claude && claude.verdict !== 'uncertain') {
    reasons.push({
      code: 'CLAUDE_VERDICT',
      description: `Claude analysis: ${claude.reasoning}`,
      weight: claude.confidence,
      layer: 'claude',
    });
  }

  return reasons;
}

// ---------------------------------------------------------------------------
// Utility Helpers
// ---------------------------------------------------------------------------

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractUrls(text: string): string[] {
  const urlRegex = /https?:\/\/[^\s"'<>)]+/gi;
  return [...text.matchAll(urlRegex)].map((m) => m[0]);
}

// ---------------------------------------------------------------------------
// Main Spam Classifier
// ---------------------------------------------------------------------------

export interface SpamClassifierConfig {
  /** Optional Claude client for ambiguous case escalation */
  claudeClient?: ClaudeClient;
  /** Skip Claude even for ambiguous cases (for testing / cost saving) */
  disableClaude?: boolean;
  /** Weights can be overridden for tuning */
  weights?: {
    bayesian?: number;
    content?: number;
    header?: number;
    claude?: number;
  };
}

export class SpamClassifier {
  private readonly bayesian: BayesianClassifier;
  private readonly config: SpamClassifierConfig;

  constructor(
    bayesianState?: BayesianModelState,
    config: SpamClassifierConfig = {},
  ) {
    this.bayesian = new BayesianClassifier(bayesianState);
    this.config = config;
  }

  /** Train the Bayesian layer with labeled documents */
  train(documents: readonly TrainingDocument[]): void {
    this.bayesian.train(documents);
  }

  /** Report a message as spam or ham for incremental learning */
  reportFeedback(email: EmailMessage, label: 'spam' | 'ham'): void {
    const text = email.content.textBody ?? stripHtml(email.content.htmlBody ?? '');
    const tokens = tokenize(`${email.headers.subject} ${text}`);
    this.bayesian.trainSingle(tokens, label);
  }

  /** Classify an email through all layers */
  async classify(email: EmailMessage): Promise<Result<SpamClassificationResult>> {
    const startTime = performance.now();

    try {
      // Layer 1: Bayesian scoring
      const text = email.content.textBody ?? stripHtml(email.content.htmlBody ?? '');
      const tokens = tokenize(`${email.headers.subject} ${text}`);
      const bayesianResult = this.bayesian.classify(tokens);

      // Layer 2: Content analysis
      const contentResult = analyzeContent(email);

      // Layer 3: Header analysis
      const headerResult = analyzeHeaders(email);

      // Weighted pre-Claude score
      const w = this.config.weights ?? {};
      const wBayes = w.bayesian ?? BAYESIAN_WEIGHT;
      const wContent = w.content ?? CONTENT_WEIGHT;
      const wHeader = w.header ?? HEADER_WEIGHT;
      const wClaude = w.claude ?? CLAUDE_WEIGHT;

      const preClaudeScore =
        bayesianResult.spamProbability * wBayes +
        contentResult.spamPatternScore * wContent +
        (1 - headerResult.authenticationScore + headerResult.routingAnomalyScore + headerResult.headerForgeScore) / 3 * wHeader;

      // Layer 4: Claude AI for ambiguous cases
      let claudeResult: ClaudeAnalysisResult | undefined;
      const isAmbiguous =
        preClaudeScore > AMBIGUITY_THRESHOLD_LOW &&
        preClaudeScore < AMBIGUITY_THRESHOLD_HIGH;

      if (isAmbiguous && !this.config.disableClaude && this.config.claudeClient) {
        try {
          claudeResult = await analyzeWithClaude(email, this.config.claudeClient);
        } catch {
          // Claude unavailable — proceed without it (fallback behavior per AI rules)
          claudeResult = undefined;
        }
      }

      // Final composite score
      let finalScore: number;
      if (claudeResult) {
        const claudeSpamScore =
          claudeResult.verdict === 'spam' ? 1.0 :
          claudeResult.verdict === 'likely_spam' ? 0.75 :
          claudeResult.verdict === 'likely_ham' ? 0.25 :
          claudeResult.verdict === 'ham' ? 0.0 : 0.5;

        const totalWeight = wBayes + wContent + wHeader + wClaude;
        finalScore = (
          bayesianResult.spamProbability * wBayes +
          contentResult.spamPatternScore * wContent +
          (1 - headerResult.authenticationScore + headerResult.routingAnomalyScore + headerResult.headerForgeScore) / 3 * wHeader +
          claudeSpamScore * wClaude
        ) / totalWeight;
      } else {
        // Redistribute Claude's weight proportionally
        const totalWeight = wBayes + wContent + wHeader;
        finalScore = preClaudeScore / totalWeight;
      }

      finalScore = Math.max(0, Math.min(1, finalScore));

      const verdict = deriveVerdict(finalScore);
      const confidence = computeConfidence(finalScore);
      const reasons = collectReasons(bayesianResult, contentResult, headerResult, claudeResult);

      const result: SpamClassificationResult = {
        verdict,
        score: finalScore,
        confidence,
        layers: {
          bayesian: bayesianResult,
          contentAnalysis: contentResult,
          headerAnalysis: headerResult,
          ...(claudeResult !== undefined ? { claudeAnalysis: claudeResult } : {}),
        },
        reasons,
        processingTimeMs: performance.now() - startTime,
        modelVersion: MODEL_VERSION,
      };

      return { ok: true, value: result };
    } catch (err) {
      const error: AIEngineError = {
        code: 'SPAM_CLASSIFICATION_ERROR',
        message: err instanceof Error ? err.message : 'Unknown classification error',
        retryable: true,
      };
      return { ok: false, error };
    }
  }

  /** Export the Bayesian model state for persistence */
  exportModel(): BayesianModelState {
    return this.bayesian.exportState();
  }
}
