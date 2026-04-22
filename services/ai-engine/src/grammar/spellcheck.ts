/**
 * Spell Check Engine — Multi-Language Spell Checking
 *
 * Works alongside the grammar agent but focused specifically on spelling.
 * Features:
 *   - Multi-language detection and correction
 *   - Custom dictionary support (user-added words)
 *   - Language-aware dictionaries with common words per language
 *   - Confidence scoring for each suggestion
 *   - AI-enhanced spell check for context-aware corrections
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SpellCheckIssue {
  /** Character offset in the original text */
  offset: number;
  /** Length of the misspelled word */
  length: number;
  /** The misspelled word */
  word: string;
  /** Suggested corrections, best first */
  suggestions: string[];
  /** Confidence 0-1 that this is actually misspelled */
  confidence: number;
  /** Detected language for this word */
  language: string;
}

export interface SpellCheckRequest {
  /** Text to check */
  text: string;
  /** ISO 639-1 language code; auto-detected if omitted */
  language?: string;
  /** Words the user has added to their personal dictionary */
  customWords?: string[];
}

export interface SpellCheckResult {
  /** List of misspelled words with suggestions */
  issues: SpellCheckIssue[];
  /** Detected language of the text */
  detectedLanguage: string;
  /** Total words analyzed */
  wordCount: number;
  /** Words with issues */
  issueCount: number;
  /** Processing time in ms */
  processingTimeMs: number;
}

// ─── Language Dictionaries ──────────────────────────────────────────────────

/** Common misspellings per language: misspelled -> correct */
const EN_MISSPELLINGS: ReadonlyMap<string, string[]> = new Map([
  ["teh", ["the"]],
  ["recieve", ["receive"]],
  ["occured", ["occurred"]],
  ["seperate", ["separate"]],
  ["definately", ["definitely"]],
  ["accomodate", ["accommodate"]],
  ["occurence", ["occurrence"]],
  ["neccessary", ["necessary"]],
  ["enviroment", ["environment"]],
  ["goverment", ["government"]],
  ["knowlege", ["knowledge"]],
  ["managment", ["management"]],
  ["refrences", ["references"]],
  ["unfortunatly", ["unfortunately"]],
  ["immediatly", ["immediately"]],
  ["calender", ["calendar"]],
  ["commited", ["committed"]],
  ["developement", ["development"]],
  ["independant", ["independent"]],
  ["prefered", ["preferred"]],
  ["succesful", ["successful"]],
  ["tommorow", ["tomorrow"]],
  ["untill", ["until"]],
  ["wether", ["whether"]],
  ["acheive", ["achieve"]],
  ["beleive", ["believe"]],
  ["collegue", ["colleague"]],
  ["concensus", ["consensus"]],
  ["dissapoint", ["disappoint"]],
  ["embarass", ["embarrass"]],
  ["explaination", ["explanation"]],
  ["garauntee", ["guarantee"]],
  ["harrass", ["harass"]],
  ["lisence", ["licence", "license"]],
  ["mispell", ["misspell"]],
  ["noticable", ["noticeable"]],
  ["persistant", ["persistent"]],
  ["privelege", ["privilege"]],
  ["recomend", ["recommend"]],
  ["wierd", ["weird"]],
  ["arguement", ["argument"]],
  ["begining", ["beginning"]],
  ["bussiness", ["business"]],
  ["catagory", ["category"]],
  ["chauffer", ["chauffeur"]],
  ["concious", ["conscious"]],
  ["curiousity", ["curiosity"]],
  ["dilema", ["dilemma"]],
  ["existance", ["existence"]],
  ["foriegn", ["foreign"]],
  ["grammer", ["grammar"]],
  ["humourous", ["humorous"]],
  ["ignorence", ["ignorance"]],
  ["jewellry", ["jewellery", "jewelry"]],
  ["judgement", ["judgment"]],
  ["kindergarden", ["kindergarten"]],
  ["maintainance", ["maintenance"]],
  ["millenium", ["millennium"]],
  ["neigbour", ["neighbour", "neighbor"]],
  ["parliment", ["parliament"]],
  ["questionaire", ["questionnaire"]],
  ["resistence", ["resistance"]],
  ["shedule", ["schedule"]],
  ["tendancy", ["tendency"]],
  ["vaccuum", ["vacuum"]],
  ["withdrawl", ["withdrawal"]],
]);

