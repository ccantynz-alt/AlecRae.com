/**
 * AlecRae IndexedDB Cache — Local-First Email Storage
 *
 * Makes AlecRae feel instant. Emails load from local cache in <50ms
 * while background sync fetches updates from the server.
 *
 * Architecture:
 *   - All synced emails cached in IndexedDB (browser-native, no size limit)
 *   - Reads hit local cache first (instant), then sync in background
 *   - Writes go to server, then update local cache on confirmation
 *   - Offline support: read cached emails without network
 *   - Automatic cache eviction for free-tier (30-day window)
 */

// ─── Database Schema ─────────────────────────────────────────────────────────

const DB_NAME = "alecrae-mail";
const DB_VERSION = 1;

const STORES = {
  emails: "emails",
  threads: "threads",
  folders: "folders",
  accounts: "accounts",
  drafts: "drafts",
  search: "search",
  settings: "settings",
} as const;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CachedEmail {
  id: string;
  accountId: string;
  threadId: string;
  from: { name: string | null; email: string };
  to: { name: string | null; email: string }[];
  cc: { name: string | null; email: string }[];
  subject: string;
  snippet: string;
  textBody: string | null;
  htmlBody: string | null;
  date: number; // timestamp for indexing
  isRead: boolean;
  isStarred: boolean;
  isDraft: boolean;
  isArchived: boolean;
  isTrashed: boolean;
  isSpam: boolean;
  folders: string[];
  labels: string[];
  hasAttachments: boolean;
  attachments: { id: string; filename: string; contentType: string; size: number }[];
  aiCategory?: string;
  aiPriority?: number;
  snoozedUntil?: number;
  syncedAt: number;
}

export interface CachedThread {
  id: string;
  accountId: string;
  subject: string;
  lastMessageDate: number;
  messageCount: number;
  unreadCount: number;
  participants: { name: string | null; email: string }[];
  snippet: string;
  isStarred: boolean;
  labels: string[];
  folders: string[];
}

export interface CachedDraft {
  id: string;
  accountId: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  body: string;
  bodyFormat: "text" | "html";
  replyToId?: string;
  forwardOfId?: string;
  savedAt: number;
  /** Auto-save interval tracking */
  version: number;
}

// ─── IndexedDB Manager ───────────────────────────────────────────────────────

let dbInstance: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Emails store with indexes for fast queries
      if (!db.objectStoreNames.contains(STORES.emails)) {
        const emailStore = db.createObjectStore(STORES.emails, { keyPath: "id" });
        emailStore.createIndex("accountId", "accountId", { unique: false });
        emailStore.createIndex("threadId", "threadId", { unique: false });
        emailStore.createIndex("date", "date", { unique: false });
        emailStore.createIndex("isRead", "isRead", { unique: false });
        emailStore.createIndex("isStarred", "isStarred", { unique: false });
        emailStore.createIndex("folders", "folders", { multiEntry: true });
        emailStore.createIndex("labels", "labels", { multiEntry: true });
        emailStore.createIndex("accountId_date", ["accountId", "date"], { unique: false });
        emailStore.createIndex("accountId_isRead", ["accountId", "isRead"], { unique: false });
        emailStore.createIndex("snoozedUntil", "snoozedUntil", { unique: false });
      }

      // Threads store
      if (!db.objectStoreNames.contains(STORES.threads)) {
        const threadStore = db.createObjectStore(STORES.threads, { keyPath: "id" });
        threadStore.createIndex("accountId", "accountId", { unique: false });
        threadStore.createIndex("lastMessageDate", "lastMessageDate", { unique: false });
      }

      // Folders store
      if (!db.objectStoreNames.contains(STORES.folders)) {
        const folderStore = db.createObjectStore(STORES.folders, { keyPath: "id" });
        folderStore.createIndex("accountId", "accountId", { unique: false });
      }

      // Accounts store
      if (!db.objectStoreNames.contains(STORES.accounts)) {
        db.createObjectStore(STORES.accounts, { keyPath: "id" });
      }

      // Drafts store (auto-saved)
      if (!db.objectStoreNames.contains(STORES.drafts)) {
        const draftStore = db.createObjectStore(STORES.drafts, { keyPath: "id" });
        draftStore.createIndex("accountId", "accountId", { unique: false });
        draftStore.createIndex("savedAt", "savedAt", { unique: false });
      }

      // Full-text search index (trigrams for offline search)
      if (!db.objectStoreNames.contains(STORES.search)) {
        const searchStore = db.createObjectStore(STORES.search, { keyPath: "emailId" });
        searchStore.createIndex("terms", "terms", { multiEntry: true });
      }

      // Settings/preferences store
      if (!db.objectStoreNames.contains(STORES.settings)) {
        db.createObjectStore(STORES.settings, { keyPath: "key" });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = (event.target as IDBOpenDBRequest).result;
      resolve(dbInstance);
    };

    request.onerror = () => {
      reject(new Error("Failed to open IndexedDB"));
    };
  });
}

