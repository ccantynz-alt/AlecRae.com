// =============================================================================
// @emailed/ai-engine — Style Cloner (S4 — Voice Cloning for AI Replies)
// =============================================================================
// Extends the basic VoiceClone in cloner.ts with:
// 1. Multi-profile support (professional, casual, etc.)
// 2. Per-email feature extraction for training samples
// 3. Style fingerprint aggregation from extracted features
// 4. Confidence scoring for clone quality
// 5. Formality level and emoji usage detection
// =============================================================================

import {
  buildClone,
  type VoiceClone,
  type VoiceCloneAIClient,
  type GenerateInVoiceContext,
  generateInVoice,
} from "./cloner.js";

import type {
  StyleFingerprintData,
  ExtractedFeaturesData,
} from "@emailed/db";

// ─── Constants ─────────────────────────────────────────────────────────────

const STOP_WORDS = new Set<string>([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being", "have",
  "has", "had", "do", "does", "did", "will", "would", "shall", "should", "may",
  "might", "must", "can", "could", "to", "of", "in", "for", "on", "with", "at",
  "by", "from", "as", "into", "about", "like", "through", "after", "over",
  "between", "out", "against", "during", "without", "before", "under", "around",
  "among", "i", "me", "my", "mine", "we", "our", "ours", "you", "your", "yours",
  "he", "she", "it", "they", "them", "their", "this", "that", "these", "those",
  "and", "but", "or", "nor", "not", "so", "yet", "if", "then", "than", "too",
  "very", "just", "also", "there", "here", "what", "which", "who", "whom",
  "when", "where", "why", "how", "all", "any", "both", "each", "few", "more",
  "most", "other", "some", "such", "no", "only", "own", "same", "s", "t", "ll",
  "re", "ve", "d", "m", "up", "down", "off", "again", "now", "get", "got",
  "one", "two", "know", "think", "really", "much", "make", "made", "go",
  "going", "want", "need", "see", "look", "take", "come", "way", "time",
]);

const EMOJI_REGEX = /\p{Extended_Pictographic}/gu;

const FORMAL_INDICATORS = [
  "regards", "sincerely", "respectfully", "pursuant", "herein", "aforementioned",
  "enclosed", "kindly", "accordingly", "furthermore", "henceforth", "whereas",
  "notwithstanding", "cordially", "esteemed",
];

const CASUAL_INDICATORS = [
  "hey", "lol", "haha", "gonna", "wanna", "gotta", "kinda", "btw", "fyi",
  "omg", "idk", "nah", "yep", "yeah", "nope", "cool", "awesome", "sup",
  "cheers", "later", "yo", "dude", "thanks!", "thx",
];

// ─── Per-Email Feature Extraction ──────────────────────────────────────────

function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-Z"'])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z'\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0);
}

/**
 * Extract style features from a single email body text.
 * This is stored per-sample so profiles can be rebuilt incrementally.
 */
export function extractEmailFeatures(emailBody: string): ExtractedFeaturesData {
  const clean = emailBody.trim();
  if (clean.length < 10) {
    return {
      sentenceCount: 0,
      wordCount: 0,
      avgSentenceLength: 0,
      emojiCount: 0,
      exclamationCount: 0,
      questionCount: 0,
      formalityScore: 0.5,
      characteristicWords: [],
    };
  }

  const sentences = splitSentences(clean);
  const words = tokenize(clean);
  const sentenceLengths = sentences.map((s) => s.split(/\s+/).length);
  const avgSentenceLength =
    sentenceLengths.reduce((a, b) => a + b, 0) / Math.max(sentenceLengths.length, 1);

  // Emoji count
  const emojiMatches = clean.match(EMOJI_REGEX);
  const emojiCount = emojiMatches?.length ?? 0;

  // Punctuation counts
  const exclamationCount = (clean.match(/!/g) ?? []).length;
  const questionCount = (clean.match(/\?/g) ?? []).length;

  // Formality scoring (0=very casual, 1=very formal)
  const lowerText = clean.toLowerCase();
  const formalHits = FORMAL_INDICATORS.filter((w) => lowerText.includes(w)).length;
  const casualHits = CASUAL_INDICATORS.filter((w) => lowerText.includes(w)).length;
  const formalityRaw = (formalHits - casualHits) / Math.max(formalHits + casualHits, 1);
  const formalityScore = Math.max(0, Math.min(1, (formalityRaw + 1) / 2));

  // Characteristic words (non-stopword, >= 4 chars, appearing in this email)
  const wordCounts = new Map<string, number>();
  for (const w of words) {
    if (w.length >= 4 && !STOP_WORDS.has(w)) {
      wordCounts.set(w, (wordCounts.get(w) ?? 0) + 1);
    }
  }
  const characteristicWords = [...wordCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([w]) => w);

  return {
    sentenceCount: sentences.length,
    wordCount: words.length,
    avgSentenceLength: Math.round(avgSentenceLength * 10) / 10,
    emojiCount,
    exclamationCount,
    questionCount,
    formalityScore: Math.round(formalityScore * 100) / 100,
    characteristicWords,
  };
}