const ES_MISSPELLINGS: ReadonlyMap<string, string[]> = new Map([
  ["aber", ["haber"]],
  ["aver", ["haber", "a ver"]],
  ["ay", ["hay", "ahí"]],
  ["bamos", ["vamos"]],
  ["conosco", ["conozco"]],
  ["deveria", ["debería"]],
  ["escrivir", ["escribir"]],
  ["govierno", ["gobierno"]],
  ["hize", ["hice"]],
  ["invierno", ["invierno"]],
  ["tambien", ["también"]],
  ["travez", ["través"]],
]);

const FR_MISSPELLINGS: ReadonlyMap<string, string[]> = new Map([
  ["apartement", ["appartement"]],
  ["beaucoups", ["beaucoup"]],
  ["defois", ["des fois", "parfois"]],
  ["malgres", ["malgré"]],
  ["parmis", ["parmi"]],
  ["quatres", ["quatre"]],
  ["biensur", ["bien sûr"]],
  ["commencons", ["commençons"]],
  ["language", ["langage"]],
  ["notament", ["notamment"]],
]);

const DE_MISSPELLINGS: ReadonlyMap<string, string[]> = new Map([
  ["agressiv", ["aggressiv"]],
  ["bisjen", ["bisschen"]],
  ["defintiv", ["definitiv"]],
  ["enlich", ["endlich"]],
  ["garnicht", ["gar nicht"]],
  ["irgentwie", ["irgendwie"]],
  ["paralell", ["parallel"]],
  ["rythmus", ["rhythmus"]],
  ["symetrisch", ["symmetrisch"]],
  ["villeicht", ["vielleicht"]],
]);

const LANGUAGE_DICTIONARIES: ReadonlyMap<
  string,
  ReadonlyMap<string, string[]>
> = new Map([
  ["en", EN_MISSPELLINGS],
  ["es", ES_MISSPELLINGS],
  ["fr", FR_MISSPELLINGS],
  ["de", DE_MISSPELLINGS],
]);

// ─── Language Detection ─────────────────────────────────────────────────────

const LANG_SIGNALS: ReadonlyMap<string, readonly string[]> = new Map([
  ["en", ["the", "and", "is", "are", "for", "with", "that", "this", "have", "from"]],
  ["es", ["el", "la", "los", "las", "de", "en", "que", "por", "del", "una"]],
  ["fr", ["le", "la", "les", "de", "des", "est", "que", "pour", "dans", "une"]],
  ["de", ["der", "die", "das", "und", "ist", "ein", "mit", "den", "nicht", "auch"]],
  ["pt", ["o", "a", "os", "as", "de", "em", "que", "para", "com", "uma"]],
  ["it", ["il", "la", "le", "di", "che", "per", "un", "con", "del", "una"]],
  ["nl", ["de", "het", "een", "en", "van", "in", "dat", "op", "niet", "met"]],
  ["ja", ["の", "に", "は", "を", "た", "が", "で", "て", "と", "も"]],
  ["zh", ["的", "了", "在", "是", "我", "有", "和", "人", "这", "中"]],
  ["ar", ["في", "من", "على", "إلى", "أن", "هذا", "التي", "هو", "لا", "ما"]],
  ["ko", ["이", "의", "에", "을", "를", "는", "가", "다", "는", "로"]],
  ["ru", ["и", "в", "не", "на", "что", "он", "как", "это", "по", "но"]],
]);

function detectLanguage(text: string): string {
  const lower = text.toLowerCase();
  const words = lower.split(/\s+/);
  const scores = new Map<string, number>();

  for (const [lang, signals] of LANG_SIGNALS) {
    const count = words.filter((w) => signals.includes(w)).length;
    scores.set(lang, count);
  }

  let bestLang = "en";
  let bestScore = 0;

  for (const [lang, score] of scores) {
    if (score > bestScore) {
      bestScore = score;
      bestLang = lang;
    }
  }

  return bestLang;
}

