// =============================================================================
// Vienna — AI Natural Language Email Search
// =============================================================================
// "Find that PDF from Sarah about Q3 budget" → instant results
// "Emails where someone promised to pay by Friday" → AI understands intent
// "Show me everything from the Book A Ride project last month" → context-aware
//
// This DESTROYS Gmail's search. Gmail requires exact keywords. Vienna understands
// what you mean, even when you don't remember the exact words.

import Anthropic from '@anthropic-ai/sdk';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SearchQuery {
  raw: string;
  parsed: ParsedQuery;
  confidence: number;
}

export interface ParsedQuery {
  /** Key terms to search for */
  keywords: string[];
  /** Sender filter */
  from?: string;
  /** Recipient filter */
  to?: string;
  /** Date range */
  dateRange?: { after?: Date; before?: Date };
  /** Has attachment filter */
  hasAttachment?: boolean;
  /** Attachment type filter */
  attachmentType?: string;
  /** Label/folder filter */
  label?: string;
  /** Is unread */
  isUnread?: boolean;
  /** Is starred */
  isStarred?: boolean;
  /** Semantic intent */
  intent: SearchIntent;
  /** Subject line keywords */
  subjectKeywords?: string[];
  /** Exclude terms */
  excludeTerms?: string[];
}

export type SearchIntent =
  | 'find_specific' // "Find that email from John about..."
  | 'find_attachment' // "Find the PDF Sarah sent"
  | 'find_conversation' // "Show me the thread about..."
  | 'find_commitment' // "When did they promise to..."
  | 'find_action_items' // "What do I need to do for..."
  | 'find_by_date' // "Emails from last Tuesday"
  | 'find_unread' // "Show unread from this week"
  | 'aggregate' // "How many emails from John this month"
  | 'general'; // General search

export interface SearchResult {
  emailId: string;
  threadId: string;
  score: number;
  matchReason: string;
  highlights: SearchHighlight[];
}

export interface SearchHighlight {
  field: 'subject' | 'body' | 'from' | 'to' | 'attachment';
  text: string;
  matchedTerms: string[];
}

export interface SearchContext {
  recentContacts: string[];
  recentSubjects: string[];
  userLabels: string[];
  accountEmails: string[];
}

// ─── Query Parser ───────────────────────────────────────────────────────────

/**
 * Parses natural language queries into structured search parameters.
 * Uses both rule-based parsing and Claude for ambiguous queries.
 */
export class NaturalLanguageQueryParser {
  private readonly client: Anthropic;
  private readonly context: SearchContext;

  constructor(context: SearchContext) {
    this.client = new Anthropic();
    this.context = context;
  }

  /**
   * Parse a natural language search query.
   * Tries rule-based first (fast), falls back to AI for complex queries.
   */
  async parse(query: string): Promise<SearchQuery> {
    // First, try rule-based parsing
    const ruleBased = this.ruleBasedParse(query);

    if (ruleBased.confidence >= 0.8) {
      return { raw: query, parsed: ruleBased.parsed, confidence: ruleBased.confidence };
    }

    // For complex or ambiguous queries, use Claude
    const aiParsed = await this.aiParse(query);
    return { raw: query, ...aiParsed };
  }

