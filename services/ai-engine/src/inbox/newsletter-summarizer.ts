/**
 * Newsletter Auto-Summary
 *
 * Reduces a newsletter (HTML + text) into a tight, scannable summary
 * (headline + 3-5 bullets + key link + topics + read-time estimate).
 *
 * Uses Claude Haiku for cost efficiency. Long newsletters (>50K chars
 * after stripping) are chunked, each chunk pre-summarised, then merged.
 * Results are cached in-memory by SHA-256 of the normalised content.
 */

import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "node:crypto";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface NewsletterSummary {
  headline: string;
  bullets: string[];
  keyLink?: string;
  /** Estimated read time of the ORIGINAL newsletter, in minutes. */
  estimatedReadTime: number;
  topics: string[];
}

interface ExtractedLink {
  url: string;
  text: string;
}

// ─── Configuration ───────────────────────────────────────────────────────────

const HAIKU_MODEL = "claude-haiku-4-5";
const MAX_CHARS_PER_CHUNK = 50_000;
const WORDS_PER_MINUTE = 220;

// ─── Singleton Anthropic client ──────────────────────────────────────────────

let cachedClient: Anthropic | null = null;
function getClient(): Anthropic {
  if (cachedClient) return cachedClient;
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set — newsletter summarisation is unavailable",
    );
  }
  cachedClient = new Anthropic({ apiKey });
  return cachedClient;
}

// ─── In-memory cache ─────────────────────────────────────────────────────────

const summaryCache = new Map<string, NewsletterSummary>();
const MAX_CACHE_ENTRIES = 1000;

function cacheKey(subject: string, content: string): string {
  return createHash("sha256")
    .update(subject)
    .update("\u0000")
    .update(content)
    .digest("hex");
}

function rememberSummary(key: string, value: NewsletterSummary): void {
  if (summaryCache.size >= MAX_CACHE_ENTRIES) {
    const firstKey = summaryCache.keys().next().value;
    if (firstKey !== undefined) summaryCache.delete(firstKey);
  }
  summaryCache.set(key, value);
}

/** Test/ops hook — clears the in-memory cache. */
export function clearNewsletterSummaryCache(): void {
  summaryCache.clear();
}

// ─── HTML stripping & link extraction ────────────────────────────────────────

const SCRIPT_OR_STYLE = /<(script|style)[^>]*>[\s\S]*?<\/\1>/gi;
const TAG = /<[^>]+>/g;
const WHITESPACE = /\s+/g;
const ANCHOR = /<a\b[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

function stripHtml(html: string): string {
  if (!html) return "";
  return html
    .replace(SCRIPT_OR_STYLE, " ")
    .replace(TAG, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(WHITESPACE, " ")
    .trim();
}

function extractLinks(html: string): ExtractedLink[] {
  const links: ExtractedLink[] = [];
  if (!html) return links;
  ANCHOR.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ANCHOR.exec(html)) !== null) {
    const rawUrl = (match[1] ?? "").trim();
    const rawText = stripHtml(match[2] ?? "").trim();
    if (!rawUrl || rawUrl.startsWith("mailto:") || rawUrl.startsWith("#")) {
      continue;
    }
    if (/unsubscribe|preferences|view (in|online)|email[- ]preferences/i.test(rawText)) {
      continue;
    }
    links.push({ url: rawUrl, text: rawText || rawUrl });
  }
  return links;
}

function estimateReadTime(text: string): number {
  if (!text) return 1;
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

// ─── Chunking ────────────────────────────────────────────────────────────────

function chunkText(text: string, size: number): string[] {
  if (text.length <= size) return [text];
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    let end = Math.min(i + size, text.length);
    if (end < text.length) {
      const breakAt = text.lastIndexOf(" ", end);
      if (breakAt > i + size * 0.5) end = breakAt;
    }
    chunks.push(text.slice(i, end).trim());
    i = end;
  }
  return chunks.filter((c) => c.length > 0);
}

// ─── Claude prompt + JSON parsing ────────────────────────────────────────────

interface RawSummary {
  headline: string;
  bullets: string[];
  topics: string[];
  keyLinkText?: string;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

function parseRawSummary(text: string): RawSummary {
  const jsonStart = text.indexOf("{");
  const jsonEnd = text.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd < 0) {
    throw new Error("Claude response did not contain a JSON object");
  }
  const slice = text.slice(jsonStart, jsonEnd + 1);
  const parsed: unknown = JSON.parse(slice);
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Parsed Claude response was not an object");
  }
  const obj = parsed as Record<string, unknown>;
  const headline = typeof obj["headline"] === "string" ? obj["headline"] : "";
  const bullets = isStringArray(obj["bullets"]) ? obj["bullets"] : [];
  const topics = isStringArray(obj["topics"]) ? obj["topics"] : [];
  const keyLinkText =
    typeof obj["keyLinkText"] === "string" ? obj["keyLinkText"] : undefined;
  return {
    headline,
    bullets,
    topics,
    ...(keyLinkText !== undefined ? { keyLinkText } : {}),
  };
}

async function callHaiku(prompt: string): Promise<string> {
  const client = getClient();
  const message = await client.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 1024,
    temperature: 0.2,
    system:
      "You summarise email newsletters into tight, scannable JSON summaries. " +
      "Always reply with a single valid JSON object and nothing else.",
    messages: [{ role: "user", content: prompt }],
  });

  const textBlocks = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text);

  const joined = textBlocks.join("\n").trim();
  if (!joined) throw new Error("Claude returned an empty response");
  return joined;
}

