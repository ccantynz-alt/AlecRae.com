// =============================================================================
// @alecrae/ai-engine — Email Sentiment Analyzer
// =============================================================================
// Detects emotional tone in emails, tracks sentiment across conversation
// threads, identifies urgency levels, and alerts on significant tone shifts
// within a relationship. Uses a combination of keyword/pattern scoring and
// optional Claude AI for nuanced analysis.

import type {
  EmailMessage,
  SentimentResult,
  Result,
  AIEngineError,
} from '../types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MODEL_VERSION = '1.0.0';

/** Minimum text length to produce a meaningful sentiment score */
const MIN_TEXT_LENGTH = 10;

/** Threshold for tone shift alerts (absolute delta) */
const TONE_SHIFT_ALERT_THRESHOLD = 0.4;

/** Window size for trend detection */
const TREND_WINDOW_SIZE = 5;

// ---------------------------------------------------------------------------
// Tone & Sentiment Types
// ---------------------------------------------------------------------------

export type EmotionalTone = 'positive' | 'negative' | 'neutral' | 'urgent' | 'frustrated';

export interface DetailedSentiment {
  readonly overall: SentimentResult;
  readonly tone: EmotionalTone;
  readonly toneConfidence: number;
  readonly urgencyScore: number;
  readonly frustrationScore: number;
  readonly positivityScore: number;
  readonly formality: number;
  readonly emotionalIntensity: number;
  readonly processingTimeMs: number;
  readonly modelVersion: string;
}

export interface ThreadSentimentResult {
  readonly threadId: string;
  readonly messages: readonly MessageSentiment[];
  readonly overallTrend: 'improving' | 'stable' | 'declining';
  readonly averageSentiment: number;
  readonly toneProgression: readonly EmotionalTone[];
  readonly hasEscalation: boolean;
  readonly escalationPoint?: number;
}

export interface MessageSentiment {
  readonly messageId: string;
  readonly timestamp: number;
  readonly sentiment: DetailedSentiment;
}

export interface RelationshipSentimentHistory {
  readonly contactId: string;
  readonly entries: readonly SentimentEntry[];
  readonly overallTrend: 'improving' | 'stable' | 'declining';
  readonly averageSentiment: number;
  readonly emotionalVolatility: number;
}

export interface SentimentEntry {
  readonly timestamp: number;
  readonly score: number;
  readonly tone: EmotionalTone;
}

export interface ToneShiftAlert {
  readonly contactId: string;
  readonly previousTone: EmotionalTone;
  readonly currentTone: EmotionalTone;
  readonly sentimentDelta: number;
  readonly detectedAt: number;
  readonly description: string;
  readonly severity: 'info' | 'warning' | 'critical';
}

// ---------------------------------------------------------------------------
// Keyword Lexicons
// ---------------------------------------------------------------------------

const POSITIVE_WORDS: ReadonlySet<string> = new Set([
  'thank', 'thanks', 'grateful', 'appreciate', 'great', 'excellent',
  'wonderful', 'fantastic', 'amazing', 'perfect', 'happy', 'glad',
  'pleased', 'delighted', 'love', 'enjoy', 'brilliant', 'outstanding',
  'impressive', 'congratulations', 'congrats', 'awesome', 'superb',
  'well done', 'good job', 'excited', 'thrilled', 'fortunate',
]);

const NEGATIVE_WORDS: ReadonlySet<string> = new Set([
  'sorry', 'unfortunately', 'disappointed', 'frustrat', 'annoyed',
  'unacceptable', 'terrible', 'horrible', 'awful', 'worst', 'fail',
  'failure', 'problem', 'issue', 'concern', 'complaint', 'upset',
  'angry', 'furious', 'dissatisfied', 'regret', 'mistake', 'error',
  'broken', 'wrong', 'poor', 'bad', 'displeased', 'unhappy',
]);

