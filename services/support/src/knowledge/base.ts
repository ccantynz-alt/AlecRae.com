/**
 * @alecrae/support - Knowledge Base Management
 *
 * Stores articles, troubleshooting guides, FAQs.
 * Supports semantic search for relevant articles during support conversations.
 */

import type {
  KnowledgeArticle,
  KnowledgeBaseConfig,
  KnowledgeSearchResult,
  ArticleCategory,
  Result,
} from "../types";
import { ok, err } from "../types";

// ─── Text Processing ────────────────────────────────────────────────────────

/** Tokenize text into normalized terms for TF-IDF scoring. */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2)
    .filter((t) => !STOP_WORDS.has(t));
}

const STOP_WORDS = new Set([
  "the", "and", "for", "are", "but", "not", "you", "all", "can",
  "had", "her", "was", "one", "our", "out", "has", "have", "been",
  "this", "that", "with", "will", "your", "from", "they", "been",
  "each", "which", "their", "there", "what", "about", "would",
  "make", "like", "just", "over", "such", "into", "than", "them",
  "very", "some", "when", "come", "could", "more", "also", "how",
]);

/** Compute term frequency for a tokenized document. */
function computeTf(tokens: string[]): Map<string, number> {
  const freq = new Map<string, number>();
  for (const token of tokens) {
    freq.set(token, (freq.get(token) ?? 0) + 1);
  }
  // Normalize by document length
  const len = tokens.length || 1;
  for (const [term, count] of freq) {
    freq.set(term, count / len);
  }
  return freq;
}

/** Compute inverse document frequency across a corpus. */
function computeIdf(
  corpus: Map<string, number>[],
): Map<string, number> {
  const docCount = corpus.length || 1;
  const df = new Map<string, number>();

  for (const doc of corpus) {
    for (const term of doc.keys()) {
      df.set(term, (df.get(term) ?? 0) + 1);
    }
  }

  const idf = new Map<string, number>();
  for (const [term, count] of df) {
    idf.set(term, Math.log((docCount + 1) / (count + 1)) + 1);
  }

  return idf;
}

