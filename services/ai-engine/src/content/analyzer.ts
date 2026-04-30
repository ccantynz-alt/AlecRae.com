// =============================================================================
// @alecrae/ai-engine — Email Content Analyzer
// =============================================================================
// Language detection, topic classification (TF-IDF based), sentiment analysis,
// toxicity scoring, promotional content detection, readability metrics, and
// named entity extraction.

import type {
  EmailMessage,
  ContentAnalysis,
  LanguageDetection,
  TopicClassification,
  SentimentResult,
  ToxicityResult,
  PromotionalResult,
  ReadabilityResult,
  NamedEntity,
  Result,
} from '../types.js';

// ---------------------------------------------------------------------------
// Language Detection
// ---------------------------------------------------------------------------

/**
 * Character n-gram based language detection.
 * Uses trigram frequency profiles for the most common languages.
 */

const LANGUAGE_PROFILES: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ['en', new Set(['the', 'and', 'ing', 'tion', 'ent', 'ion', 'her', 'for', 'tha', 'nth', 'int', 'ere', 'tio', 'ver', 'all', 'ati', 'hat', 'est', 'ous', 'ted'])],
  ['es', new Set(['que', 'cion', 'los', 'las', 'por', 'del', 'ente', 'ado', 'con', 'una', 'est', 'ión', 'nte', 'mos', 'para', 'como', 'más', 'pero', 'ser', 'esta'])],
  ['fr', new Set(['les', 'des', 'est', 'ent', 'que', 'ion', 'ait', 'ous', 'une', 'par', 'com', 'sur', 'qui', 'pour', 'pas', 'dans', 'sont', 'avec', 'elle', 'cette'])],
  ['de', new Set(['und', 'der', 'die', 'den', 'ein', 'sch', 'ich', 'ung', 'eit', 'ber', 'ist', 'das', 'sie', 'cht', 'lich', 'ver', 'ach', 'auf', 'hen', 'ger'])],
  ['pt', new Set(['que', 'ção', 'ent', 'dos', 'das', 'com', 'ade', 'por', 'uma', 'para', 'não', 'est', 'ção', 'nte', 'mos', 'como', 'mais', 'ser', 'esta', 'são'])],
  ['it', new Set(['che', 'ell', 'ion', 'ent', 'per', 'con', 'del', 'ato', 'una', 'gli', 'non', 'tta', 'nte', 'mente', 'zione', 'all', 'come', 'sono', 'più', 'suo'])],
  ['nl', new Set(['een', 'het', 'van', 'aar', 'den', 'ver', 'oor', 'ing', 'aan', 'ijk', 'dat', 'erd', 'ijk', 'met', 'zij', 'die', 'werd', 'niet', 'zijn', 'ook'])],
]);

function detectLanguage(text: string): LanguageDetection {
  const normalizedText = text.toLowerCase().replace(/[^a-z\u00c0-\u024f\s]/g, '');
  const trigrams = extractTrigrams(normalizedText);

  if (trigrams.size === 0) {
    return { primary: 'en', confidence: 0.1, alternatives: [] };
  }

  const scores: { language: string; score: number }[] = [];

  for (const [lang, profile] of LANGUAGE_PROFILES) {
    let matchCount = 0;
    for (const trigram of trigrams) {
      if (profile.has(trigram)) matchCount++;
    }
    const score = trigrams.size > 0 ? matchCount / profile.size : 0;
    scores.push({ language: lang, score });
  }

  scores.sort((a, b) => b.score - a.score);

  const primary = scores[0] ?? { language: 'en', score: 0 };
  const maxPossibleScore = 1.0;
  const confidence = Math.min(1, primary.score / (maxPossibleScore * 0.3));

  return {
    primary: primary.language,
    confidence,
    alternatives: scores.slice(1, 4).map((s) => ({
      language: s.language,
      confidence: Math.min(1, s.score / (maxPossibleScore * 0.3)),
    })),
  };
}