const URGENCY_WORDS: ReadonlySet<string> = new Set([
  'urgent', 'asap', 'immediately', 'right away', 'critical',
  'deadline', 'overdue', 'time-sensitive', 'emergency', 'now',
  'today', 'eod', 'end of day', 'by tomorrow', 'as soon as',
  'priority', 'escalate', 'blocker', 'p0', 'p1',
]);

const FRUSTRATION_WORDS: ReadonlySet<string> = new Set([
  'frustrat', 'still waiting', 'no response', 'follow up again',
  'yet again', 'still not', 'repeatedly', 'multiple times',
  'unresolved', 'ignored', 'unacceptable', 'ridiculous',
  'waste of time', 'fed up', 'enough', 'sick of', 'tired of',
  'how many times', 'once again', 'third time', 'last time',
]);

const FORMAL_MARKERS: ReadonlySet<string> = new Set([
  'dear', 'sincerely', 'regards', 'respectfully', 'hereby',
  'pursuant', 'accordingly', 'kindly', 'please be advised',
  'for your reference', 'attached herewith', 'per our',
]);

const INFORMAL_MARKERS: ReadonlySet<string> = new Set([
  'hey', 'hi', 'lol', 'haha', 'btw', 'gonna', 'wanna',
  'cool', 'awesome', 'yep', 'nope', 'cheers', 'thanks!',
]);

// ---------------------------------------------------------------------------
// Claude AI Client Interface
// ---------------------------------------------------------------------------

export interface SentimentAIClient {
  analyze(prompt: string): Promise<{ text: string }>;
}

// ---------------------------------------------------------------------------
// Sentiment Analyzer
// ---------------------------------------------------------------------------

export interface SentimentAnalyzerConfig {
  /** Optional Claude client for nuanced analysis */
  readonly aiClient?: SentimentAIClient;
  /** Disable AI even if client is provided (for testing / cost saving) */
  readonly disableAI?: boolean;
  /** Threshold for generating tone shift alerts */
  readonly toneShiftThreshold?: number;
}

export class SentimentAnalyzer {
  private readonly config: SentimentAnalyzerConfig;
  private readonly relationshipHistory = new Map<string, SentimentEntry[]>();

  constructor(config: SentimentAnalyzerConfig = {}) {
    this.config = config;
  }

  // -----------------------------------------------------------------------
  // Public API — Single Email Analysis
  // -----------------------------------------------------------------------

  /**
   * Analyze the sentiment of a single email.
   */
  analyze(email: EmailMessage): Result<DetailedSentiment> {
    const startTime = performance.now();

    try {
      const text = this.extractText(email);

      if (text.length < MIN_TEXT_LENGTH) {
        return {
          ok: true,
          value: this.neutralSentiment(performance.now() - startTime),
        };
      }

      const words = text.toLowerCase().split(/\s+/);

      // Score each dimension
      const positivityScore = this.scoreWordSet(words, POSITIVE_WORDS);
      const negativityScore = this.scoreWordSet(words, NEGATIVE_WORDS);
      const urgencyScore = this.scoreWordSet(words, URGENCY_WORDS);
      const frustrationScore = this.scoreWordSet(words, FRUSTRATION_WORDS);
      const formalityScore = this.scoreFormalityLevel(words);

      // Composite sentiment score: -1 (very negative) to +1 (very positive)
      const rawSentiment = positivityScore - negativityScore;
      const normalizedSentiment = Math.max(-1, Math.min(1, rawSentiment));

      // Determine overall sentiment label
      const overall = this.deriveSentimentResult(normalizedSentiment);

      // Determine emotional tone
      const tone = this.deriveTone(
        positivityScore,
        negativityScore,
        urgencyScore,
        frustrationScore,
      );

      // Emotional intensity (how strong the emotions are regardless of direction)
      const emotionalIntensity = Math.min(
        1,
        positivityScore + negativityScore + urgencyScore + frustrationScore,
      );

      // Confidence based on text length and signal strength
      const toneConfidence = Math.min(
        1,
        0.3 + emotionalIntensity * 0.4 + Math.min(words.length / 200, 0.3),
      );

      const result: DetailedSentiment = {
        overall,
        tone,
        toneConfidence,
        urgencyScore: Math.min(1, urgencyScore),
        frustrationScore: Math.min(1, frustrationScore),
        positivityScore: Math.min(1, positivityScore),
        formality: formalityScore,
        emotionalIntensity,
        processingTimeMs: performance.now() - startTime,
        modelVersion: MODEL_VERSION,
      };

      return { ok: true, value: result };
    } catch (err) {
      const error: AIEngineError = {
        code: 'SENTIMENT_ANALYSIS_ERROR',
        message: err instanceof Error ? err.message : 'Unknown sentiment analysis error',
        retryable: true,
      };
      return { ok: false, error };
    }
  }

