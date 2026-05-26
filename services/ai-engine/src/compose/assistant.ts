// =============================================================================
// @alecrae/ai-engine — AI Writing Assistant
// =============================================================================
// Drafts emails in the user's learned voice, suggests replies, adjusts tone,
// and optimises subject lines. Uses Claude API for generation with user voice
// profile conditioning.

import type {
  ComposeRequest,
  ComposeResult,
  ComposedDraft,
  SubjectSuggestion,
  UserVoiceProfile,
  EmailMessage,
  ComposeTone,
  Result,
} from '../types.js';

// ---------------------------------------------------------------------------
// Voice Profile Builder
// ---------------------------------------------------------------------------

const GREETINGS = [
  'hi', 'hey', 'hello', 'dear', 'good morning', 'good afternoon',
  'good evening', 'greetings',
];

const SIGNOFFS = [
  'thanks', 'thank you', 'best', 'best regards', 'regards', 'cheers',
  'sincerely', 'kind regards', 'warm regards', 'take care', 'all the best',
  'talk soon', 'looking forward', 'respectfully',
];

const TONE_KEYWORDS: ReadonlyMap<ComposeTone, readonly string[]> = new Map([
  ['professional', ['please', 'kindly', 'regarding', 'per', 'accordingly', 'pursuant']],
  ['casual', ['hey', 'cool', 'awesome', 'gonna', 'wanna', 'btw', 'lol', 'haha']],
  ['friendly', ['hope', 'great', 'wonderful', 'looking forward', 'happy', 'excited']],
  ['formal', ['dear', 'sincerely', 'respectfully', 'hereby', 'herein', 'aforementioned']],
  ['urgent', ['asap', 'immediately', 'urgent', 'critical', 'time-sensitive', 'deadline']],
  ['empathetic', ['understand', 'sorry', 'appreciate', 'feel', 'concern', 'support']],
  ['assertive', ['need', 'must', 'require', 'expect', 'ensure', 'mandate']],
]);

/**
 * Builds / updates a voice profile from a corpus of the user's sent emails.
 */
export class VoiceProfileBuilder {
  /**
   * Analyse a set of sent emails and build a voice profile.
   */
  build(userId: string, sentEmails: readonly EmailMessage[]): UserVoiceProfile {
    const allText = sentEmails
      .map((e) => e.content.textBody ?? '')
      .filter((t) => t.length > 0);

    if (allText.length === 0) {
      return this.defaultProfile(userId);
    }

    // Sentence length
    const sentences = allText.flatMap((t) =>
      t.split(/[.!?]+/).filter((s) => s.trim().length > 0),
    );
    const avgSentenceLength =
      sentences.reduce((sum, s) => sum + s.trim().split(/\s+/).length, 0) /
      Math.max(sentences.length, 1);

    // Vocabulary level
    const allWords = allText
      .join(' ')
      .toLowerCase()
      .replace(/[^a-z\s]/g, '')
      .split(/\s+/);
    const uniqueWords = new Set(allWords);
    const typeTokenRatio = uniqueWords.size / Math.max(allWords.length, 1);
    const avgWordLength =
      allWords.reduce((sum, w) => sum + w.length, 0) / Math.max(allWords.length, 1);

    let vocabularyLevel: UserVoiceProfile['vocabularyLevel'];
    if (typeTokenRatio > 0.6 && avgWordLength > 5.5) vocabularyLevel = 'advanced';
    else if (typeTokenRatio > 0.4 || avgWordLength > 4.5) vocabularyLevel = 'moderate';
    else vocabularyLevel = 'simple';

    // Greeting detection
    const preferredGreetings = this.detectPatterns(allText, GREETINGS);

    // Sign-off detection
    const preferredSignoffs = this.detectPatterns(
      allText.map((t) => {
        const lines = t.split('\n');
        return lines.slice(-5).join('\n'); // Last 5 lines
      }),
      SIGNOFFS,
    );

    // Tone distribution
    const toneDistribution = new Map<ComposeTone, number>();
    for (const [tone, keywords] of TONE_KEYWORDS) {
      let count = 0;
      for (const text of allText) {
        const lower = text.toLowerCase();
        for (const keyword of keywords) {
          if (lower.includes(keyword)) count++;
        }
      }
      toneDistribution.set(tone, count);
    }
    // Normalise
    const toneTotal = [...toneDistribution.values()].reduce((a, b) => a + b, 0) || 1;
    for (const [tone, count] of toneDistribution) {
      toneDistribution.set(tone, count / toneTotal);
    }

    // Formality: ratio of formal to casual signals
    const formalScore = toneDistribution.get('formal') ?? 0;
    const casualScore = toneDistribution.get('casual') ?? 0;
    const formality = formalScore / Math.max(formalScore + casualScore, 0.01);

    // Emoji usage
    const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;
    const totalEmojis = allText.reduce((sum, t) => sum + (t.match(emojiRegex)?.length ?? 0), 0);
    const emojiUsage = totalEmojis / allText.length;

    // Common phrases (bigrams that appear frequently)
    const commonPhrases = this.extractCommonPhrases(allText);

    return {
      userId,
      averageSentenceLength: Math.round(avgSentenceLength * 10) / 10,
      vocabularyLevel,
      preferredGreetings,
      preferredSignoffs,
      commonPhrases,
      toneDistribution,
      formality,
      emojiUsage,
      lastUpdated: Date.now(),
      sampleCount: sentEmails.length,
    };
  }

