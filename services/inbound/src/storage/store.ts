import type { ParsedEmail, StoredEmail, ResolvedRecipient, EmailAddress, FilterVerdict } from "../types.js";

/**
 * Email storage interface and in-memory implementation.
 * Stores parsed emails with full indexing for search and retrieval.
 */

// --- Index Types ---

interface SearchQuery {
  accountId: string;
  mailboxId?: string;
  from?: string;
  to?: string;
  subject?: string;
  body?: string;
  hasAttachments?: boolean;
  after?: Date;
  before?: Date;
  flags?: string[];
  labels?: string[];
  limit?: number;
  offset?: number;
}

interface SearchResult {
  emails: StoredEmail[];
  total: number;
}

interface StoreStats {
  totalEmails: number;
  totalSize: number;
  accountCount: number;
  mailboxCount: number;
}

// --- Storage Interface ---

export interface EmailStore {
  store(email: ParsedEmail, recipient: ResolvedRecipient, verdict: FilterVerdict): Promise<StoredEmail>;
  getById(accountId: string, emailId: string): Promise<StoredEmail | null>;
  getByMessageId(accountId: string, messageId: string): Promise<StoredEmail | null>;
  search(query: SearchQuery): Promise<SearchResult>;
  updateFlags(accountId: string, emailId: string, flags: Set<string>): Promise<void>;
  updateLabels(accountId: string, emailId: string, labels: string[]): Promise<void>;
  delete(accountId: string, emailId: string): Promise<boolean>;
  getStats(): StoreStats;
}

// --- In-Memory Implementation ---

function generateId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function generateSnippet(text?: string, html?: string, maxLength = 200): string {
  const source = text ?? html?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ") ?? "";
  return source.trim().slice(0, maxLength);
}

function formatAddress(addr: EmailAddress): string {
  return addr.name ? `${addr.name} <${addr.address}>` : addr.address;
}

/**
 * Inverted index for full-text search.
 */
class TextIndex {
  private index = new Map<string, Set<string>>();

  add(emailId: string, text: string): void {
    const tokens = this.tokenize(text);
    for (const token of tokens) {
      let set = this.index.get(token);
      if (!set) {
        set = new Set();
        this.index.set(token, set);
      }
      set.add(emailId);
    }
  }

  search(query: string): Set<string> {
    const tokens = this.tokenize(query);
    if (tokens.length === 0) return new Set();

    let result: Set<string> | null = null;
    for (const token of tokens) {
      const matches = this.index.get(token) ?? new Set();
      if (result === null) {
        result = new Set(matches);
      } else {
        // Intersect
        for (const id of result) {
          if (!matches.has(id)) result.delete(id);
        }
      }
    }

    return result ?? new Set();
  }

  remove(emailId: string): void {
    for (const [, set] of this.index) {
      set.delete(emailId);
    }
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w@.-]+/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 2);
  }
}

export class InMemoryEmailStore implements EmailStore {
  private emails = new Map<string, StoredEmail>();
  private byAccount = new Map<string, Set<string>>();
  private byMailbox = new Map<string, Set<string>>();
  private byMessageId = new Map<string, string>(); // messageId -> emailId
  private subjectIndex = new TextIndex();
  private bodyIndex = new TextIndex();
  private fromIndex = new TextIndex();
  private totalSize = 0;

  async store(
    email: ParsedEmail,
    recipient: ResolvedRecipient,
    verdict: FilterVerdict,
  ): Promise<StoredEmail> {
    const id = generateId();
    const now = new Date();

    const flags = new Set<string>();
    flags.add("\\Recent");
    if (verdict.action === "quarantine") flags.add("\\Quarantine");

    // Copy spam/phishing flags
    for (const flag of verdict.flags) {
      if (flag.startsWith("spam") || flag.startsWith("phishing")) {
        flags.add(`$${flag}`);
      }
    }

    const stored: StoredEmail = {
      id,
      accountId: recipient.accountId,
      mailboxId: recipient.mailboxId,
      messageId: email.messageId,
      from: email.from,
      to: email.to,
      cc: email.cc,
      subject: email.subject,
      snippet: generateSnippet(email.text, email.html),
      hasAttachments: email.attachments.length > 0,
      size: email.rawSize,
      flags,
      labels: ["INBOX"],
      receivedAt: now,
      internalDate: email.date ?? now,
    };

    // Store the email
    this.emails.set(id, stored);
    this.totalSize += email.rawSize;

    // Update indexes
    let accountSet = this.byAccount.get(recipient.accountId);
    if (!accountSet) {
      accountSet = new Set();
      this.byAccount.set(recipient.accountId, accountSet);
    }
    accountSet.add(id);

    let mailboxSet = this.byMailbox.get(recipient.mailboxId);
    if (!mailboxSet) {
      mailboxSet = new Set();
      this.byMailbox.set(recipient.mailboxId, mailboxSet);
    }
    mailboxSet.add(id);

    this.byMessageId.set(email.messageId, id);

    // Full-text indexes
    this.subjectIndex.add(id, email.subject);
    this.bodyIndex.add(id, email.text ?? "");
    this.fromIndex.add(id, email.from.map(formatAddress).join(" "));

    return stored;
  }