// ─── Levenshtein Distance (for fuzzy matching) ─────────────────────────────

function levenshtein(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  const firstRow = matrix[0];
  if (!firstRow) return 0;
  for (let j = 0; j <= a.length; j++) {
    firstRow[j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    const row = matrix[i];
    const prevRow = matrix[i - 1];
    if (!row || !prevRow) continue;
    for (let j = 1; j <= a.length; j++) {
      const cost = b.charAt(i - 1) === a.charAt(j - 1) ? 0 : 1;
      row[j] = Math.min(
        (prevRow[j] ?? 0) + 1,
        (row[j - 1] ?? 0) + 1,
        (prevRow[j - 1] ?? 0) + cost,
      );
    }
  }

  return matrix[b.length]?.[a.length] ?? 0;
}

// ─── Word Tokenizer ─────────────────────────────────────────────────────────

interface WordToken {
  word: string;
  offset: number;
  cleaned: string;
}

function tokenizeWords(text: string): WordToken[] {
  const tokens: WordToken[] = [];
  const regex = /[a-zA-ZÀ-ÿ\u00C0-\u024F\u1E00-\u1EFF]+(?:['-][a-zA-ZÀ-ÿ]+)*/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    tokens.push({
      word: match[0],
      offset: match.index,
      cleaned: match[0].toLowerCase(),
    });
  }

  return tokens;
}

// ─── Common Valid Words (skip these) ────────────────────────────────────────

const COMMON_VALID: ReadonlySet<string> = new Set([
  // Very common English words that short-form heuristic might flag
  "a", "an", "the", "i", "is", "it", "in", "on", "to", "of", "or",
  "and", "but", "if", "no", "not", "so", "up", "at", "by", "do",
  "he", "me", "my", "we", "ok", "hi", "am", "as", "be", "go",
  // Common abbreviations
  "vs", "etc", "eg", "ie", "mr", "mrs", "ms", "dr", "jr", "sr",
  // Tech terms
  "api", "url", "css", "html", "js", "ts", "ui", "ux", "ai", "ml",
  "http", "https", "smtp", "imap", "dns", "ssl", "tls", "jwt",
  "json", "xml", "csv", "pdf", "gif", "png", "jpg", "svg",
]);

// ─── AI-Enhanced Spell Check ────────────────────────────────────────────────

const ANTHROPIC_API_KEY =
  process.env["ANTHROPIC_API_KEY"] ?? process.env["CLAUDE_API_KEY"];

