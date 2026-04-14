// =============================================================================
// @alecrae/ai-engine — Voice Cloner (S4)
// =============================================================================
// Goes BEYOND the basic UserVoiceProfile in compose/assistant.ts. Captures
// signature phrases, idioms, structural rhythm, vocabulary fingerprints,
// punctuation style, and example sentences — enough fingerprint to clone the
// user's writing voice for AI replies.
// =============================================================================

export interface RhythmFingerprint {
  readonly avgSentenceLength: number;
  readonly sentenceLengthVariance: number;
  /** Average paragraphs per email + average sentences per paragraph */
  readonly paragraphStructure: {
    readonly avgParagraphsPerEmail: number;
    readonly avgSentencesPerParagraph: number;
  };
}

export interface VocabularyFingerprint {
  readonly uniqueWordsPerEmail: number;
  /** Map serialised as plain object — top N words → frequency [0..1] */
  readonly wordFrequencyDistribution: Readonly<Record<string, number>>;
  readonly characteristicWords: readonly string[];
}

export interface PunctuationStyle {
  /** Average occurrences per email */
  readonly dashUsage: number;
  readonly ellipsisUsage: number;
  readonly exclamationFrequency: number;
  readonly questionFrequency: number;
}

export interface VoiceClone {
  readonly accountId: string;
  readonly signaturePhrases: readonly string[];
  readonly idioms: readonly string[];
  readonly openingPatterns: readonly string[];
  readonly closingPatterns: readonly string[];
  readonly rhythmFingerprint: RhythmFingerprint;
  readonly vocabularyFingerprint: VocabularyFingerprint;
  readonly punctuationStyle: PunctuationStyle;
  readonly exampleSentences: readonly string[];
  readonly sampleCount: number;
  readonly builtAt: string;
}

export interface VoiceCloneAIClient {
  generate(
    prompt: string,
    options?: { maxTokens?: number; temperature?: number; system?: string },
  ): Promise<string>;
}

export interface GenerateInVoiceContext {
  readonly recipient?: string | undefined;
  readonly threadHistory?: readonly { from: string; body: string }[] | undefined;
  readonly replyTo?: { from: string; subject: string; body: string } | undefined;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const STOP_WORDS = new Set<string>([
  "the","a","an","is","are","was","were","be","been","being","have","has","had",
  "do","does","did","will","would","shall","should","may","might","must","can",
  "could","to","of","in","for","on","with","at","by","from","as","into","about",
  "like","through","after","over","between","out","against","during","without",
  "before","under","around","among","i","me","my","mine","we","our","ours","you",
  "your","yours","he","she","it","they","them","their","this","that","these",
  "those","and","but","or","nor","not","so","yet","if","then","than","too","very",
  "just","also","there","here","what","which","who","whom","when","where","why",
  "how","all","any","both","each","few","more","most","other","some","such","no",
  "only","own","same","s","t","ll","re","ve","d","m","up","down","off","again",
  "now","get","got","one","two","know","think","really","much","make","made",
  "go","going","want","need","see","look","take","come","way","time",
]);

// ─── Builder ─────────────────────────────────────────────────────────────────

function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-Z"'])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z'\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0);
}

function extractNgrams(words: readonly string[], n: number): string[] {
  if (words.length < n) return [];
  const result: string[] = [];
  for (let i = 0; i <= words.length - n; i++) {
    result.push(words.slice(i, i + n).join(" "));
  }
  return result;
}

function topByFrequency<T>(items: readonly T[], k: number): T[] {
  const counts = new Map<T, number>();
  for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, k)
    .map(([item]) => item);
}

function variance(nums: readonly number[]): number {
  if (nums.length === 0) return 0;
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  return nums.reduce((sum, n) => sum + (n - mean) ** 2, 0) / nums.length;
}

/**
 * Build a voice clone from sent email plain text bodies.
 *
 * Pure analytical pass — no LLM. The LLM is used only at generation time, with
 * the clone supplying conditioning material (real user sentences).
 */