/** Compute cosine similarity between two TF-IDF vectors. */
function cosineSimilarity(
  a: Map<string, number>,
  b: Map<string, number>,
): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (const [term, weightA] of a) {
    normA += weightA * weightA;
    const weightB = b.get(term);
    if (weightB !== undefined) {
      dotProduct += weightA * weightB;
    }
  }

  for (const [, weightB] of b) {
    normB += weightB * weightB;
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

// ─── Knowledge Base ─────────────────────────────────────────────────────────

export class KnowledgeBase {
  private articles = new Map<string, KnowledgeArticle>();
  private articleTokens = new Map<string, string[]>();
  private articleTf = new Map<string, Map<string, number>>();
  private idf = new Map<string, number>();
  private idfDirty = true;
  private readonly config: KnowledgeBaseConfig;

  constructor(config?: Partial<KnowledgeBaseConfig>) {
    this.config = {
      embeddingDimensions: 384,
      maxSearchResults: 10,
      minRelevanceScore: 0.05,
      ...config,
    };
  }

  /** Add an article to the knowledge base. */
  addArticle(article: KnowledgeArticle): void {
    this.articles.set(article.id, article);

    // Tokenize and index
    const fullText = `${article.title} ${article.title} ${article.tags.join(" ")} ${article.content}`;
    const tokens = tokenize(fullText);
    this.articleTokens.set(article.id, tokens);
    this.articleTf.set(article.id, computeTf(tokens));
    this.idfDirty = true;
  }

  /** Remove an article from the knowledge base. */
  removeArticle(id: string): boolean {
    const removed = this.articles.delete(id);
    if (removed) {
      this.articleTokens.delete(id);
      this.articleTf.delete(id);
      this.idfDirty = true;
    }
    return removed;
  }

  /** Update an existing article. */
  updateArticle(
    id: string,
    updates: Partial<Omit<KnowledgeArticle, "id" | "createdAt">>,
  ): Result<KnowledgeArticle> {
    const existing = this.articles.get(id);
    if (!existing) {
      return err(new Error(`Article not found: ${id}`));
    }

    const updated: KnowledgeArticle = {
      ...existing,
      ...updates,
      updatedAt: new Date(),
    };

    // Remove and re-add to update index
    this.removeArticle(id);
    this.addArticle(updated);

    return ok(updated);
  }

  /** Get an article by ID. */
  getArticle(id: string): KnowledgeArticle | undefined {
    return this.articles.get(id);
  }

  /** List articles, optionally filtered by category. */
  listArticles(options?: {
    category?: ArticleCategory;
    tags?: string[];
    limit?: number;
    offset?: number;
  }): KnowledgeArticle[] {
    let results = Array.from(this.articles.values());

    if (options?.category) {
      results = results.filter((a) => a.category === options.category);
    }

    if (options?.tags && options.tags.length > 0) {
      const tagSet = new Set(options.tags);
      results = results.filter((a) => a.tags.some((t) => tagSet.has(t)));
    }

    // Sort by most recently updated
    results.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? 50;
    return results.slice(offset, offset + limit);
  }

  /**
   * Search the knowledge base using TF-IDF similarity scoring.
   * Returns articles ranked by relevance to the query.
   */
  search(
    query: string,
    options?: {
      limit?: number;
      category?: ArticleCategory;
      minScore?: number;
    },
  ): Result<KnowledgeSearchResult[]> {
    try {
      if (this.articles.size === 0) {
        return ok([]);
      }

      // Recompute IDF if corpus changed
      if (this.idfDirty) {
        this.rebuildIdf();
      }

      const queryTokens = tokenize(query);
      if (queryTokens.length === 0) {
        return ok([]);
      }

      const queryTf = computeTf(queryTokens);
      const queryTfIdf = this.applyIdf(queryTf);
      const queryTermSet = new Set(queryTokens);

      const limit = options?.limit ?? this.config.maxSearchResults;
      const minScore = options?.minScore ?? this.config.minRelevanceScore;

      const scored: KnowledgeSearchResult[] = [];

      for (const [id, article] of this.articles) {
        // Optional category filter
        if (options?.category && article.category !== options.category) {
          continue;
        }

        const docTf = this.articleTf.get(id);
        if (!docTf) continue;

        const docTfIdf = this.applyIdf(docTf);
        const score = cosineSimilarity(queryTfIdf, docTfIdf);

        if (score < minScore) continue;

        // Find matched terms
        const docTokenSet = new Set(this.articleTokens.get(id) ?? []);
        const matchedTerms = queryTokens.filter((t) => docTokenSet.has(t));

        // Generate excerpt around the first matching term
        const excerpt = this.generateExcerpt(article.content, queryTermSet);

        scored.push({
          article,
          score,
          matchedTerms: [...new Set(matchedTerms)],
          excerpt,
        });
      }

      // Sort by score descending
      scored.sort((a, b) => b.score - a.score);

      return ok(scored.slice(0, limit));
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Find articles related to a specific issue pattern.
   * Combines keyword search with category-based filtering.
   */
  findTroubleshootingGuides(
    issueDescription: string,
    category?: ArticleCategory,
  ): Result<KnowledgeSearchResult[]> {
    // Extract key technical terms from the issue
    const technicalTerms = this.extractTechnicalTerms(issueDescription);
    const enhancedQuery = `${issueDescription} ${technicalTerms.join(" ")}`;

    return this.search(enhancedQuery, {
      ...(category !== undefined ? { category } : {}),
      limit: 5,
      minScore: 0.03,
    });
  }

  /** Get knowledge base stats. */
  getStats(): {
    totalArticles: number;
    byCategory: Record<string, number>;
    totalTokens: number;
    uniqueTerms: number;
  } {
    const byCategory: Record<string, number> = {};
    let totalTokens = 0;

    for (const article of this.articles.values()) {
      byCategory[article.category] = (byCategory[article.category] ?? 0) + 1;
    }

    for (const tokens of this.articleTokens.values()) {
      totalTokens += tokens.length;
    }

    return {
      totalArticles: this.articles.size,
      byCategory,
      totalTokens,
      uniqueTerms: this.idf.size,
    };
  }

  // ─── Private Methods ────────────────────────────────────────────────────

  private rebuildIdf(): void {
    const allTfs = Array.from(this.articleTf.values());
    this.idf = computeIdf(allTfs);
    this.idfDirty = false;
  }

  private applyIdf(tf: Map<string, number>): Map<string, number> {
    const tfidf = new Map<string, number>();
    for (const [term, freq] of tf) {
      const idfValue = this.idf.get(term) ?? 1;
      tfidf.set(term, freq * idfValue);
    }
    return tfidf;
  }

  private generateExcerpt(
    content: string,
    queryTerms: Set<string>,
    maxLength = 200,
  ): string {
    const sentences = content.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean);
    const lowerTerms = new Set([...queryTerms].map((t) => t.toLowerCase()));

    // Score sentences by term overlap
    let bestSentence = sentences[0] ?? "";
    let bestScore = 0;

    for (const sentence of sentences) {
      const words = sentence.toLowerCase().split(/\s+/);
      let score = 0;
      for (const word of words) {
        if (lowerTerms.has(word)) score++;
      }
      if (score > bestScore) {
        bestScore = score;
        bestSentence = sentence;
      }
    }

    if (bestSentence.length > maxLength) {
      return bestSentence.slice(0, maxLength - 3) + "...";
    }
    return bestSentence;
  }

  private extractTechnicalTerms(text: string): string[] {
    const technicalPatterns = [
      /\bspf\b/gi, /\bdkim\b/gi, /\bdmarc\b/gi, /\bdns\b/gi,
      /\bmx\b/gi, /\bbounce[ds]?\b/gi, /\bblacklist(?:ed)?\b/gi,
      /\bdeliverability\b/gi, /\breputation\b/gi, /\btls\b/gi,
      /\bsmtp\b/gi, /\b5\d{2}\b/g, /\b4\d{2}\b/g,
      /\bauthenticat(?:ion|ed|e)\b/gi,
      /\bthrottl(?:ing|ed|e)\b/gi,
      /\brate.?limit(?:ing|ed)?\b/gi,
    ];

    const terms: string[] = [];
    for (const pattern of technicalPatterns) {
      const matches = text.match(pattern);
      if (matches) {
        terms.push(...matches.map((m) => m.toLowerCase()));
      }
    }

    return [...new Set(terms)];
  }
}

// ─── Default Knowledge Articles ─────────────────────────────────────────────

export function loadDefaultArticles(): KnowledgeArticle[] {
  const now = new Date();
  return [
    {
      id: "kb-001",
      title: "Setting up SPF records for your domain",
      content: `SPF (Sender Policy Framework) is an email authentication method that specifies which mail servers are authorized to send email on behalf of your domain. To set up SPF, add a TXT record to your DNS with the value: v=spf1 include:spf.alecrae.dev ~all. If you already have an SPF record, add include:spf.alecrae.dev before the ~all mechanism. Never create multiple SPF records for the same domain - this will cause authentication failures. Common issues include exceeding the 10 DNS lookup limit, which can be resolved by flattening nested includes.`,
      category: "dns_setup",
      tags: ["spf", "dns", "setup", "authentication"],
      viewCount: 1523,
      helpfulCount: 892,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "kb-002",
      title: "Configuring DKIM signing for email authentication",
      content: `DKIM (DomainKeys Identified Mail) adds a digital signature to outgoing emails, allowing receiving servers to verify the message wasn't altered in transit. AlecRae generates a 2048-bit RSA key pair for DKIM signing. You need to publish the public key as a CNAME record: selector._domainkey.yourdomain.com pointing to selector._domainkey.alecrae.dev. The selector is assigned to your account and can be found in your domain settings. After publishing the record, it may take up to 48 hours for DNS propagation. You can verify your DKIM setup using our diagnostic tools.`,
      category: "authentication",
      tags: ["dkim", "dns", "authentication", "signing"],
      viewCount: 1245,
      helpfulCount: 756,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "kb-003",
      title: "Understanding and fixing email bounces",
      content: `Email bounces occur when a message cannot be delivered. Hard bounces (5xx errors) indicate permanent delivery failures - the address doesn't exist, the domain is invalid, or the recipient server permanently rejected the email. Soft bounces (4xx errors) are temporary - the mailbox is full, the server is temporarily unavailable, or you're being rate limited. High bounce rates damage your sender reputation. Keep your bounce rate below 2%. Remove hard-bounced addresses immediately. For soft bounces, retry with exponential backoff. Monitor bounce patterns by recipient domain to identify ISP-specific issues.`,
      category: "bounces",
      tags: ["bounce", "hard-bounce", "soft-bounce", "delivery"],
      viewCount: 2130,
      helpfulCount: 1340,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "kb-004",
      title: "Improving sender reputation and deliverability",
      content: `Sender reputation determines whether your emails reach the inbox or spam folder. Key factors: bounce rate (keep below 2%), complaint rate (keep below 0.1%), consistent sending volume, proper authentication (SPF, DKIM, DMARC), quality content, and list hygiene. To improve reputation: warm up new IPs/domains gradually, start with your most engaged recipients, avoid purchased lists, honor unsubscribes promptly, implement double opt-in, segment your lists, and monitor blacklists regularly. If blacklisted, identify the cause, fix it, then request delisting.`,
      category: "reputation",
      tags: ["reputation", "deliverability", "spam", "blacklist"],
      viewCount: 1876,
      helpfulCount: 1102,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "kb-005",
      title: "Setting up DMARC policy",
      content: `DMARC (Domain-based Message Authentication, Reporting, and Conformance) builds on SPF and DKIM to provide domain-level authentication. Start with a monitoring-only policy: v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com. This lets you see who's sending email as your domain without affecting delivery. Once you confirm all legitimate mail passes SPF and DKIM, move to quarantine (p=quarantine) and eventually reject (p=reject). The rua tag specifies where aggregate reports are sent. Review these reports to identify unauthorized senders and misconfigurations.`,
      category: "authentication",
      tags: ["dmarc", "dns", "authentication", "policy"],
      viewCount: 987,
      helpfulCount: 623,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "kb-006",
      title: "Handling rate limiting and throttling",
      content: `ISPs and mailbox providers rate-limit incoming email to prevent abuse. When you exceed their limits, you'll see 4xx temporary rejection codes like 421 or 452. Common rate limits: Gmail allows about 500 messages per hour per sending IP for new senders. Microsoft limits vary by reputation. Yahoo/AOL have strict per-connection limits. To handle rate limiting: respect 4xx responses with exponential backoff, spread sending over time, use multiple sending IPs for high volume, warm up new IPs gradually (start with 50/hour, double weekly), and segment sends across time windows. Never retry immediately after a rate limit response.`,
      category: "rate_limiting",
      tags: ["rate-limit", "throttling", "isp", "delivery"],
      viewCount: 1456,
      helpfulCount: 890,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "kb-007",
      title: "Troubleshooting emails landing in spam",
      content: `If emails are landing in spam, check these areas systematically: 1) Authentication: verify SPF, DKIM, and DMARC all pass. Use our diagnostics to check. 2) Content: avoid spam trigger words, excessive capitalization, too many links, or image-heavy emails. 3) Reputation: check your domain and IP reputation scores. Look for blacklistings. 4) List quality: high bounce or complaint rates signal spam. 5) Engagement: low open rates can push future emails to spam. 6) Infrastructure: ensure reverse DNS is configured, and your sending IP has proper HELO/EHLO hostname. Run a full diagnostic to identify the specific cause.`,
      category: "troubleshooting",
      tags: ["spam", "deliverability", "troubleshooting", "inbox"],
      viewCount: 3210,
      helpfulCount: 1890,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "kb-008",
      title: "API rate limits and best practices",
      content: `AlecRae API rate limits depend on your plan: Free (100 requests/minute), Starter (500/minute), Professional (2000/minute), Enterprise (custom). Rate limit headers are included in every response: X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset. When you hit the limit, you'll receive a 429 status code. Best practices: implement exponential backoff, cache responses where possible, use batch endpoints for bulk operations, use webhooks instead of polling, and spread requests evenly over time. The /v1/messages/batch endpoint accepts up to 1000 messages per call.`,
      category: "api_usage",
      tags: ["api", "rate-limit", "batch", "webhooks"],
      viewCount: 1678,
      helpfulCount: 945,
      createdAt: now,
      updatedAt: now,
    },
  ];
}