  // -----------------------------------------------------------------------
  // Public API — Thread Analysis
  // -----------------------------------------------------------------------

  /**
   * Analyze sentiment across a conversation thread.
   * Messages should be provided in chronological order.
   */
  analyzeThread(
    threadId: string,
    messages: readonly EmailMessage[],
  ): Result<ThreadSentimentResult> {
    try {
      const messageSentiments: MessageSentiment[] = [];

      for (const message of messages) {
        const result = this.analyze(message);
        if (!result.ok) {
          continue; // skip messages that fail analysis
        }
        messageSentiments.push({
          messageId: message.id,
          timestamp: message.receivedAt.getTime(),
          sentiment: result.value,
        });
      }

      if (messageSentiments.length === 0) {
        return {
          ok: false,
          error: {
            code: 'EMPTY_THREAD',
            message: 'No messages could be analyzed in the thread',
            retryable: false,
          },
        };
      }

      const scores = messageSentiments.map(
        (m) => m.sentiment.overall.score,
      );
      const tones = messageSentiments.map((m) => m.sentiment.tone);

      const averageSentiment =
        scores.reduce((a, b) => a + b, 0) / scores.length;

      const overallTrend = this.computeTrend(scores);

      // Detect escalation (sustained negative shift)
      const { hasEscalation, escalationPoint } = this.detectEscalation(scores);

      return {
        ok: true,
        value: {
          threadId,
          messages: messageSentiments,
          overallTrend,
          averageSentiment: Math.round(averageSentiment * 100) / 100,
          toneProgression: tones,
          hasEscalation,
          ...(escalationPoint !== undefined ? { escalationPoint } : {}),
        },
      };
    } catch (err) {
      const error: AIEngineError = {
        code: 'THREAD_SENTIMENT_ERROR',
        message: err instanceof Error ? err.message : 'Unknown thread analysis error',
        retryable: true,
      };
      return { ok: false, error };
    }
  }

  // -----------------------------------------------------------------------
  // Public API — Relationship Sentiment Tracking
  // -----------------------------------------------------------------------

  /**
   * Record a sentiment observation for a contact relationship.
   */
  recordSentiment(
    contactId: string,
    score: number,
    tone: EmotionalTone,
  ): void {
    let history = this.relationshipHistory.get(contactId);
    if (!history) {
      history = [];
      this.relationshipHistory.set(contactId, history);
    }

    history.push({
      timestamp: Date.now(),
      score,
      tone,
    });

    // Cap history size
    if (history.length > 100) {
      history.splice(0, history.length - 100);
    }
  }

  /**
   * Get the sentiment history for a contact relationship.
   */
  getRelationshipSentiment(contactId: string): Result<RelationshipSentimentHistory> {
    const entries = this.relationshipHistory.get(contactId);

    if (!entries || entries.length === 0) {
      return {
        ok: false,
        error: {
          code: 'NO_SENTIMENT_HISTORY',
          message: `No sentiment history for contact ${contactId}`,
          retryable: false,
        },
      };
    }

    const scores = entries.map((e) => e.score);
    const averageSentiment = scores.reduce((a, b) => a + b, 0) / scores.length;
    const overallTrend = this.computeTrend(scores);

    // Emotional volatility: standard deviation of scores
    const mean = averageSentiment;
    const squaredDiffs = scores.map((s) => (s - mean) ** 2);
    const emotionalVolatility = Math.sqrt(
      squaredDiffs.reduce((a, b) => a + b, 0) / scores.length,
    );

    return {
      ok: true,
      value: {
        contactId,
        entries: [...entries],
        overallTrend,
        averageSentiment: Math.round(averageSentiment * 100) / 100,
        emotionalVolatility: Math.round(emotionalVolatility * 100) / 100,
      },
    };
  }