function extractTrigrams(text: string): Set<string> {
  const trigrams = new Set<string>();
  const words = text.split(/\s+/);
  for (const word of words) {
    for (let i = 0; i <= word.length - 3; i++) {
      trigrams.add(word.slice(i, i + 3));
    }
  }
  return trigrams;
}

// ---------------------------------------------------------------------------
// TF-IDF Topic Classification
// ---------------------------------------------------------------------------

interface TopicProfile {
  readonly name: string;
  readonly keywords: ReadonlyMap<string, number>;
  readonly subtopics?: readonly string[];
}

const TOPIC_PROFILES: readonly TopicProfile[] = [
  {
    name: 'business',
    keywords: new Map([
      ['meeting', 3], ['project', 3], ['deadline', 2], ['budget', 3], ['report', 2],
      ['proposal', 3], ['client', 2], ['revenue', 3], ['strategy', 2], ['quarterly', 3],
      ['invoice', 2], ['contract', 3], ['stakeholder', 2], ['deliverable', 3], ['milestone', 2],
    ]),
    subtopics: ['meetings', 'finance', 'projects', 'sales'],
  },
  {
    name: 'technology',
    keywords: new Map([
      ['software', 3], ['update', 2], ['server', 3], ['deploy', 3], ['bug', 2],
      ['api', 3], ['database', 3], ['code', 2], ['release', 2], ['feature', 2],
      ['security', 2], ['patch', 3], ['infrastructure', 2], ['cloud', 2], ['devops', 3],
    ]),
    subtopics: ['development', 'infrastructure', 'security', 'releases'],
  },
  {
    name: 'marketing',
    keywords: new Map([
      ['campaign', 3], ['brand', 2], ['audience', 2], ['engagement', 3], ['conversion', 3],
      ['analytics', 2], ['content', 2], ['social', 2], ['advertising', 3], ['roi', 3],
      ['segment', 2], ['funnel', 3], ['impressions', 2], ['click', 2], ['subscriber', 2],
    ]),
    subtopics: ['campaigns', 'analytics', 'social media', 'content'],
  },
  {
    name: 'personal',
    keywords: new Map([
      ['family', 3], ['dinner', 2], ['weekend', 2], ['vacation', 3], ['birthday', 3],
      ['friend', 2], ['lunch', 2], ['trip', 2], ['party', 2], ['holiday', 2],
      ['congratulations', 2], ['thanks', 1], ['love', 2], ['miss', 2], ['hope', 1],
    ]),
    subtopics: ['family', 'social', 'travel', 'events'],
  },
  {
    name: 'legal',
    keywords: new Map([
      ['agreement', 3], ['terms', 2], ['compliance', 3], ['regulation', 3], ['policy', 2],
      ['liability', 3], ['dispute', 3], ['court', 3], ['attorney', 3], ['clause', 3],
      ['jurisdiction', 3], ['statute', 3], ['amendment', 2], ['arbitration', 3], ['indemnity', 3],
    ]),
    subtopics: ['contracts', 'compliance', 'disputes', 'regulations'],
  },
  {
    name: 'finance',
    keywords: new Map([
      ['payment', 3], ['transaction', 3], ['balance', 2], ['account', 2], ['transfer', 2],
      ['investment', 3], ['portfolio', 3], ['dividend', 3], ['equity', 3], ['interest', 2],
      ['tax', 3], ['audit', 3], ['expense', 2], ['refund', 2], ['billing', 2],
    ]),
    subtopics: ['payments', 'investments', 'taxes', 'accounting'],
  },
  {
    name: 'support',
    keywords: new Map([
      ['issue', 2], ['problem', 2], ['help', 2], ['ticket', 3], ['resolve', 2],
      ['error', 2], ['troubleshoot', 3], ['fix', 2], ['support', 2], ['assist', 2],
      ['escalate', 3], ['workaround', 3], ['feedback', 2], ['complaint', 2], ['satisfaction', 2],
    ]),
    subtopics: ['tickets', 'feedback', 'troubleshooting'],
  },
];