  private ruleBasedParse(query: string): { parsed: ParsedQuery; confidence: number } {
    const lower = query.toLowerCase().trim();
    const parsed: ParsedQuery = {
      keywords: [],
      intent: 'general',
    };
    let confidence = 0.5;

    // From pattern: "from Sarah", "from john@example.com"
    const fromMatch = lower.match(/(?:from|by)\s+([^\s,]+(?:\s+[^\s,]+)?)/);
    if (fromMatch) {
      const sender = fromMatch[1];
      // Check if it matches a known contact
      const matchedContact = this.context.recentContacts.find(
        (c) => c.toLowerCase().includes(sender),
      );
      parsed.from = matchedContact ?? sender;
      confidence += 0.1;
    }

    // To pattern: "to Mike", "sent to team@"
    const toMatch = lower.match(/(?:to|sent to)\s+([^\s,]+(?:\s+[^\s,]+)?)/);
    if (toMatch) {
      parsed.to = toMatch[1];
      confidence += 0.1;
    }

    // Date patterns
    const dateResult = this.parseDateExpression(lower);
    if (dateResult) {
      parsed.dateRange = dateResult;
      confidence += 0.15;
    }

    // Attachment patterns
    if (/(?:attachment|attached|pdf|doc|spreadsheet|image|photo|file)/.test(lower)) {
      parsed.hasAttachment = true;
      confidence += 0.1;

      if (/pdf/.test(lower)) parsed.attachmentType = 'application/pdf';
      else if (/(?:doc|docx|word)/.test(lower)) parsed.attachmentType = 'application/msword';
      else if (/(?:xls|xlsx|spreadsheet|excel)/.test(lower)) parsed.attachmentType = 'application/vnd.ms-excel';
      else if (/(?:image|photo|picture|png|jpg|jpeg)/.test(lower)) parsed.attachmentType = 'image/*';

      parsed.intent = 'find_attachment';
    }

    // Unread pattern
    if (/unread|haven't read|not read/.test(lower)) {
      parsed.isUnread = true;
      parsed.intent = 'find_unread';
      confidence += 0.1;
    }

    // Starred pattern
    if (/starred|flagged|important|marked/.test(lower)) {
      parsed.isStarred = true;
      confidence += 0.1;
    }

    // Subject pattern: "about X", "regarding X", "re: X"
    const aboutMatch = lower.match(/(?:about|regarding|re:|subject)\s+(.+?)(?:\s+(?:from|to|last|this|in|on|before|after)|$)/);
    if (aboutMatch) {
      parsed.subjectKeywords = aboutMatch[1].split(/\s+/).filter((w) => w.length > 2);
      parsed.intent = 'find_specific';
      confidence += 0.15;
    }

    // Commitment/promise patterns
    if (/(?:promise|promised|committed|said they would|agreed to|deadline|due)/.test(lower)) {
      parsed.intent = 'find_commitment';
      confidence += 0.1;
    }

    // Action item patterns
    if (/(?:need to|have to|should|action item|todo|task|assigned to me)/.test(lower)) {
      parsed.intent = 'find_action_items';
      confidence += 0.1;
    }

    // Thread/conversation patterns
    if (/(?:thread|conversation|chain|discussion)/.test(lower)) {
      parsed.intent = 'find_conversation';
    }

    // Count/aggregate patterns
    if (/(?:how many|count|total|number of)/.test(lower)) {
      parsed.intent = 'aggregate';
    }

    // Exclude patterns: "not from X", "except Y", "without Z"
    const excludeMatch = lower.match(/(?:not|except|without|exclude)\s+(.+?)(?:\s+|$)/);
    if (excludeMatch) {
      parsed.excludeTerms = excludeMatch[1].split(/\s+/);
    }

    // Extract remaining keywords (remove parsed parts)
    let remaining = lower
      .replace(/(?:from|by|to|sent to)\s+\S+/g, '')
      .replace(/(?:about|regarding|re:)\s+/g, '')
      .replace(/(?:last|this|next)\s+(?:week|month|year|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/g, '')
      .replace(/(?:yesterday|today|before|after)\s*\S*/g, '')
      .replace(/(?:attachment|pdf|doc|spreadsheet|image|photo|file)/g, '')
      .replace(/(?:unread|starred|flagged)/g, '')
      .replace(/(?:find|show|search|get|look for|where|the|that|me|my|with|and|or)/g, '')
      .trim();

    parsed.keywords = remaining
      .split(/\s+/)
      .filter((w) => w.length > 2)
      .slice(0, 10);

    return { parsed, confidence: Math.min(0.95, confidence) };
  }

  private parseDateExpression(query: string): { after?: Date; before?: Date } | null {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // "today"
    if (/\btoday\b/.test(query)) {
      return { after: today };
    }

    // "yesterday"
    if (/\byesterday\b/.test(query)) {
      const yesterday = new Date(today.getTime() - 86_400_000);
      return { after: yesterday, before: today };
    }

    // "this week"
    if (/\bthis week\b/.test(query)) {
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - today.getDay());
      return { after: startOfWeek };
    }

    // "last week"
    if (/\blast week\b/.test(query)) {
      const endOfLastWeek = new Date(today);
      endOfLastWeek.setDate(today.getDate() - today.getDay());
      const startOfLastWeek = new Date(endOfLastWeek.getTime() - 7 * 86_400_000);
      return { after: startOfLastWeek, before: endOfLastWeek };
    }

    // "this month"
    if (/\bthis month\b/.test(query)) {
      return { after: new Date(now.getFullYear(), now.getMonth(), 1) };
    }

    // "last month"
    if (/\blast month\b/.test(query)) {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 1);
      return { after: start, before: end };
    }

    // "last N days"
    const lastNDays = query.match(/last\s+(\d+)\s+days?/);
    if (lastNDays) {
      const days = parseInt(lastNDays[1], 10);
      return { after: new Date(today.getTime() - days * 86_400_000) };
    }

    // "last N weeks"
    const lastNWeeks = query.match(/last\s+(\d+)\s+weeks?/);
    if (lastNWeeks) {
      const weeks = parseInt(lastNWeeks[1], 10);
      return { after: new Date(today.getTime() - weeks * 7 * 86_400_000) };
    }