  // -----------------------------------------------------------------------
  // Public API — Tone Shift Alerts
  // -----------------------------------------------------------------------

  /**
   * Check for tone shifts in a contact's sentiment history.
   * Returns alerts if the sentiment has shifted significantly.
   */
  detectToneShifts(contactId: string): readonly ToneShiftAlert[] {
    const entries = this.relationshipHistory.get(contactId);
    if (!entries || entries.length < 2) return [];

    const alerts: ToneShiftAlert[] = [];
    const threshold = this.config.toneShiftThreshold ?? TONE_SHIFT_ALERT_THRESHOLD;

    // Compare the most recent entry to the one before it
    for (let i = 1; i < entries.length; i++) {
      const prev = entries[i - 1] as SentimentEntry;
      const curr = entries[i] as SentimentEntry;
      const delta = curr.score - prev.score;

      if (Math.abs(delta) >= threshold) {
        const severity: ToneShiftAlert['severity'] =
          Math.abs(delta) >= 0.7 ? 'critical' :
          Math.abs(delta) >= 0.5 ? 'warning' : 'info';

        const direction = delta > 0 ? 'positive' : 'negative';

        alerts.push({
          contactId,
          previousTone: prev.tone,
          currentTone: curr.tone,
          sentimentDelta: Math.round(delta * 100) / 100,
          detectedAt: curr.timestamp,
          description: `Tone shifted ${direction} from ${prev.tone} to ${curr.tone} (delta: ${delta.toFixed(2)})`,
          severity,
        });
      }
    }

    return alerts;
  }

  // -----------------------------------------------------------------------
  // Public API — Urgency Scoring
  // -----------------------------------------------------------------------

  /**
   * Score the urgency of an email on a 0-1 scale.
   * Combines keyword signals, punctuation patterns, and structural cues.
   */
  scoreUrgency(email: EmailMessage): number {
    const subject = email.headers.subject.toLowerCase();
    const body = (email.content.textBody ?? '').toLowerCase();
    const text = `${subject} ${body}`;
    const words = text.split(/\s+/);

    let score = 0;

    // Subject-line urgency markers carry more weight
    for (const word of URGENCY_WORDS) {
      if (subject.includes(word)) score += 0.15;
      else if (body.includes(word)) score += 0.06;
    }

    // Exclamation marks in subject
    const subjectExclamations = (email.headers.subject.match(/!/g) ?? []).length;
    if (subjectExclamations > 0) score += 0.1;

    // ALL CAPS subject
    if (email.headers.subject === email.headers.subject.toUpperCase() && email.headers.subject.length > 3) {
      score += 0.15;
    }

    // Short, punchy emails tend to be more urgent
    if (words.length < 50 && score > 0.1) {
      score += 0.05;
    }

    // "Re:" chains (multiple replies = growing urgency)
    const reCount = (email.headers.subject.match(/re:/gi) ?? []).length;
    if (reCount > 2) score += 0.1;

    return Math.max(0, Math.min(1, score));
  }

  // -----------------------------------------------------------------------
  // Private — Scoring Helpers
  // -----------------------------------------------------------------------