  private detectPatterns(texts: readonly string[], candidates: readonly string[]): string[] {
    const counts = new Map<string, number>();

    for (const text of texts) {
      const lower = text.toLowerCase();
      for (const candidate of candidates) {
        if (lower.includes(candidate)) {
          counts.set(candidate, (counts.get(candidate) ?? 0) + 1);
        }
      }
    }

    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([phrase]) => phrase);
  }

  private extractCommonPhrases(texts: readonly string[]): string[] {
    const bigramCounts = new Map<string, number>();

    for (const text of texts) {
      const words = text.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/);
      for (let i = 0; i < words.length - 1; i++) {
        const bigram = `${words[i]} ${words[i + 1]}`;
        bigramCounts.set(bigram, (bigramCounts.get(bigram) ?? 0) + 1);
      }
    }

    // Filter out very common stop-word bigrams
    const stopBigrams = new Set([
      'the the', 'in the', 'of the', 'to the', 'and the', 'on the',
      'for the', 'at the', 'is the', 'it is', 'i am', 'it was',
    ]);

    return [...bigramCounts.entries()]
      .filter(([bigram, count]) => count >= 3 && !stopBigrams.has(bigram))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([phrase]) => phrase);
  }

  private defaultProfile(userId: string): UserVoiceProfile {
    return {
      userId,
      averageSentenceLength: 15,
      vocabularyLevel: 'moderate',
      preferredGreetings: ['hi'],
      preferredSignoffs: ['best'],
      commonPhrases: [],
      toneDistribution: new Map([['professional', 0.5], ['friendly', 0.3], ['casual', 0.2]]),
      formality: 0.5,
      emojiUsage: 0,
      lastUpdated: Date.now(),
      sampleCount: 0,
    };
  }
}

// ---------------------------------------------------------------------------
// Claude-based Compose Client
// ---------------------------------------------------------------------------

export interface ComposeAIClient {
  generate(prompt: string, options?: { maxTokens?: number; temperature?: number }): Promise<string>;
}

// ---------------------------------------------------------------------------
// Subject Line Optimizer
// ---------------------------------------------------------------------------

function generateSubjectSuggestions(
  context: EmailMessage | undefined,
  bodyText: string,
  tone: ComposeTone,
): SubjectSuggestion[] {
  const suggestions: SubjectSuggestion[] = [];

  // If replying, maintain thread subject
  if (context) {
    const originalSubject = context.headers.subject;
    const rePrefix = originalSubject.startsWith('Re:') ? '' : 'Re: ';
    suggestions.push({
      text: `${rePrefix}${originalSubject}`,
      score: 0.9,
      reasoning: 'Maintains thread continuity',
    });
  }

  // Extract key nouns/topics from body for new subject suggestions
  const words = bodyText.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/);
  const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'shall', 'should',
    'may', 'might', 'must', 'can', 'could', 'to', 'of', 'in', 'for', 'on', 'with',
    'at', 'by', 'from', 'as', 'into', 'about', 'like', 'through', 'after', 'over',
    'between', 'out', 'against', 'during', 'without', 'before', 'under', 'around',
    'among', 'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'she', 'it', 'they',
    'this', 'that', 'these', 'those', 'and', 'but', 'or', 'nor', 'not', 'so', 'yet']);

  const keyWords = words
    .filter((w) => w.length > 3 && !stopWords.has(w))
    .slice(0, 5);

  if (keyWords.length >= 2) {
    const topicPhrase = keyWords.slice(0, 3).join(' ');

    const tonePrefix: Record<ComposeTone, string> = {
      professional: 'Regarding: ',
      casual: '',
      friendly: '',
      formal: 'Re: ',
      urgent: 'URGENT: ',
      empathetic: '',
      assertive: 'Action Required: ',
    };

    suggestions.push({
      text: `${tonePrefix[tone]}${topicPhrase.charAt(0).toUpperCase() + topicPhrase.slice(1)}`,
      score: 0.6,
      reasoning: 'Generated from key content topics',
    });
  }

  return suggestions;
}