/**
 * TF-IDF based topic classification.
 * Computes term frequency in the document and matches against known topic profiles.
 */
function classifyTopics(text: string): TopicClassification[] {
  const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/);
  const wordCount = words.length;
  if (wordCount === 0) return [];

  // Term frequency
  const tf = new Map<string, number>();
  for (const word of words) {
    tf.set(word, (tf.get(word) ?? 0) + 1);
  }

  // Score each topic
  const topicScores: { topic: TopicProfile; score: number }[] = [];

  for (const topic of TOPIC_PROFILES) {
    let score = 0;
    let matchCount = 0;

    for (const [keyword, weight] of topic.keywords) {
      const frequency = tf.get(keyword) ?? 0;
      if (frequency > 0) {
        // TF component: log-normalised frequency
        const tfScore = 1 + Math.log(frequency);
        // IDF approximation: weight acts as IDF proxy
        score += tfScore * weight;
        matchCount++;
      }
    }

    // Normalise by topic keyword count to prevent larger profiles dominating
    if (matchCount >= 2) {
      const normalizedScore = score / topic.keywords.size;
      topicScores.push({ topic, score: normalizedScore });
    }
  }

  topicScores.sort((a, b) => b.score - a.score);

  // Normalise scores to 0-1 confidence range
  const maxScore = topicScores[0]?.score ?? 1;

  return topicScores.slice(0, 3).map((ts) => ({
    topic: ts.topic.name,
    confidence: Math.min(1, ts.score / Math.max(maxScore, 1)),
    ...(ts.topic.subtopics !== undefined ? { subtopics: ts.topic.subtopics } : {}),
  }));
}

// ---------------------------------------------------------------------------
// Sentiment Analysis
// ---------------------------------------------------------------------------

/** Simple lexicon-based sentiment analysis with negation handling. */

const POSITIVE_WORDS = new Set([
  'good', 'great', 'excellent', 'amazing', 'wonderful', 'fantastic', 'love',
  'happy', 'pleased', 'delighted', 'appreciate', 'thank', 'thanks', 'grateful',
  'perfect', 'awesome', 'brilliant', 'outstanding', 'superb', 'exciting',
  'impressive', 'remarkable', 'successful', 'enjoy', 'glad', 'thrilled',
  'beautiful', 'magnificent', 'terrific', 'positive', 'recommend', 'congratulations',
]);

const NEGATIVE_WORDS = new Set([
  'bad', 'terrible', 'awful', 'horrible', 'poor', 'disappointing', 'hate',
  'angry', 'frustrated', 'annoyed', 'disappointed', 'unfortunately', 'problem',
  'issue', 'complaint', 'wrong', 'error', 'fail', 'failure', 'broken',
  'unacceptable', 'worst', 'useless', 'ridiculous', 'absurd', 'dreadful',
  'miserable', 'pathetic', 'outraged', 'furious', 'disgusting', 'regret',
]);

const NEGATION_WORDS = new Set([
  'not', "n't", 'no', 'never', 'neither', 'nor', 'hardly', 'barely', 'scarcely',
  "don't", "doesn't", "didn't", "won't", "wouldn't", "couldn't", "shouldn't",
  "isn't", "aren't", "wasn't", "weren't", "hasn't", "haven't", "hadn't",
]);

const INTENSIFIERS = new Set([
  'very', 'really', 'extremely', 'incredibly', 'absolutely', 'completely',
  'totally', 'utterly', 'highly', 'deeply', 'greatly', 'strongly',
]);