export async function buildClone(
  accountId: string,
  sentEmails: readonly string[],
): Promise<VoiceClone> {
  const cleanEmails = sentEmails
    .map((e) => e.trim())
    .filter((e) => e.length > 20);

  if (cleanEmails.length === 0) {
    return {
      accountId,
      signaturePhrases: [],
      idioms: [],
      openingPatterns: [],
      closingPatterns: [],
      rhythmFingerprint: {
        avgSentenceLength: 15,
        sentenceLengthVariance: 0,
        paragraphStructure: { avgParagraphsPerEmail: 1, avgSentencesPerParagraph: 3 },
      },
      vocabularyFingerprint: {
        uniqueWordsPerEmail: 0,
        wordFrequencyDistribution: {},
        characteristicWords: [],
      },
      punctuationStyle: {
        dashUsage: 0,
        ellipsisUsage: 0,
        exclamationFrequency: 0,
        questionFrequency: 0,
      },
      exampleSentences: [],
      sampleCount: 0,
      builtAt: new Date().toISOString(),
    };
  }

  // ── Sentences & paragraphs ────────────────────────────────────────────────
  const allSentences: string[] = [];
  const sentenceLengths: number[] = [];
  let totalParagraphs = 0;
  let totalSentencesInParagraphs = 0;
  const openings: string[] = [];
  const closings: string[] = [];

  for (const email of cleanEmails) {
    const paragraphs = splitParagraphs(email);
    totalParagraphs += paragraphs.length;

    for (const p of paragraphs) {
      const sents = splitSentences(p);
      totalSentencesInParagraphs += sents.length;
      for (const s of sents) {
        allSentences.push(s);
        sentenceLengths.push(s.split(/\s+/).length);
      }
    }

    // First non-empty line ≈ opening
    const lines = email.split(/\n/).map((l) => l.trim()).filter((l) => l.length > 0);
    if (lines.length > 0) {
      const opener = lines[0]?.slice(0, 80);
      if (opener) openings.push(opener);
    }
    // Last 1-2 non-empty lines ≈ closing
    if (lines.length >= 2) {
      const closer = lines.slice(-2).join(" / ").slice(0, 80);
      closings.push(closer);
    } else if (lines.length === 1) {
      const single = lines[0];
      if (single) closings.push(single.slice(0, 80));
    }
  }

  const avgSentenceLength =
    sentenceLengths.reduce((a, b) => a + b, 0) / Math.max(sentenceLengths.length, 1);

  // ── Vocabulary ────────────────────────────────────────────────────────────
  const perEmailUnique: number[] = [];
  const allWords: string[] = [];
  for (const email of cleanEmails) {
    const words = tokenize(email);
    allWords.push(...words);
    perEmailUnique.push(new Set(words).size);
  }

  const wordCounts = new Map<string, number>();
  for (const w of allWords) wordCounts.set(w, (wordCounts.get(w) ?? 0) + 1);

  const totalWords = allWords.length || 1;
  const wordFreq: Record<string, number> = {};
  const sortedWords = [...wordCounts.entries()].sort((a, b) => b[1] - a[1]);
  for (const [w, c] of sortedWords.slice(0, 100)) {
    wordFreq[w] = c / totalWords;
  }

  // Characteristic = relatively frequent (>=3 occurrences) AND not a stopword
  // AND length >= 4 (avoids junk).
  const characteristicWords = sortedWords
    .filter(([w, c]) => c >= 3 && !STOP_WORDS.has(w) && w.length >= 4)
    .slice(0, 30)
    .map(([w]) => w);

  // ── Signature phrases (3-5 grams) & idioms (4-grams with low-stopword ratio)
  const allTrigrams: string[] = [];
  const allFourgrams: string[] = [];
  const allFivegrams: string[] = [];
  for (const email of cleanEmails) {
    const words = tokenize(email);
    allTrigrams.push(...extractNgrams(words, 3));
    allFourgrams.push(...extractNgrams(words, 4));
    allFivegrams.push(...extractNgrams(words, 5));
  }

  const ngramCounts = new Map<string, number>();
  for (const g of [...allTrigrams, ...allFourgrams, ...allFivegrams]) {
    ngramCounts.set(g, (ngramCounts.get(g) ?? 0) + 1);
  }

  const candidateNgrams = [...ngramCounts.entries()]
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1]);

  const signaturePhrases: string[] = [];
  const idioms: string[] = [];
  for (const [phrase] of candidateNgrams) {
    const tokens = phrase.split(" ");
    const stopRatio = tokens.filter((t) => STOP_WORDS.has(t)).length / tokens.length;
    // Pure stopword phrases get filtered out entirely.
    if (stopRatio > 0.75) continue;
    if (signaturePhrases.length < 15) signaturePhrases.push(phrase);
    // Idioms: 4+ grams with mixed content (heuristic for set phrases)
    if (tokens.length >= 4 && stopRatio >= 0.3 && stopRatio <= 0.7 && idioms.length < 10) {
      idioms.push(phrase);
    }
    if (signaturePhrases.length >= 15 && idioms.length >= 10) break;
  }

  // ── Punctuation ───────────────────────────────────────────────────────────
  const emailCount = cleanEmails.length;
  const totalText = cleanEmails.join("\n");
  const dashCount = (totalText.match(/(?:—| - | -- )/g) ?? []).length;
  const ellipsisCount = (totalText.match(/\.\.\.|…/g) ?? []).length;
  const exclamationCount = (totalText.match(/!/g) ?? []).length;
  const questionCount = (totalText.match(/\?/g) ?? []).length;

  // ── Example sentences (5-10 representative) ───────────────────────────────
  // Pick sentences whose length is near the user's average and that contain
  // at least one characteristic word — these are most "in voice".
  const charWordSet = new Set(characteristicWords);
  const scoredSentences = allSentences
    .map((s) => {
      const len = s.split(/\s+/).length;
      const lenScore = 1 / (1 + Math.abs(len - avgSentenceLength));
      const lower = s.toLowerCase();
      const charHits = [...charWordSet].filter((w) => lower.includes(w)).length;
      return { s, score: lenScore * (1 + charHits) };
    })
    .filter((x) => {
      const len = x.s.split(/\s+/).length;
      return len >= 5 && len <= 40;
    })
    .sort((a, b) => b.score - a.score);

  const exampleSentences: string[] = [];
  const seen = new Set<string>();
  for (const { s } of scoredSentences) {
    const key = s.toLowerCase().slice(0, 40);
    if (seen.has(key)) continue;
    seen.add(key);
    exampleSentences.push(s);
    if (exampleSentences.length >= 10) break;
  }

  return {
    accountId,
    signaturePhrases,
    idioms,
    openingPatterns: topByFrequency(openings, 5),
    closingPatterns: topByFrequency(closings, 5),
    rhythmFingerprint: {
      avgSentenceLength: Math.round(avgSentenceLength * 10) / 10,
      sentenceLengthVariance: Math.round(variance(sentenceLengths) * 10) / 10,
      paragraphStructure: {
        avgParagraphsPerEmail:
          Math.round((totalParagraphs / emailCount) * 10) / 10,
        avgSentencesPerParagraph:
          Math.round((totalSentencesInParagraphs / Math.max(totalParagraphs, 1)) * 10) /
          10,
      },
    },
    vocabularyFingerprint: {
      uniqueWordsPerEmail: Math.round(
        perEmailUnique.reduce((a, b) => a + b, 0) / emailCount,
      ),
      wordFrequencyDistribution: wordFreq,
      characteristicWords,
    },
    punctuationStyle: {
      dashUsage: Math.round((dashCount / emailCount) * 100) / 100,
      ellipsisUsage: Math.round((ellipsisCount / emailCount) * 100) / 100,
      exclamationFrequency: Math.round((exclamationCount / emailCount) * 100) / 100,
      questionFrequency: Math.round((questionCount / emailCount) * 100) / 100,
    },
    exampleSentences,
    sampleCount: emailCount,
    builtAt: new Date().toISOString(),
  };
}