async function aiSpellCheck(
  text: string,
  language: string,
): Promise<SpellCheckIssue[]> {
  if (!ANTHROPIC_API_KEY) return [];

  const systemPrompt = `You are a multi-language spell checker. The text is in "${language}". Find ONLY misspelled words.

Return a JSON array where each element has:
- offset: character position (integer)
- length: length of misspelled word (integer)
- word: the misspelled word
- suggestions: array of correct spellings (best first, max 3)
- confidence: 0-1
- language: "${language}"

Rules:
- Only flag genuine misspellings, not proper nouns, technical terms, or abbreviations
- Do not flag words that are correct in any variant (US/UK English, etc.)
- Be precise with character offsets
- Return ONLY the JSON array, no other text
- If no misspellings found, return []`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2048,
        system: systemPrompt,
        messages: [{ role: "user", content: text }],
      }),
    });

    if (!response.ok) return [];

    const data = (await response.json()) as {
      content: { type: string; text?: string }[];
    };

    const responseText = data.content
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("");

    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]) as SpellCheckIssue[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// ─── Main Spell Check Function ──────────────────────────────────────────────

export async function spellCheck(
  request: SpellCheckRequest,
): Promise<SpellCheckResult> {
  const startTime = performance.now();

  // 1. Detect language
  const detectedLanguage = request.language ?? detectLanguage(request.text);

  // 2. Tokenize words
  const tokens = tokenizeWords(request.text);
  const customWordsSet = new Set(
    (request.customWords ?? []).map((w) => w.toLowerCase()),
  );

  // 3. Run local dictionary check
  const localIssues: SpellCheckIssue[] = [];
  const dictionary = LANGUAGE_DICTIONARIES.get(detectedLanguage);

  for (const token of tokens) {
    // Skip very short words, common valid words, and custom dictionary words
    if (token.cleaned.length <= 2) continue;
    if (COMMON_VALID.has(token.cleaned)) continue;
    if (customWordsSet.has(token.cleaned)) continue;

    // Check language-specific misspellings
    if (dictionary) {
      const corrections = dictionary.get(token.cleaned);
      if (corrections) {
        localIssues.push({
          offset: token.offset,
          length: token.word.length,
          word: token.word,
          suggestions: corrections,
          confidence: 0.95,
          language: detectedLanguage,
        });
      }
    }

    // Also check English misspellings as fallback for mixed-language text
    if (detectedLanguage !== "en") {
      const enCorrections = EN_MISSPELLINGS.get(token.cleaned);
      if (enCorrections) {
        const alreadyCaught = localIssues.some(
          (issue) => issue.offset === token.offset,
        );
        if (!alreadyCaught) {
          localIssues.push({
            offset: token.offset,
            length: token.word.length,
            word: token.word,
            suggestions: enCorrections,
            confidence: 0.8,
            language: "en",
          });
        }
      }
    }
  }

  // 4. Run AI-enhanced spell check for context-aware corrections
  let aiIssues: SpellCheckIssue[] = [];
  if (ANTHROPIC_API_KEY && request.text.length > 10) {
    aiIssues = await aiSpellCheck(request.text, detectedLanguage);
    // Filter out custom dictionary words from AI results
    aiIssues = aiIssues.filter(
      (issue) => !customWordsSet.has(issue.word.toLowerCase()),
    );
  }

  // 5. Merge and deduplicate
  const allIssues = mergeSpellIssues(localIssues, aiIssues);

  return {
    issues: allIssues,
    detectedLanguage,
    wordCount: tokens.length,
    issueCount: allIssues.length,
    processingTimeMs: performance.now() - startTime,
  };
}

function mergeSpellIssues(
  local: SpellCheckIssue[],
  ai: SpellCheckIssue[],
): SpellCheckIssue[] {
  const merged = [...local];

  for (const aiIssue of ai) {
    const overlaps = merged.some(
      (existing) => Math.abs(existing.offset - aiIssue.offset) < 3,
    );
    if (!overlaps) {
      merged.push(aiIssue);
    }
  }

  return merged.sort((a, b) => a.offset - b.offset);
}

/**
 * Generate suggestions for a word using Levenshtein distance against
 * known correct words in the misspellings dictionary.
 */
export function suggestCorrections(
  word: string,
  language: string,
  maxSuggestions = 3,
): string[] {
  const dictionary = LANGUAGE_DICTIONARIES.get(language) ?? EN_MISSPELLINGS;
  const lower = word.toLowerCase();
  const candidates: { word: string; distance: number }[] = [];

  // Get all correct words from the dictionary values
  for (const corrections of dictionary.values()) {
    for (const correction of corrections) {
      const distance = levenshtein(lower, correction.toLowerCase());
      if (distance <= 3) {
        candidates.push({ word: correction, distance });
      }
    }
  }

  return candidates
    .sort((a, b) => a.distance - b.distance)
    .slice(0, maxSuggestions)
    .map((c) => c.word);
}

/**
 * Supported languages for spell check
 */
export const SUPPORTED_LANGUAGES: ReadonlyMap<string, string> = new Map([
  ["en", "English"],
  ["es", "Spanish"],
  ["fr", "French"],
  ["de", "German"],
  ["pt", "Portuguese"],
  ["it", "Italian"],
  ["nl", "Dutch"],
  ["ja", "Japanese"],
  ["zh", "Chinese"],
  ["ar", "Arabic"],
  ["ko", "Korean"],
  ["ru", "Russian"],
]);