// ─── Generic CRUD helpers ────────────────────────────────────────────────────

async function put<T>(storeName: string, data: T): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).put(data);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function putMany<T>(storeName: string, items: T[]): Promise<void> {
  if (items.length === 0) return;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    for (const item of items) {
      store.put(item);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function get<T>(storeName: string, key: string): Promise<T | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const request = tx.objectStore(storeName).get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error);
  });
}

async function getAll<T>(storeName: string): Promise<T[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const request = tx.objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error);
  });
}

async function deleteItem(storeName: string, key: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function queryByIndex<T>(
  storeName: string,
  indexName: string,
  value: IDBValidKey | IDBKeyRange,
  limit?: number,
  direction: IDBCursorDirection = "prev",
): Promise<T[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const index = tx.objectStore(storeName).index(indexName);
    const results: T[] = [];
    const request = index.openCursor(value, direction);

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor && (!limit || results.length < limit)) {
        results.push(cursor.value as T);
        cursor.continue();
      } else {
        resolve(results);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

// ─── Email Cache API ─────────────────────────────────────────────────────────

export const emailCache = {
  /** Store a batch of emails (from sync) */
  async putEmails(emails: CachedEmail[]): Promise<void> {
    await putMany(STORES.emails, emails);
    // Update search index
    for (const email of emails) {
      await this.indexForSearch(email);
    }
  },

  /** Get a single email by ID */
  async getEmail(id: string): Promise<CachedEmail | undefined> {
    return get<CachedEmail>(STORES.emails, id);
  },

  /** Get emails for an account, sorted by date (newest first) */
  async getInbox(accountId: string, options?: {
    limit?: number;
    folder?: string;
    unreadOnly?: boolean;
    starredOnly?: boolean;
  }): Promise<CachedEmail[]> {
    let emails = await queryByIndex<CachedEmail>(
      STORES.emails,
      "accountId",
      accountId,
    );

    // Apply filters
    const folder = options?.folder;
    if (folder) {
      emails = emails.filter((e) => e.folders.includes(folder));
    }
    if (options?.unreadOnly) {
      emails = emails.filter((e) => !e.isRead);
    }
    if (options?.starredOnly) {
      emails = emails.filter((e) => e.isStarred);
    }

    // Exclude trashed/spam by default
    emails = emails.filter((e) => !e.isTrashed && !e.isSpam);

    // Sort by date descending
    emails.sort((a, b) => b.date - a.date);

    return options?.limit ? emails.slice(0, options.limit) : emails;
  },

  /** Get all emails in a thread */
  async getThread(threadId: string): Promise<CachedEmail[]> {
    const emails = await queryByIndex<CachedEmail>(STORES.emails, "threadId", threadId);
    return emails.sort((a, b) => a.date - b.date);
  },

  /** Mark email as read/unread */
  async setRead(id: string, isRead: boolean): Promise<void> {
    const email = await this.getEmail(id);
    if (email) {
      email.isRead = isRead;
      await put(STORES.emails, email);
    }
  },

  /** Toggle star */
  async setStar(id: string, isStarred: boolean): Promise<void> {
    const email = await this.getEmail(id);
    if (email) {
      email.isStarred = isStarred;
      await put(STORES.emails, email);
    }
  },

  /** Archive email */
  async archive(id: string): Promise<void> {
    const email = await this.getEmail(id);
    if (email) {
      email.isArchived = true;
      email.folders = email.folders.filter((f) => f !== "INBOX");
      await put(STORES.emails, email);
    }
  },

  /** Trash email */
  async trash(id: string): Promise<void> {
    const email = await this.getEmail(id);
    if (email) {
      email.isTrashed = true;
      await put(STORES.emails, email);
    }
  },

  /** Snooze email until a specific time */
  async snooze(id: string, untilTimestamp: number): Promise<void> {
    const email = await this.getEmail(id);
    if (email) {
      email.snoozedUntil = untilTimestamp;
      email.folders = email.folders.filter((f) => f !== "INBOX");
      await put(STORES.emails, email);
    }
  },

  /** Get snoozed emails that should reappear */
  async getUnsnoozeReady(): Promise<CachedEmail[]> {
    const now = Date.now();
    const all = await getAll<CachedEmail>(STORES.emails);
    return all.filter((e) => e.snoozedUntil && e.snoozedUntil <= now);
  },

  /** Delete email permanently from cache */
  async deleteEmail(id: string): Promise<void> {
    await deleteItem(STORES.emails, id);
    await deleteItem(STORES.search, id);
  },

  /** Get unread count for an account */
  async getUnreadCount(accountId: string): Promise<number> {
    const emails = await this.getInbox(accountId, { unreadOnly: true });
    return emails.length;
  },

  /** Index email for local full-text search */
  async indexForSearch(email: CachedEmail): Promise<void> {
    const text = [
      email.subject,
      email.snippet,
      email.from.name,
      email.from.email,
      ...email.to.map((t) => `${t.name ?? ""} ${t.email}`),
      email.textBody ?? "",
    ]
      .join(" ")
      .toLowerCase();

    // Extract unique words (simple tokenization)
    const terms = [...new Set(
      text
        .replace(/[^a-z0-9\s@.-]/g, "")
        .split(/\s+/)
        .filter((w) => w.length >= 2),
    )];

    await put(STORES.search, { emailId: email.id, terms });
  },

  /** Search cached emails locally */
  async search(query: string, accountId?: string, limit = 50): Promise<CachedEmail[]> {
    const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length >= 2);
    if (terms.length === 0) return [];

    const db = await openDB();
    const matchingIds = new Set<string>();

    // For each search term, find matching email IDs
    for (const term of terms) {
      const tx = db.transaction(STORES.search, "readonly");
      const index = tx.objectStore(STORES.search).index("terms");
      const request = index.getAll(term);

      await new Promise<void>((resolve) => {
        request.onsuccess = () => {
          for (const result of request.result as { emailId: string }[]) {
            matchingIds.add(result.emailId);
          }
          resolve();
        };
      });
    }

    // Fetch matching emails
    const emails: CachedEmail[] = [];
    for (const id of matchingIds) {
      if (emails.length >= limit) break;
      const email = await this.getEmail(id);
      if (email && (!accountId || email.accountId === accountId)) {
        emails.push(email);
      }
    }

    return emails.sort((a, b) => b.date - a.date);
  },

  /** Evict old emails (for free tier: 30-day window) */
  async evictOlderThan(days: number): Promise<number> {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const all = await getAll<CachedEmail>(STORES.emails);
    let evicted = 0;

    for (const email of all) {
      if (email.date < cutoff) {
        await this.deleteEmail(email.id);
        evicted++;
      }
    }

    return evicted;
  },

  /** Get total cache size (approximate) */
  async getCacheStats(): Promise<{ emailCount: number; draftCount: number; oldestEmail: number | null }> {
    const emails = await getAll<CachedEmail>(STORES.emails);
    const drafts = await getAll<CachedDraft>(STORES.drafts);
    const oldest = emails.reduce((min, e) => Math.min(min, e.date), Infinity);

    return {
      emailCount: emails.length,
      draftCount: drafts.length,
      oldestEmail: emails.length > 0 ? oldest : null,
    };
  },

  /** Clear all cached data */
  async clearAll(): Promise<void> {
    const db = await openDB();
    const storeNames = Object.values(STORES);
    const tx = db.transaction(storeNames, "readwrite");
    for (const name of storeNames) {
      tx.objectStore(name).clear();
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },
};

// ─── Draft Auto-Save ─────────────────────────────────────────────────────────

export const draftCache = {
  async saveDraft(draft: CachedDraft): Promise<void> {
    await put(STORES.drafts, { ...draft, savedAt: Date.now() });
  },

  async getDraft(id: string): Promise<CachedDraft | undefined> {
    return get<CachedDraft>(STORES.drafts, id);
  },

  async getAllDrafts(accountId: string): Promise<CachedDraft[]> {
    const all = await queryByIndex<CachedDraft>(STORES.drafts, "accountId", accountId);
    return all.sort((a, b) => b.savedAt - a.savedAt);
  },

  async deleteDraft(id: string): Promise<void> {
    await deleteItem(STORES.drafts, id);
  },
};

// ─── Settings Cache ──────────────────────────────────────────────────────────

export const settingsCache = {
  async get<T>(key: string): Promise<T | undefined> {
    const result = await get<{ key: string; value: T }>(STORES.settings, key);
    return result?.value;
  },

  async set<T>(key: string, value: T): Promise<void> {
    await put(STORES.settings, { key, value });
  },
};