/**
 * Calibrate an existing clone with 5 example sentences supplied by the user.
 * The sentences are merged into the example pool and characteristic vocabulary
 * is updated. Returns a new clone — input is not mutated.
 */
export function calibrateClone(
  clone: VoiceClone,
  userExamples: readonly string[],
): VoiceClone {
  const merged = [...userExamples, ...clone.exampleSentences].slice(0, 12);

  const newCharWords = new Set(clone.vocabularyFingerprint.characteristicWords);
  for (const ex of userExamples) {
    for (const w of tokenize(ex)) {
      if (w.length >= 4 && !STOP_WORDS.has(w)) newCharWords.add(w);
    }
  }

  return {
    ...clone,
    exampleSentences: merged,
    vocabularyFingerprint: {
      ...clone.vocabularyFingerprint,
      characteristicWords: [...newCharWords].slice(0, 40),
    },
    builtAt: new Date().toISOString(),
  };
}

// ─── Generation ──────────────────────────────────────────────────────────────

function buildVoicePrompt(
  clone: VoiceClone,
  prompt: string,
  context: GenerateInVoiceContext,
): { system: string; user: string } {
  const { rhythmFingerprint: rhythm, punctuationStyle: punct } = clone;

  const formalityHints: string[] = [];
  if (punct.exclamationFrequency > 1) formalityHints.push("uses exclamation marks freely");
  if (punct.exclamationFrequency < 0.2) formalityHints.push("rarely uses exclamation marks");
  if (punct.dashUsage > 1) formalityHints.push("uses em-dashes / hyphen-asides for parenthetical thought");
  if (punct.ellipsisUsage > 0.5) formalityHints.push("occasionally trails off with ellipses…");

  const examples = clone.exampleSentences.slice(0, 10);
  const sigPhrases = clone.signaturePhrases.slice(0, 10);

  const systemParts: string[] = [
    "You are writing AS a specific human, not as an AI assistant.",
    "Your job is to clone this person's writing voice with high fidelity. You are NOT writing in 'a professional tone' or 'a friendly tone' — you are writing AS THIS PERSON.",
    "",
    "STRUCTURAL RULES (follow strictly):",
    `- Average sentence length: ${rhythm.avgSentenceLength} words. Sentence length variance: ${rhythm.sentenceLengthVariance}. Mix short and long sentences accordingly.`,
    `- Average ${rhythm.paragraphStructure.avgParagraphsPerEmail} paragraphs per email, ~${rhythm.paragraphStructure.avgSentencesPerParagraph} sentences per paragraph.`,
    `- Vocabulary: roughly ${clone.vocabularyFingerprint.uniqueWordsPerEmail} unique words per email.`,
    `- Punctuation: dash uses ~${punct.dashUsage}/email, ellipsis ~${punct.ellipsisUsage}/email, '!' ~${punct.exclamationFrequency}/email, '?' ~${punct.questionFrequency}/email.`,
    formalityHints.length > 0 ? `- Style notes: ${formalityHints.join("; ")}.` : "",
    "",
    "VOCABULARY THIS PERSON USES (prefer these words where natural):",
    clone.vocabularyFingerprint.characteristicWords.slice(0, 25).join(", "),
    "",
    "SIGNATURE PHRASES (use 0-2 of these naturally if they fit — do NOT force them):",
    sigPhrases.map((p) => `- "${p}"`).join("\n"),
  ];

  if (clone.idioms.length > 0) {
    systemParts.push("", "IDIOMS / SET CONSTRUCTIONS THIS PERSON USES:");
    systemParts.push(clone.idioms.map((i) => `- "${i}"`).join("\n"));
  }

  if (clone.openingPatterns.length > 0) {
    systemParts.push("", "TYPICAL OPENINGS:");
    systemParts.push(clone.openingPatterns.map((o) => `- "${o}"`).join("\n"));
  }
  if (clone.closingPatterns.length > 0) {
    systemParts.push("", "TYPICAL CLOSINGS:");
    systemParts.push(clone.closingPatterns.map((c) => `- "${c}"`).join("\n"));
  }

  if (examples.length > 0) {
    systemParts.push("", "EXAMPLE SENTENCES THIS PERSON HAS ACTUALLY WRITTEN (your output should feel indistinguishable from these):");
    examples.forEach((s, i) => systemParts.push(`${i + 1}. ${s}`));
  }

  systemParts.push(
    "",
    "OUTPUT RULES:",
    "- Output ONLY the email body. No subject. No preamble. No 'Here is...'.",
    "- Do NOT explain your choices.",
    "- Do NOT use phrases an AI would use that this person wouldn't.",
    "- If the example sentences are casual, BE casual. If they are terse, BE terse.",
    "- It is better to be slightly under-polished and authentic than to be polished and generic.",
  );

  const userParts: string[] = [];
  if (context.recipient) userParts.push(`Recipient: ${context.recipient}`);
  if (context.replyTo) {
    userParts.push("");
    userParts.push("--- Email being replied to ---");
    userParts.push(`From: ${context.replyTo.from}`);
    userParts.push(`Subject: ${context.replyTo.subject}`);
    userParts.push(`Body: ${context.replyTo.body.slice(0, 2000)}`);
    userParts.push("--- end ---");
  }
  if (context.threadHistory && context.threadHistory.length > 0) {
    userParts.push("");
    userParts.push("--- Thread history (oldest first) ---");
    for (const msg of context.threadHistory.slice(-5)) {
      userParts.push(`[${msg.from}]: ${msg.body.slice(0, 600)}`);
    }
    userParts.push("--- end thread ---");
  }
  userParts.push("");
  userParts.push(`What to write: ${prompt}`);
  userParts.push("");
  userParts.push("Write the email body now, in this person's exact voice:");

  return {
    system: systemParts.filter((s) => s.length > 0 || s === "").join("\n"),
    user: userParts.join("\n"),
  };
}

/**
 * Generate text in the user's cloned voice. Requires a Claude-capable client.
 */
export async function generateInVoice(
  clone: VoiceClone,
  prompt: string,
  context: GenerateInVoiceContext,
  client: VoiceCloneAIClient,
): Promise<string> {
  const { system, user } = buildVoicePrompt(clone, prompt, context);
  const raw = await client.generate(user, {
    maxTokens: 1200,
    temperature: 0.75,
    system,
  });

  // Strip common AI preambles defensively.
  return raw
    .trim()
    .replace(/^(here'?s?|sure|of course|certainly|happy to)[^.\n]*[.!:\n]\s*/i, "")
    .trim();
}

export const __internal = { buildVoicePrompt, tokenize, splitSentences };