// ---------------------------------------------------------------------------
// Compose Assistant
// ---------------------------------------------------------------------------

export interface ComposeAssistantConfig {
  aiClient: ComposeAIClient;
  /** Number of alternative drafts to generate */
  alternativeCount?: number;
}

export class ComposeAssistant {
  private readonly aiClient: ComposeAIClient;
  private readonly alternativeCount: number;
  private readonly voiceProfiles = new Map<string, UserVoiceProfile>();

  constructor(config: ComposeAssistantConfig) {
    this.aiClient = config.aiClient;
    this.alternativeCount = config.alternativeCount ?? 2;
  }

  /** Register or update a user's voice profile */
  setVoiceProfile(profile: UserVoiceProfile): void {
    this.voiceProfiles.set(profile.userId, profile);
  }

  /** Get a user's voice profile */
  getVoiceProfile(userId: string): UserVoiceProfile | undefined {
    return this.voiceProfiles.get(userId);
  }

  /**
   * Generate a composed email draft with alternatives and subject suggestions.
   */
  async compose(request: ComposeRequest): Promise<Result<ComposeResult>> {
    const startTime = performance.now();

    try {
      const voiceProfile = this.voiceProfiles.get(request.userId);
      const tone = request.tone ?? this.inferTone(voiceProfile);

      // Build the main prompt
      const prompt = this.buildPrompt(request, voiceProfile, tone);

      // Generate primary draft
      const primaryResponse = await this.aiClient.generate(prompt, {
        maxTokens: this.getMaxTokens(request.length),
        temperature: 0.7,
      });

      const primaryDraft: ComposedDraft = {
        body: this.postProcess(primaryResponse, voiceProfile),
        tone,
        confidence: 0.85,
      };

      // Generate alternatives with different temperatures / slight prompt variations
      const alternativePromises = Array.from(
        { length: this.alternativeCount },
        (_, i) => this.generateAlternative(request, voiceProfile, tone, i),
      );

      const alternativeResults = await Promise.allSettled(alternativePromises);
      const alternatives: ComposedDraft[] = alternativeResults
        .filter((r): r is PromiseFulfilledResult<ComposedDraft> => r.status === 'fulfilled')
        .map((r) => r.value);

      // Subject line suggestions
      const subjectSuggestions = generateSubjectSuggestions(
        request.context,
        primaryDraft.body,
        tone,
      );

      return {
        ok: true,
        value: {
          draft: primaryDraft,
          alternatives,
          subjectSuggestions,
          processingTimeMs: performance.now() - startTime,
        },
      };
    } catch (err) {
      return {
        ok: false,
        error: {
          code: 'COMPOSE_ERROR',
          message: err instanceof Error ? err.message : 'Unknown compose error',
          retryable: true,
        },
      };
    }
  }

  /**
   * Adjust the tone of an existing draft.
   */
  async adjustTone(
    body: string,
    targetTone: ComposeTone,
    userId: string,
  ): Promise<Result<ComposedDraft>> {
    try {
      const voiceProfile = this.voiceProfiles.get(userId);

      const prompt = [
        `Rewrite the following email with a ${targetTone} tone.`,
        voiceProfile ? this.voiceInstructions(voiceProfile) : '',
        '',
        'Original email:',
        body,
        '',
        'Rewritten email:',
      ]
        .filter(Boolean)
        .join('\n');

      const response = await this.aiClient.generate(prompt, {
        maxTokens: 1500,
        temperature: 0.6,
      });

      return {
        ok: true,
        value: {
          body: this.postProcess(response, voiceProfile),
          tone: targetTone,
          confidence: 0.8,
        },
      };
    } catch (err) {
      return {
        ok: false,
        error: {
          code: 'TONE_ADJUST_ERROR',
          message: err instanceof Error ? err.message : 'Unknown error',
          retryable: true,
        },
      };
    }
  }

  // -----------------------------------------------------------------------
  // Private
  // -----------------------------------------------------------------------