    // Day names: "last Monday", "on Friday"
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    for (let d = 0; d < dayNames.length; d++) {
      if (query.includes(dayNames[d])) {
        const currentDay = today.getDay();
        let daysAgo = currentDay - d;
        if (daysAgo <= 0) daysAgo += 7;
        if (query.includes('last')) daysAgo += 7;
        const targetDate = new Date(today.getTime() - daysAgo * 86_400_000);
        return { after: targetDate, before: new Date(targetDate.getTime() + 86_400_000) };
      }
    }

    // Month names: "in March", "last January"
    const monthNames = ['january', 'february', 'march', 'april', 'may', 'june',
      'july', 'august', 'september', 'october', 'november', 'december'];
    for (let m = 0; m < monthNames.length; m++) {
      if (query.includes(monthNames[m])) {
        let year = now.getFullYear();
        if (m > now.getMonth() || query.includes('last')) year--;
        return {
          after: new Date(year, m, 1),
          before: new Date(year, m + 1, 1),
        };
      }
    }

    return null;
  }

  private async aiParse(query: string): Promise<{ parsed: ParsedQuery; confidence: number }> {
    try {
      const response = await this.client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        temperature: 0,
        system: 'You parse natural language email search queries into structured JSON. Respond with ONLY valid JSON, no explanation.',
        messages: [{
          role: 'user',
          content: `Parse this email search query into structured filters:
"${query}"

Known contacts: ${this.context.recentContacts.slice(0, 20).join(', ')}
Known labels: ${this.context.userLabels.join(', ')}

Return JSON with these fields (omit null/empty fields):
{
  "keywords": string[],
  "from": string | null,
  "to": string | null,
  "dateAfter": string | null (ISO date),
  "dateBefore": string | null (ISO date),
  "hasAttachment": boolean | null,
  "attachmentType": string | null,
  "label": string | null,
  "isUnread": boolean | null,
  "isStarred": boolean | null,
  "intent": "find_specific" | "find_attachment" | "find_conversation" | "find_commitment" | "find_action_items" | "find_by_date" | "find_unread" | "aggregate" | "general",
  "subjectKeywords": string[] | null,
  "excludeTerms": string[] | null
}`,
        }],
      });

      const text = response.content.find((b) => b.type === 'text')?.text ?? '{}';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found');

      const data = JSON.parse(jsonMatch[0]) as Record<string, unknown>;

      const parsed: ParsedQuery = {
        keywords: (data.keywords as string[]) ?? [],
        intent: (data.intent as SearchIntent) ?? 'general',
      };

      if (data.from) parsed.from = data.from as string;
      if (data.to) parsed.to = data.to as string;
      if (data.hasAttachment) parsed.hasAttachment = true;
      if (data.attachmentType) parsed.attachmentType = data.attachmentType as string;
      if (data.label) parsed.label = data.label as string;
      if (data.isUnread) parsed.isUnread = true;
      if (data.isStarred) parsed.isStarred = true;
      if (data.subjectKeywords) parsed.subjectKeywords = data.subjectKeywords as string[];
      if (data.excludeTerms) parsed.excludeTerms = data.excludeTerms as string[];

      if (data.dateAfter || data.dateBefore) {
        parsed.dateRange = {};
        if (data.dateAfter) parsed.dateRange.after = new Date(data.dateAfter as string);
        if (data.dateBefore) parsed.dateRange.before = new Date(data.dateBefore as string);
      }

      return { parsed, confidence: 0.85 };
    } catch {
      // AI parsing failed — return rule-based result
      return this.ruleBasedParse(query);
    }
  }
}

// ─── Search Executor ────────────────────────────────────────────────────────

export interface SearchableEmail {
  id: string;
  threadId: string;
  from: string;
  fromName: string;
  to: string[];
  subject: string;
  body: string;
  receivedAt: Date;
  isRead: boolean;
  isStarred: boolean;
  labels: string[];
  attachments: Array<{ filename: string; mimeType: string }>;
}