function analyzeSentiment(text: string): SentimentResult {
  const words = text.toLowerCase().replace(/[^a-z'\s-]/g, '').split(/\s+/);

  let positiveScore = 0;
  let negativeScore = 0;
  let isNegated = false;
  let intensifier = 1;

  for (const [i, word] of words.entries()) {
    if (!word) continue;

    if (NEGATION_WORDS.has(word)) {
      isNegated = true;
      continue;
    }

    if (INTENSIFIERS.has(word)) {
      intensifier = 1.5;
      continue;
    }

    if (POSITIVE_WORDS.has(word)) {
      if (isNegated) {
        negativeScore += 1 * intensifier;
      } else {
        positiveScore += 1 * intensifier;
      }
      isNegated = false;
      intensifier = 1;
      continue;
    }

    if (NEGATIVE_WORDS.has(word)) {
      if (isNegated) {
        positiveScore += 0.5 * intensifier; // Negated negative is weakly positive
      } else {
        negativeScore += 1 * intensifier;
      }
      isNegated = false;
      intensifier = 1;
      continue;
    }

    // Reset negation after 3 words
    if (i > 0 && isNegated) {
      const lookback = Math.max(0, i - 3);
      const hasRecentNegation = words.slice(lookback, i).some((w) => NEGATION_WORDS.has(w));
      if (!hasRecentNegation) isNegated = false;
    }
    intensifier = 1;
  }

  const totalSentiment = positiveScore + negativeScore;
  const magnitude = totalSentiment;

  let score: number;
  let overall: SentimentResult['overall'];

  if (totalSentiment === 0) {
    score = 0;
    overall = 'neutral';
  } else {
    score = (positiveScore - negativeScore) / totalSentiment; // -1 to 1
    if (positiveScore > 0 && negativeScore > 0 && Math.abs(score) < 0.3) {
      overall = 'mixed';
    } else if (score > 0.1) {
      overall = 'positive';
    } else if (score < -0.1) {
      overall = 'negative';
    } else {
      overall = 'neutral';
    }
  }

  return { overall, score, magnitude };
}

// ---------------------------------------------------------------------------
// Toxicity Scoring
// ---------------------------------------------------------------------------

const TOXICITY_PATTERNS = {
  profanity: [
    /\b(damn|hell|crap|ass|shit|fuck|bitch|bastard)\b/gi,
  ],
  harassment: [
    /\b(idiot|stupid|moron|loser|pathetic|worthless|incompetent)\b/gi,
    /you('re|\s+are)\s+(an?\s+)?(idiot|moron|loser|incompetent|useless)/gi,
  ],
  hate: [
    /\b(hate\s+(all|every|those))\b/gi,
    /\b(go\s+back\s+to|don't\s+belong)\b/gi,
  ],
  threat: [
    /\b(kill|destroy|hurt|harm|attack)\s+(you|them|him|her)\b/gi,
    /\b(i('ll|\s+will)\s+(find|get|come\s+after))\b/gi,
    /\b(watch\s+your\s+back|you('ll|\s+will)\s+(pay|regret))\b/gi,
  ],
  sexually_explicit: [
    /\b(porn|nude|naked|sex|explicit)\b/gi,
  ],
} as const;

function scoreToxicity(text: string): ToxicityResult {
  const wordCount = text.split(/\s+/).length;
  if (wordCount === 0) {
    return {
      isToxic: false,
      score: 0,
      categories: { profanity: 0, harassment: 0, hate: 0, threat: 0, sexually_explicit: 0 },
    };
  }

  const scores: Record<string, number> = {};

  for (const [category, patterns] of Object.entries(TOXICITY_PATTERNS)) {
    let matchCount = 0;
    for (const pattern of patterns) {
      const matches = text.match(pattern);
      if (matches) matchCount += matches.length;
    }
    // Normalise by word count with diminishing returns
    scores[category] = Math.min(1, matchCount / Math.sqrt(wordCount));
  }

  const overallScore = Math.min(1, Object.values(scores).reduce((sum, s) => sum + s, 0) / 2);

  return {
    isToxic: overallScore > 0.15,
    score: overallScore,
    categories: {
      profanity: scores['profanity'] ?? 0,
      harassment: scores['harassment'] ?? 0,
      hate: scores['hate'] ?? 0,
      threat: scores['threat'] ?? 0,
      sexually_explicit: scores['sexually_explicit'] ?? 0,
    },
  };
}

// ---------------------------------------------------------------------------
// Promotional Content Detection
// ---------------------------------------------------------------------------

const PROMOTIONAL_INDICATORS = [
  'unsubscribe', 'opt out', 'opt-out', 'email preferences', 'manage subscriptions',
  'special offer', 'limited time', 'discount', 'coupon', 'promo code',
  'buy now', 'shop now', 'order now', 'deal', 'sale',
  'free shipping', 'free trial', 'click here', 'learn more',
  'view in browser', 'view as web page', 'email not displaying',
  'add to cart', 'checkout', 'best price', 'save now',
];

const TRANSACTIONAL_INDICATORS = [
  'order confirmation', 'shipping confirmation', 'delivery notification',
  'receipt', 'invoice', 'payment received', 'your order',
  'tracking number', 'shipped', 'delivered', 'refund',
  'password reset', 'verify your email', 'account created',
  'two-factor', '2fa', 'verification code', 'security alert',
];

const NEWSLETTER_INDICATORS = [
  'newsletter', 'weekly digest', 'monthly update', 'roundup',
  'this week in', 'top stories', 'latest news', 'edition',
  'featured article', 'read more', 'in this issue',
];

function detectPromotional(text: string): PromotionalResult {
  const lowerText = text.toLowerCase();
  const matchedIndicators: string[] = [];

  let promotionalCount = 0;
  for (const indicator of PROMOTIONAL_INDICATORS) {
    if (lowerText.includes(indicator)) {
      promotionalCount++;
      matchedIndicators.push(indicator);
    }
  }

  let transactionalCount = 0;
  for (const indicator of TRANSACTIONAL_INDICATORS) {
    if (lowerText.includes(indicator)) transactionalCount++;
  }

  let newsletterCount = 0;
  for (const indicator of NEWSLETTER_INDICATORS) {
    if (lowerText.includes(indicator)) newsletterCount++;
  }

  const score = Math.min(1, promotionalCount / 5);
  const isPromotional = score > 0.3;

  let type: PromotionalResult['type'];
  if (transactionalCount > promotionalCount && transactionalCount > newsletterCount) {
    type = 'transactional';
  } else if (newsletterCount > promotionalCount) {
    type = 'newsletter';
  } else if (promotionalCount >= 3) {
    type = 'marketing';
  } else {
    type = 'personal';
  }

  return { isPromotional, score, indicators: matchedIndicators, type };
}

// ---------------------------------------------------------------------------
// Readability Metrics
// ---------------------------------------------------------------------------

function analyzeReadability(text: string): ReadabilityResult {
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const syllableCount = words.reduce((sum, w) => sum + countSyllables(w), 0);

  const sentenceCount = Math.max(sentences.length, 1);
  const wordCountVal = Math.max(words.length, 1);

  const averageSentenceLength = wordCountVal / sentenceCount;
  const averageSyllablesPerWord = syllableCount / wordCountVal;

  // Flesch-Kincaid Grade Level
  const fleschKincaid =
    0.39 * averageSentenceLength +
    11.8 * averageSyllablesPerWord -
    15.59;

  // Complex words: 3+ syllables
  const complexWords = words.filter((w) => countSyllables(w) >= 3);
  const complexWordRatio = complexWords.length / wordCountVal;

  return {
    fleschKincaid: Math.max(0, Math.round(fleschKincaid * 10) / 10),
    gradeLevel: Math.max(0, Math.round(fleschKincaid)),
    averageSentenceLength: Math.round(averageSentenceLength * 10) / 10,
    complexWordRatio: Math.round(complexWordRatio * 1000) / 1000,
  };
}

function countSyllables(word: string): number {
  const clean = word.toLowerCase().replace(/[^a-z]/g, '');
  if (clean.length <= 3) return 1;

  let count = 0;
  const vowels = 'aeiouy';
  let previousIsVowel = false;

  for (const char of clean) {
    const isVowel = vowels.includes(char);
    if (isVowel && !previousIsVowel) count++;
    previousIsVowel = isVowel;
  }

  // Adjust for silent 'e'
  if (clean.endsWith('e') && count > 1) count--;
  // Adjust for '-le' ending
  if (clean.endsWith('le') && clean.length > 2 && !vowels.includes(clean[clean.length - 3] ?? '')) count++;

  return Math.max(1, count);
}

// ---------------------------------------------------------------------------
// Named Entity Extraction
// ---------------------------------------------------------------------------

function extractEntities(text: string): NamedEntity[] {
  const entities: NamedEntity[] = [];

  // Email addresses
  const emailRegex = /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g;
  for (const match of text.matchAll(emailRegex)) {
    entities.push({
      text: match[0],
      type: 'email',
      start: match.index ?? 0,
      end: (match.index ?? 0) + match[0].length,
    });
  }

  // URLs
  const urlRegex = /https?:\/\/[^\s<>"']+/g;
  for (const match of text.matchAll(urlRegex)) {
    entities.push({
      text: match[0],
      type: 'url',
      start: match.index ?? 0,
      end: (match.index ?? 0) + match[0].length,
    });
  }

  // Money patterns
  const moneyRegex = /\$[\d,]+(?:\.\d{2})?|\b\d+(?:,\d{3})*(?:\.\d{2})?\s*(?:USD|EUR|GBP|dollars?|euros?|pounds?)\b/gi;
  for (const match of text.matchAll(moneyRegex)) {
    entities.push({
      text: match[0],
      type: 'money',
      start: match.index ?? 0,
      end: (match.index ?? 0) + match[0].length,
    });
  }

  // Date patterns
  const dateRegex = /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:,?\s+\d{4})?\b|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b|\b\d{4}-\d{2}-\d{2}\b/gi;
  for (const match of text.matchAll(dateRegex)) {
    entities.push({
      text: match[0],
      type: 'date',
      start: match.index ?? 0,
      end: (match.index ?? 0) + match[0].length,
    });
  }

  // Organization patterns (heuristic: capitalized multi-word sequences followed by org indicators)
  const orgRegex = /\b([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)\s+(?:Inc|Corp|LLC|Ltd|Co|Group|Foundation|Institute|Association|University|Bank)\b\.?/g;
  for (const match of text.matchAll(orgRegex)) {
    entities.push({
      text: match[0].replace(/\.$/, ''),
      type: 'organization',
      start: match.index ?? 0,
      end: (match.index ?? 0) + match[0].length,
    });
  }

  return entities;
}

// ---------------------------------------------------------------------------
// Content Analyzer
// ---------------------------------------------------------------------------

export class ContentAnalyzer {
  /**
   * Run full content analysis on an email.
   */
  async analyze(email: EmailMessage): Promise<Result<ContentAnalysis>> {
    const startTime = performance.now();

    try {
      const textBody = email.content.textBody ?? '';
      const htmlBody = email.content.htmlBody ?? '';
      const plainText = textBody || this.stripHtml(htmlBody);

      const [language, topics, sentiment, toxicity, promotional, readability, entities] =
        await Promise.all([
          Promise.resolve(detectLanguage(plainText)),
          Promise.resolve(classifyTopics(plainText)),
          Promise.resolve(analyzeSentiment(plainText)),
          Promise.resolve(scoreToxicity(plainText)),
          Promise.resolve(detectPromotional(plainText + ' ' + htmlBody)),
          Promise.resolve(analyzeReadability(plainText)),
          Promise.resolve(extractEntities(plainText)),
        ]);

      return {
        ok: true,
        value: {
          language,
          topics,
          sentiment,
          toxicity,
          promotional,
          readability,
          entities,
          processingTimeMs: performance.now() - startTime,
        },
      };
    } catch (err) {
      return {
        ok: false,
        error: {
          code: 'CONTENT_ANALYSIS_ERROR',
          message: err instanceof Error ? err.message : 'Unknown error',
          retryable: true,
        },
      };
    }
  }

  private stripHtml(html: string): string {
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
}

export { detectLanguage, classifyTopics, analyzeSentiment, scoreToxicity, detectPromotional, analyzeReadability, extractEntities };