  private buildPrompt(
    request: ComposeRequest,
    voiceProfile: UserVoiceProfile | undefined,
    tone: ComposeTone,
  ): string {
    const parts: string[] = [];

    // System instructions
    parts.push('You are an AI email writing assistant. Write an email based on the following instructions.');
    parts.push(`Tone: ${tone}`);
    parts.push(`Length: ${request.length ?? 'moderate'}`);

    if (request.language) {
      parts.push(`Language: ${request.language}`);
    }

    // Voice profile conditioning
    if (voiceProfile && voiceProfile.sampleCount > 5) {
      parts.push('');
      parts.push(this.voiceInstructions(voiceProfile));
    }

    // Context
    if (request.context && request.type !== 'draft') {
      parts.push('');
      parts.push(`--- Original Email ---`);
      parts.push(`From: ${request.context.headers.from.address}`);
      parts.push(`Subject: ${request.context.headers.subject}`);
      parts.push(`Body: ${(request.context.content.textBody ?? '').slice(0, 1500)}`);
      parts.push(`--- End Original ---`);
    }

    if (request.type === 'reply') {
      parts.push('');
      parts.push('Write a reply to the above email.');
    } else if (request.type === 'forward') {
      parts.push('');
      parts.push('Write a forwarding message for the above email.');
    }

    if (request.instructions) {
      parts.push('');
      parts.push(`User instructions: ${request.instructions}`);
    }

    parts.push('');
    parts.push('Write only the email body, no subject line or headers. Do not include any preamble or explanation.');

    return parts.join('\n');
  }

  private voiceInstructions(profile: UserVoiceProfile): string {
    const parts: string[] = [
      'Match the user\'s writing style:',
      `- Average sentence length: ~${profile.averageSentenceLength} words`,
      `- Vocabulary level: ${profile.vocabularyLevel}`,
      `- Formality level: ${profile.formality > 0.7 ? 'high' : profile.formality > 0.4 ? 'moderate' : 'low'}`,
    ];

    if (profile.preferredGreetings.length > 0) {
      parts.push(`- Preferred greetings: ${profile.preferredGreetings.join(', ')}`);
    }
    if (profile.preferredSignoffs.length > 0) {
      parts.push(`- Preferred sign-offs: ${profile.preferredSignoffs.join(', ')}`);
    }
    if (profile.emojiUsage > 0.5) {
      parts.push('- Occasionally uses emojis');
    }
    if (profile.commonPhrases.length > 0) {
      parts.push(`- Common phrases: ${profile.commonPhrases.slice(0, 5).join(', ')}`);
    }

    return parts.join('\n');
  }

  private async generateAlternative(
    request: ComposeRequest,
    voiceProfile: UserVoiceProfile | undefined,
    baseTone: ComposeTone,
    index: number,
  ): Promise<ComposedDraft> {
    // Vary the tone slightly for alternatives
    const toneVariants: ComposeTone[] = ['professional', 'friendly', 'casual', 'formal'];
    const alternativeTone = toneVariants.filter((t) => t !== baseTone)[index % toneVariants.length] ?? baseTone;

    const prompt = this.buildPrompt(
      { ...request, tone: alternativeTone },
      voiceProfile,
      alternativeTone,
    );

    const response = await this.aiClient.generate(prompt, {
      maxTokens: this.getMaxTokens(request.length),
      temperature: 0.85 + index * 0.05,
    });

    return {
      body: this.postProcess(response, voiceProfile),
      tone: alternativeTone,
      confidence: 0.7,
    };
  }

  private postProcess(text: string, _voiceProfile: UserVoiceProfile | undefined): string {
    let result = text.trim();

    // Remove any AI preamble that slipped through
    const preamblePatterns = [
      /^(here'?s?|sure|of course|certainly)[^.]*[.!]\s*/i,
      /^(i'?d be happy to|let me|i can)[^.]*[.!]\s*/i,
    ];

    for (const pattern of preamblePatterns) {
      result = result.replace(pattern, '');
    }

    return result.trim();
  }

  private inferTone(voiceProfile: UserVoiceProfile | undefined): ComposeTone {
    if (!voiceProfile) return 'professional';

    // Pick the dominant tone from the profile
    let maxTone: ComposeTone = 'professional';
    let maxScore = 0;

    for (const [tone, score] of voiceProfile.toneDistribution) {
      if (score > maxScore) {
        maxScore = score;
        maxTone = tone;
      }
    }

    return maxTone;
  }

  private getMaxTokens(length: ComposeRequest['length']): number {
    switch (length) {
      case 'brief': return 300;
      case 'detailed': return 1500;
      case 'moderate':
      default: return 800;
    }
  }
}