  private scoreWordSet(words: readonly string[], wordSet: ReadonlySet<string>): number {
    if (words.length === 0) return 0;

    let matches = 0;
    for (const word of words) {
      // Check direct match
      if (wordSet.has(word)) {
        matches++;
        continue;
      }
      // Check if any set entry is a substring of the word (e.g. "frustrat" matches "frustrated")
      for (const entry of wordSet) {
        if (word.includes(entry)) {
          matches++;
          break;
        }
      }
    }

    // Normalise: ratio of matching words, capped to avoid single-word emails scoring 1.0
    return Math.min(1, (matches / Math.max(words.length, 1)) * 5);
  }

  private scoreFormalityLevel(words: readonly string[]): number {
    let formalCount = 0;
    let informalCount = 0;

    for (const word of words) {
      if (FORMAL_MARKERS.has(word)) formalCount++;
      if (INFORMAL_MARKERS.has(word)) informalCount++;
    }

    const total = formalCount + informalCount;
    if (total === 0) return 0.5; // neutral

    return formalCount / total;
  }

  private deriveSentimentResult(score: number): SentimentResult {
    let overall: SentimentResult['overall'];
    if (score > 0.2) overall = 'positive';
    else if (score < -0.2) overall = 'negative';
    else overall = 'neutral';

    return {
      overall,
      score: Math.round(score * 100) / 100,
      magnitude: Math.round(Math.abs(score) * 100) / 100,
    };
  }

  private deriveTone(
    positivity: number,
    negativity: number,
    urgency: number,
    frustration: number,
  ): EmotionalTone {
    // Pick the dominant signal
    const signals: readonly { tone: EmotionalTone; score: number }[] = [
      { tone: 'positive', score: positivity },
      { tone: 'negative', score: negativity },
      { tone: 'urgent', score: urgency },
      { tone: 'frustrated', score: frustration },
    ];

    const dominant = signals.reduce(
      (max, s) => (s.score > max.score ? s : max),
      { tone: 'neutral' as EmotionalTone, score: 0.05 }, // minimum threshold
    );

    return dominant.tone;
  }

  private computeTrend(scores: readonly number[]): 'improving' | 'stable' | 'declining' {
    if (scores.length < 2) return 'stable';

    const windowSize = Math.min(TREND_WINDOW_SIZE, Math.floor(scores.length / 2));
    if (windowSize === 0) return 'stable';

    const recentAvg =
      scores.slice(-windowSize).reduce((a, b) => a + b, 0) / windowSize;
    const olderAvg =
      scores.slice(0, windowSize).reduce((a, b) => a + b, 0) / windowSize;

    const delta = recentAvg - olderAvg;
    if (delta > 0.1) return 'improving';
    if (delta < -0.1) return 'declining';
    return 'stable';
  }

  private detectEscalation(
    scores: readonly number[],
  ): { hasEscalation: boolean; escalationPoint?: number } {
    // Escalation = 3+ consecutive declining scores
    let consecutiveDeclines = 0;
    let escalationPoint: number | undefined;

    for (let i = 1; i < scores.length; i++) {
      const prev = scores[i - 1];
      const curr = scores[i];
      if (prev !== undefined && curr !== undefined && curr < prev - 0.05) {
        consecutiveDeclines++;
        if (consecutiveDeclines >= 2 && escalationPoint === undefined) {
          escalationPoint = i - 1; // point where decline started
        }
      } else {
        consecutiveDeclines = 0;
      }
    }

    return {
      hasEscalation: consecutiveDeclines >= 2,
      ...(escalationPoint !== undefined ? { escalationPoint } : {}),
    };
  }

  private extractText(email: EmailMessage): string {
    const subject = email.headers.subject ?? '';
    const body = email.content.textBody ?? '';
    return `${subject} ${body}`.trim();
  }

  private neutralSentiment(processingTimeMs: number): DetailedSentiment {
    return {
      overall: { overall: 'neutral', score: 0, magnitude: 0 },
      tone: 'neutral',
      toneConfidence: 0.3,
      urgencyScore: 0,
      frustrationScore: 0,
      positivityScore: 0,
      formality: 0.5,
      emotionalIntensity: 0,
      processingTimeMs,
      modelVersion: MODEL_VERSION,
    };
  }
}