  async getById(accountId: string, emailId: string): Promise<StoredEmail | null> {
    const email = this.emails.get(emailId);
    if (!email || email.accountId !== accountId) return null;
    return email;
  }

  async getByMessageId(accountId: string, messageId: string): Promise<StoredEmail | null> {
    const emailId = this.byMessageId.get(messageId);
    if (!emailId) return null;
    return this.getById(accountId, emailId);
  }

  async search(query: SearchQuery): Promise<SearchResult> {
    const accountEmails = this.byAccount.get(query.accountId);
    if (!accountEmails) return { emails: [], total: 0 };

    let candidateIds = new Set(accountEmails);

    // Filter by mailbox
    if (query.mailboxId) {
      const mailboxEmails = this.byMailbox.get(query.mailboxId);
      if (!mailboxEmails) return { emails: [], total: 0 };
      candidateIds = new Set([...candidateIds].filter((id) => mailboxEmails.has(id)));
    }

    // Full-text search filters
    if (query.subject) {
      const matches = this.subjectIndex.search(query.subject);
      candidateIds = new Set([...candidateIds].filter((id) => matches.has(id)));
    }

    if (query.body) {
      const matches = this.bodyIndex.search(query.body);
      candidateIds = new Set([...candidateIds].filter((id) => matches.has(id)));
    }

    if (query.from) {
      const matches = this.fromIndex.search(query.from);
      candidateIds = new Set([...candidateIds].filter((id) => matches.has(id)));
    }

    // Apply remaining filters
    let results: StoredEmail[] = [];
    for (const id of candidateIds) {
      const email = this.emails.get(id);
      if (!email) continue;

      if (query.to) {
        const needle = query.to.toLowerCase();
        const toAddresses = email.to.map((a) => a.address.toLowerCase());
        if (!toAddresses.some((a) => a.includes(needle))) continue;
      }

      if (query.hasAttachments !== undefined && email.hasAttachments !== query.hasAttachments) continue;

      if (query.after && email.receivedAt < query.after) continue;
      if (query.before && email.receivedAt > query.before) continue;

      if (query.flags) {
        const hasAllFlags = query.flags.every((f) => email.flags.has(f));
        if (!hasAllFlags) continue;
      }

      if (query.labels) {
        const hasAllLabels = query.labels.every((l) => email.labels.includes(l));
        if (!hasAllLabels) continue;
      }

      results.push(email);
    }

    // Sort by date descending
    results.sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime());

    const total = results.length;
    const offset = query.offset ?? 0;
    const limit = query.limit ?? 50;
    results = results.slice(offset, offset + limit);

    return { emails: results, total };
  }

  async updateFlags(accountId: string, emailId: string, flags: Set<string>): Promise<void> {
    const email = this.emails.get(emailId);
    if (!email || email.accountId !== accountId) {
      throw new Error(`Email ${emailId} not found`);
    }
    email.flags = flags;
  }

  async updateLabels(accountId: string, emailId: string, labels: string[]): Promise<void> {
    const email = this.emails.get(emailId);
    if (!email || email.accountId !== accountId) {
      throw new Error(`Email ${emailId} not found`);
    }
    email.labels = labels;
  }

  async delete(accountId: string, emailId: string): Promise<boolean> {
    const email = this.emails.get(emailId);
    if (!email || email.accountId !== accountId) return false;

    this.emails.delete(emailId);
    this.byAccount.get(accountId)?.delete(emailId);
    this.byMailbox.get(email.mailboxId)?.delete(emailId);
    this.byMessageId.delete(email.messageId);
    this.subjectIndex.remove(emailId);
    this.bodyIndex.remove(emailId);
    this.fromIndex.remove(emailId);
    this.totalSize -= email.size;

    return true;
  }

  getStats(): StoreStats {
    return {
      totalEmails: this.emails.size,
      totalSize: this.totalSize,
      accountCount: this.byAccount.size,
      mailboxCount: this.byMailbox.size,
    };
  }
}