// ─── Confidence Scoring ────────────────────────────────────────────────────

/**
 * Calculate a confidence score (0.0 - 1.0) for a style fingerprint.
 *
 * Factors:
 * - Sample count (more samples = higher confidence, diminishing returns)
 * - Vocabulary richness (more characteristic words = better clone)
 * - Signature phrase count (more unique patterns = better clone)
 * - Example sentence availability
 */
export function calculateConfidence(fingerprint: StyleFingerprintData, sampleCount: number): number {
  // Sample factor: logarithmic curve, ~0.3 at 5 samples, ~0.7 at 50, ~0.9 at 200
  const sampleFactor = Math.min(1, Math.log10(Math.max(sampleCount, 1) + 1) / 2.5);

  // Vocabulary factor: based on characteristic words found
  const vocabFactor = Math.min(1, fingerprint.vocabularyFingerprint.characteristicWords.length / 25);

  // Phrase factor: based on signature phrases + idioms
  const phraseFactor = Math.min(
    1,
    (fingerprint.signaturePhrases.length + fingerprint.idioms.length) / 15,
  );

  // Example factor: based on representative example sentences
  const exampleFactor = Math.min(1, fingerprint.exampleSentences.length / 8);

  // Weighted average
  const raw =
    sampleFactor * 0.4 +
    vocabFactor * 0.25 +
    phraseFactor * 0.2 +
    exampleFactor * 0.15;

  return Math.round(raw * 100) / 100;
}

// ─── Fingerprint Aggregation ───────────────────────────────────────────────

/**
 * Determine formality level from a numeric score.
 */
function classifyFormality(
  score: number,
): "very_casual" | "casual" | "neutral" | "formal" | "very_formal" {
  if (score < 0.2) return "very_casual";
  if (score < 0.4) return "casual";
  if (score < 0.6) return "neutral";
  if (score < 0.8) return "formal";
  return "very_formal";
}

/**
 * Build a full StyleFingerprintData from raw sent email texts.
 *
 * Uses the existing `buildClone` from cloner.ts as the analytical backbone,
 * then layers on additional data (formality, emoji, avg email length).
 */
export async function buildStyleFingerprint(
  accountId: string,
  sentEmailTexts: readonly string[],
): Promise<StyleFingerprintData> {
  const clone = await buildClone(accountId, sentEmailTexts);
  const cleanTexts = sentEmailTexts.filter((t) => t.trim().length > 20);
  const emailCount = Math.max(cleanTexts.length, 1);

  // Aggregate emoji usage
  let totalEmojis = 0;
  let totalFormalityScore = 0;
  let totalLength = 0;

  for (const text of cleanTexts) {
    const emojiMatches = text.match(EMOJI_REGEX);
    totalEmojis += emojiMatches?.length ?? 0;

    const lowerText = text.toLowerCase();
    const formalHits = FORMAL_INDICATORS.filter((w) => lowerText.includes(w)).length;
    const casualHits = CASUAL_INDICATORS.filter((w) => lowerText.includes(w)).length;
    const raw = (formalHits - casualHits) / Math.max(formalHits + casualHits, 1);
    totalFormalityScore += (raw + 1) / 2;

    totalLength += text.length;
  }

  const avgFormalityScore = totalFormalityScore / emailCount;
  const avgEmojiUsage = totalEmojis / emailCount;
  const avgEmailLength = totalLength / emailCount;

  return {
    signaturePhrases: [...clone.signaturePhrases],
    idioms: [...clone.idioms],
    openingPatterns: [...clone.openingPatterns],
    closingPatterns: [...clone.closingPatterns],
    rhythmFingerprint: {
      avgSentenceLength: clone.rhythmFingerprint.avgSentenceLength,
      sentenceLengthVariance: clone.rhythmFingerprint.sentenceLengthVariance,
      paragraphStructure: {
        avgParagraphsPerEmail: clone.rhythmFingerprint.paragraphStructure.avgParagraphsPerEmail,
        avgSentencesPerParagraph: clone.rhythmFingerprint.paragraphStructure.avgSentencesPerParagraph,
      },
    },
    vocabularyFingerprint: {
      uniqueWordsPerEmail: clone.vocabularyFingerprint.uniqueWordsPerEmail,
      wordFrequencyDistribution: { ...clone.vocabularyFingerprint.wordFrequencyDistribution },
      characteristicWords: [...clone.vocabularyFingerprint.characteristicWords],
    },
    punctuationStyle: {
      dashUsage: clone.punctuationStyle.dashUsage,
      ellipsisUsage: clone.punctuationStyle.ellipsisUsage,
      exclamationFrequency: clone.punctuationStyle.exclamationFrequency,
      questionFrequency: clone.punctuationStyle.questionFrequency,
    },
    exampleSentences: [...clone.exampleSentences],
    formalityLevel: classifyFormality(avgFormalityScore),
    emojiUsage: Math.round(avgEmojiUsage * 100) / 100,
    avgEmailLength: Math.round(avgEmailLength),
  };
}