export class SearchExecutor {
  /**
   * Execute a parsed search query against a set of emails.
   * In production, this delegates to Meilisearch/Typesense for the keyword part
   * and applies structured filters on top.
   */
  execute(query: ParsedQuery, emails: SearchableEmail[]): SearchResult[] {
    let filtered = emails;

    // Apply structured filters
    if (query.from) {
      const from = query.from.toLowerCase();
      filtered = filtered.filter((e) =>
        e.from.toLowerCase().includes(from) || e.fromName.toLowerCase().includes(from),
      );
    }

    if (query.to) {
      const to = query.to.toLowerCase();
      filtered = filtered.filter((e) => e.to.some((t) => t.toLowerCase().includes(to)));
    }

    if (query.dateRange) {
      if (query.dateRange.after) {
        const after = query.dateRange.after;
        filtered = filtered.filter((e) => e.receivedAt >= after);
      }
      if (query.dateRange.before) {
        const before = query.dateRange.before;
        filtered = filtered.filter((e) => e.receivedAt < before);
      }
    }

    if (query.hasAttachment) {
      filtered = filtered.filter((e) => e.attachments.length > 0);
    }

    if (query.attachmentType) {
      const type = query.attachmentType;
      filtered = filtered.filter((e) =>
        e.attachments.some((a) => {
          if (type.endsWith('/*')) return a.mimeType.startsWith(type.replace('/*', ''));
          return a.mimeType === type;
        }),
      );
    }

    if (query.isUnread !== undefined) {
      filtered = filtered.filter((e) => !e.isRead === query.isUnread);
    }

    if (query.isStarred !== undefined) {
      filtered = filtered.filter((e) => e.isStarred === query.isStarred);
    }

    if (query.label) {
      const label = query.label.toLowerCase();
      filtered = filtered.filter((e) => e.labels.some((l) => l.toLowerCase() === label));
    }

    if (query.excludeTerms && query.excludeTerms.length > 0) {
      filtered = filtered.filter((e) => {
        const text = `${e.subject} ${e.body}`.toLowerCase();
        return !query.excludeTerms!.some((term) => text.includes(term));
      });
    }

    // Score by keyword relevance
    const results: SearchResult[] = [];
    const allTerms = [
      ...query.keywords,
      ...(query.subjectKeywords ?? []),
    ].map((t) => t.toLowerCase());

    for (const email of filtered) {
      let score = 0;
      const highlights: SearchHighlight[] = [];

      if (allTerms.length === 0) {
        // No keyword search — just structural match
        score = 1;
      } else {
        const subjectLower = email.subject.toLowerCase();
        const bodyLower = email.body.toLowerCase();

        for (const term of allTerms) {
          if (subjectLower.includes(term)) {
            score += 3; // Subject match worth more
            highlights.push({
              field: 'subject',
              text: email.subject,
              matchedTerms: [term],
            });
          }
          if (bodyLower.includes(term)) {
            score += 1;
            // Extract context around match
            const idx = bodyLower.indexOf(term);
            const start = Math.max(0, idx - 50);
            const end = Math.min(email.body.length, idx + term.length + 50);
            highlights.push({
              field: 'body',
              text: `...${email.body.slice(start, end)}...`,
              matchedTerms: [term],
            });
          }
          if (email.from.toLowerCase().includes(term) || email.fromName.toLowerCase().includes(term)) {
            score += 2;
            highlights.push({
              field: 'from',
              text: `${email.fromName} <${email.from}>`,
              matchedTerms: [term],
            });
          }
          for (const att of email.attachments) {
            if (att.filename.toLowerCase().includes(term)) {
              score += 2;
              highlights.push({
                field: 'attachment',
                text: att.filename,
                matchedTerms: [term],
              });
            }
          }
        }
      }

      if (score > 0 || allTerms.length === 0) {
        // Recency boost
        const ageHours = (Date.now() - email.receivedAt.getTime()) / 3_600_000;
        const recencyBoost = Math.max(0, 1 - ageHours / (24 * 365)); // decay over a year

        results.push({
          emailId: email.id,
          threadId: email.threadId,
          score: score + recencyBoost * 0.5,
          matchReason: this.buildMatchReason(query, highlights),
          highlights: highlights.slice(0, 5), // Limit highlights
        });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, 100);
  }

  private buildMatchReason(query: ParsedQuery, highlights: SearchHighlight[]): string {
    const parts: string[] = [];

    if (query.from) parts.push(`from ${query.from}`);
    if (query.to) parts.push(`to ${query.to}`);
    if (query.dateRange?.after) parts.push(`after ${query.dateRange.after.toLocaleDateString()}`);
    if (query.hasAttachment) parts.push('with attachment');
    if (query.isUnread) parts.push('unread');
    if (highlights.length > 0) {
      const fields = [...new Set(highlights.map((h) => h.field))];
      parts.push(`matched in ${fields.join(', ')}`);
    }

    return parts.length > 0 ? `Found: ${parts.join(', ')}` : 'Matched by content';
  }
}

// ─── Factory ────────────────────────────────────────────────────────────────

export function createSearchEngine(context: SearchContext): {
  parser: NaturalLanguageQueryParser;
  executor: SearchExecutor;
} {
  return {
    parser: new NaturalLanguageQueryParser(context),
    executor: new SearchExecutor(),
  };
}