function buildChunkPrompt(
  subject: string,
  chunk: string,
  linkSamples: ExtractedLink[],
  isPartial: boolean,
): string {
  const linkBlock =
    linkSamples.length > 0
      ? linkSamples
          .slice(0, 20)
          .map((l, i) => `${i + 1}. ${l.text} -> ${l.url}`)
          .join("\n")
      : "(no links extracted)";

  return [
    `Subject: ${subject}`,
    "",
    isPartial
      ? "You are summarising one CHUNK of a long newsletter. Focus only on this chunk."
      : "Summarise the following newsletter.",
    "",
    "Return JSON with this exact shape:",
    "{",
    '  "headline": "one-line synthesis (max 100 chars)",',
    '  "bullets": ["3-5 concise bullets, each <= 160 chars"],',
    '  "topics": ["2-6 short topic tags, lowercase"],',
    '  "keyLinkText": "exact text of the single most important link, or empty string"',
    "}",
    "",
    "Links present in the newsletter:",
    linkBlock,
    "",
    "Newsletter content:",
    "<<<",
    chunk,
    ">>>",
  ].join("\n");
}

function buildMergePrompt(
  subject: string,
  partials: RawSummary[],
  linkSamples: ExtractedLink[],
): string {
  const partialBlock = partials
    .map(
      (p, i) =>
        `Chunk ${i + 1}:\n  headline: ${p.headline}\n  bullets:\n${p.bullets
          .map((b) => `    - ${b}`)
          .join("\n")}\n  topics: ${p.topics.join(", ")}\n  keyLinkText: ${
          p.keyLinkText ?? ""
        }`,
    )
    .join("\n\n");

  const linkBlock =
    linkSamples.length > 0
      ? linkSamples
          .slice(0, 20)
          .map((l, i) => `${i + 1}. ${l.text} -> ${l.url}`)
          .join("\n")
      : "(no links extracted)";

  return [
    `Subject: ${subject}`,
    "",
    "Merge the following per-chunk summaries of one newsletter into a single",
    "cohesive summary. Preserve the same JSON shape:",
    "{",
    '  "headline": "one-line synthesis (max 100 chars)",',
    '  "bullets": ["3-5 concise bullets, each <= 160 chars"],',
    '  "topics": ["2-6 short topic tags, lowercase"],',
    '  "keyLinkText": "exact text of the single most important link, or empty string"',
    "}",
    "",
    "Per-chunk summaries:",
    partialBlock,
    "",
    "Available links:",
    linkBlock,
  ].join("\n");
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Summarise a newsletter into headline + bullets + key link + topics.
 *
 * @param htmlBody The raw HTML body (may be empty).
 * @param textBody The raw text body (may be empty). Used as fallback.
 * @param subject  The newsletter subject line.
 */
export async function summarizeNewsletter(
  htmlBody: string,
  textBody: string,
  subject: string,
): Promise<NewsletterSummary> {
  const stripped = htmlBody && htmlBody.trim().length > 0 ? stripHtml(htmlBody) : "";
  const baseText = stripped.length > 0 ? stripped : (textBody ?? "").trim();
  const links = extractLinks(htmlBody);

  if (baseText.length === 0) {
    return {
      headline: subject || "(empty newsletter)",
      bullets: [],
      ...(links[0] ? { keyLink: links[0].url } : {}),
      estimatedReadTime: 1,
      topics: [],
    };
  }

  const key = cacheKey(subject, baseText);
  const cached = summaryCache.get(key);
  if (cached) return cached;

  const readTime = estimateReadTime(baseText);
  const chunks = chunkText(baseText, MAX_CHARS_PER_CHUNK);

  let raw: RawSummary;
  const firstChunk = chunks[0] ?? baseText;
  if (chunks.length === 1) {
    const response = await callHaiku(
      buildChunkPrompt(subject, firstChunk, links, false),
    );
    raw = parseRawSummary(response);
  } else {
    const partials: RawSummary[] = [];
    for (const chunk of chunks) {
      const response = await callHaiku(
        buildChunkPrompt(subject, chunk, links, true),
      );
      partials.push(parseRawSummary(response));
    }
    const mergeResponse = await callHaiku(
      buildMergePrompt(subject, partials, links),
    );
    raw = parseRawSummary(mergeResponse);
  }

  // Resolve keyLinkText to an actual URL by matching against extracted links.
  let keyLink: string | undefined;
  if (raw.keyLinkText && raw.keyLinkText.length > 0) {
    const needle = raw.keyLinkText.toLowerCase();
    const exact = links.find((l) => l.text.toLowerCase() === needle);
    const fuzzy =
      exact ??
      links.find(
        (l) =>
          l.text.toLowerCase().includes(needle) ||
          needle.includes(l.text.toLowerCase()),
      );
    if (fuzzy) keyLink = fuzzy.url;
  }
  if (!keyLink && links[0]) keyLink = links[0].url;

  const trimmedBullets = raw.bullets
    .map((b) => b.trim())
    .filter((b) => b.length > 0)
    .slice(0, 5);

  const summary: NewsletterSummary = {
    headline: raw.headline.trim() || subject || "Newsletter",
    bullets: trimmedBullets,
    ...(keyLink ? { keyLink } : {}),
    estimatedReadTime: readTime,
    topics: raw.topics
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 0)
      .slice(0, 6),
  };

  rememberSummary(key, summary);
  return summary;
}