// ─── Voice-Cloned Compose ──────────────────────────────────────────────────

/**
 * Build a VoiceClone object from a StyleFingerprintData — bridges the
 * DB-persisted fingerprint format into the runtime format used by
 * `generateInVoice` in cloner.ts.
 */
export function fingerprintToVoiceClone(
  accountId: string,
  fingerprint: StyleFingerprintData,
  sampleCount: number,
): VoiceClone {
  return {
    accountId,
    signaturePhrases: fingerprint.signaturePhrases,
    idioms: fingerprint.idioms,
    openingPatterns: fingerprint.openingPatterns,
    closingPatterns: fingerprint.closingPatterns,
    rhythmFingerprint: {
      avgSentenceLength: fingerprint.rhythmFingerprint.avgSentenceLength,
      sentenceLengthVariance: fingerprint.rhythmFingerprint.sentenceLengthVariance,
      paragraphStructure: {
        avgParagraphsPerEmail: fingerprint.rhythmFingerprint.paragraphStructure.avgParagraphsPerEmail,
        avgSentencesPerParagraph: fingerprint.rhythmFingerprint.paragraphStructure.avgSentencesPerParagraph,
      },
    },
    vocabularyFingerprint: {
      uniqueWordsPerEmail: fingerprint.vocabularyFingerprint.uniqueWordsPerEmail,
      wordFrequencyDistribution: fingerprint.vocabularyFingerprint.wordFrequencyDistribution,
      characteristicWords: fingerprint.vocabularyFingerprint.characteristicWords,
    },
    punctuationStyle: {
      dashUsage: fingerprint.punctuationStyle.dashUsage,
      ellipsisUsage: fingerprint.punctuationStyle.ellipsisUsage,
      exclamationFrequency: fingerprint.punctuationStyle.exclamationFrequency,
      questionFrequency: fingerprint.punctuationStyle.questionFrequency,
    },
    exampleSentences: fingerprint.exampleSentences,
    sampleCount,
    builtAt: new Date().toISOString(),
  };
}

/**
 * Compose an email using a specific style fingerprint and the Claude API.
 *
 * This is the main entry point for voice-cloned AI compose. It converts
 * the DB-persisted fingerprint into a VoiceClone, adds formality/emoji
 * guidance to the system prompt, and calls generateInVoice.
 */
export async function composeInVoice(
  accountId: string,
  fingerprint: StyleFingerprintData,
  sampleCount: number,
  prompt: string,
  context: GenerateInVoiceContext,
  client: VoiceCloneAIClient,
): Promise<{ body: string; confidenceScore: number }> {
  const clone = fingerprintToVoiceClone(accountId, fingerprint, sampleCount);
  const body = await generateInVoice(clone, prompt, context, client);
  const confidenceScore = calculateConfidence(fingerprint, sampleCount);
  return { body, confidenceScore };
}

// Re-export types for convenience
export type { VoiceClone, VoiceCloneAIClient, GenerateInVoiceContext };
