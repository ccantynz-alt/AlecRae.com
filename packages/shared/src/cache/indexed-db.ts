// =============================================================================
// Vienna — IndexedDB Offline-First Email Cache
// =============================================================================
// Local-first architecture: all emails cached in IndexedDB for <200ms inbox load.
// Syncs bidirectionally with server. Works fully offline.
// This is what makes Vienna feel instant while Gmail waits for network.

/** Database schema version — bump on schema changes */
const DB_VERSION = 1;
const DB_NAME = 'vienna-mail';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CachedEmail {
  id: string;
  accountId: string;
  threadId: string;
  mailboxId: string;
  from: EmailAddress;
  to: EmailAddress[];
  cc: EmailAddress[];
  bcc: EmailAddress[];
  subject: string;
  snippet: string;
  textBody: string;
  htmlBody: string;
  receivedAt: number; // timestamp ms for indexing
  sentAt: number;
  isRead: boolean;
  isStarred: boolean;
  isFlagged: boolean;
  isDraft: boolean;
  labels: string[];
  attachments: CachedAttachment[];
  headers: Record<string, string>;
  aiPriority: number; // 0-100, from AI triage
  aiCategory: string; // AI-assigned category
  aiSummary: string | null;
  syncState: SyncState;
  lastSyncedAt: number;
}

export interface EmailAddress {
  name: string;
  address: string;
}

export interface CachedAttachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  contentId?: string;
  /** Stored as blob URL after download, null if not cached locally */
  localBlobUrl: string | null;
}

export interface CachedThread {
  id: string;
  accountId: string;
  subject: string;
  participants: EmailAddress[];
  messageIds: string[];
  lastMessageAt: number;
  unreadCount: number;
  snippet: string;
  labels: string[];
  aiPriority: number;
  aiSummary: string | null;
}

export interface CachedMailbox {
  id: string;
  accountId: string;
  name: string;
  role: MailboxRole;
  parentId: string | null;
  totalEmails: number;
  unreadEmails: number;
  sortOrder: number;
  syncState: string; // JMAP state token
  lastSyncedAt: number;
}

export type MailboxRole =
  | 'inbox' | 'sent' | 'drafts' | 'trash' | 'spam' | 'archive'
  | 'important' | 'starred' | 'all' | 'custom';

export interface CachedContact {
  id: string;
  accountId: string;
  email: string;
  name: string;
  avatar: string | null;
  interactionCount: number;
  lastInteractionAt: number;
  aiRelationshipScore: number; // 0-100 from Communication Intelligence Graph
  notes: string;
}

export interface SyncQueueItem {
  id: string;
  operation: 'create' | 'update' | 'delete' | 'move' | 'flag' | 'read';
  objectType: 'email' | 'mailbox' | 'thread';
  objectId: string;
  payload: Record<string, unknown>;
  createdAt: number;
  retryCount: number;
  lastError: string | null;
}

export type SyncState = 'synced' | 'pending_upload' | 'pending_download' | 'conflict';

export interface SearchIndex {
  emailId: string;
  tokens: string; // space-separated lowercase tokens for full-text search
  from: string;
  to: string;
  subject: string;
  date: number;
}

// ─── Database Manager ───────────────────────────────────────────────────────

export class ViennaDB {
  private db: IDBDatabase | null = null;
  private readonly dbName: string;
  private readonly version: number;

  constructor(dbName: string = DB_NAME, version: number = DB_VERSION) {
    this.dbName = dbName;
    this.version = version;
  }

  async open(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        this.createSchema(db);
      };

      request.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result;
        resolve();
      };

      request.onerror = () => {
        reject(new Error(`Failed to open database: ${request.error?.message}`));
      };
    });
  }

  private createSchema(db: IDBDatabase): void {
    // Emails store
    if (!db.objectStoreNames.contains('emails')) {
      const emails = db.createObjectStore('emails', { keyPath: 'id' });
      emails.createIndex('accountId', 'accountId', { unique: false });
      emails.createIndex('threadId', 'threadId', { unique: false });
      emails.createIndex('mailboxId', 'mailboxId', { unique: false });
      emails.createIndex('receivedAt', 'receivedAt', { unique: false });
      emails.createIndex('isRead', 'isRead', { unique: false });
      emails.createIndex('aiPriority', 'aiPriority', { unique: false });
      emails.createIndex('syncState', 'syncState', { unique: false });
      emails.createIndex('account_mailbox', ['accountId', 'mailboxId'], { unique: false });
      emails.createIndex('account_received', ['accountId', 'receivedAt'], { unique: false });
    }

    // Threads store
    if (!db.objectStoreNames.contains('threads')) {
      const threads = db.createObjectStore('threads', { keyPath: 'id' });
      threads.createIndex('accountId', 'accountId', { unique: false });
      threads.createIndex('lastMessageAt', 'lastMessageAt', { unique: false });
      threads.createIndex('aiPriority', 'aiPriority', { unique: false });
    }

    // Mailboxes store
    if (!db.objectStoreNames.contains('mailboxes')) {
      const mailboxes = db.createObjectStore('mailboxes', { keyPath: 'id' });
      mailboxes.createIndex('accountId', 'accountId', { unique: false });
      mailboxes.createIndex('role', 'role', { unique: false });
    }

    // Contacts store
    if (!db.objectStoreNames.contains('contacts')) {
      const contacts = db.createObjectStore('contacts', { keyPath: 'id' });
      contacts.createIndex('accountId', 'accountId', { unique: false });
      contacts.createIndex('email', 'email', { unique: false });
      contacts.createIndex('interactionCount', 'interactionCount', { unique: false });
    }

    // Sync queue — offline mutations waiting to be pushed
    if (!db.objectStoreNames.contains('syncQueue')) {
      const queue = db.createObjectStore('syncQueue', { keyPath: 'id' });
      queue.createIndex('createdAt', 'createdAt', { unique: false });
      queue.createIndex('objectType', 'objectType', { unique: false });
    }

    // Search index — tokenized for fast local search
    if (!db.objectStoreNames.contains('searchIndex')) {
      const search = db.createObjectStore('searchIndex', { keyPath: 'emailId' });
      search.createIndex('tokens', 'tokens', { unique: false, multiEntry: false });
      search.createIndex('date', 'date', { unique: false });
    }

    // Metadata — sync cursors, last sync times, account state
    if (!db.objectStoreNames.contains('metadata')) {
      db.createObjectStore('metadata', { keyPath: 'key' });
    }
  }

  private getStore(storeName: string, mode: IDBTransactionMode = 'readonly'): IDBObjectStore {
    if (!this.db) throw new Error('Database not opened. Call open() first.');
    const tx = this.db.transaction(storeName, mode);
    return tx.objectStore(storeName);
  }

  // ─── Email Operations ───────────────────────────────────────────────────

  async putEmail(email: CachedEmail): Promise<void> {
    return new Promise((resolve, reject) => {
      const store = this.getStore('emails', 'readwrite');
      const request = store.put(email);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async putEmails(emails: CachedEmail[]): Promise<void> {
    if (!this.db) throw new Error('Database not opened');
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction('emails', 'readwrite');
      const store = tx.objectStore('emails');
      for (const email of emails) {
        store.put(email);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async getEmail(id: string): Promise<CachedEmail | undefined> {
    return new Promise((resolve, reject) => {
      const store = this.getStore('emails');
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result ?? undefined);
      request.onerror = () => reject(request.error);
    });
  }

  async getEmailsByMailbox(
    accountId: string,
    mailboxId: string,
    options: { limit?: number; offset?: number; sortDesc?: boolean } = {},
  ): Promise<CachedEmail[]> {
    const { limit = 50, offset = 0, sortDesc = true } = options;
    return new Promise((resolve, reject) => {
      const store = this.getStore('emails');
      const index = store.index('account_mailbox');
      const range = IDBKeyRange.only([accountId, mailboxId]);
      const request = index.openCursor(range, sortDesc ? 'prev' : 'next');
      const results: CachedEmail[] = [];
      let skipped = 0;

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
        if (!cursor || results.length >= limit) {
          resolve(results);
          return;
        }
        if (skipped < offset) {
          skipped++;
          cursor.continue();
          return;
        }
        results.push(cursor.value);
        cursor.continue();
      };
      request.onerror = () => reject(request.error);
    });
  }

  async getEmailsByThread(threadId: string): Promise<CachedEmail[]> {
    return new Promise((resolve, reject) => {
      const store = this.getStore('emails');
      const index = store.index('threadId');
      const request = index.getAll(threadId);
      request.onsuccess = () => {
        const emails = request.result as CachedEmail[];
        emails.sort((a, b) => a.receivedAt - b.receivedAt);
        resolve(emails);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async getUnreadCount(accountId: string, mailboxId?: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const store = this.getStore('emails');
      let count = 0;

      const index = mailboxId
        ? store.index('account_mailbox')
        : store.index('accountId');
      const range = mailboxId
        ? IDBKeyRange.only([accountId, mailboxId])
        : IDBKeyRange.only(accountId);

      const request = index.openCursor(range);
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
        if (!cursor) {
          resolve(count);
          return;
        }
        if (!cursor.value.isRead) count++;
        cursor.continue();
      };
      request.onerror = () => reject(request.error);
    });
  }

  async markRead(emailId: string, isRead: boolean): Promise<void> {
    const email = await this.getEmail(emailId);
    if (!email) return;
    email.isRead = isRead;
    email.syncState = 'pending_upload';
    await this.putEmail(email);
    await this.enqueueSyncAction({
      id: `read-${emailId}-${Date.now()}`,
      operation: 'read',
      objectType: 'email',
      objectId: emailId,
      payload: { isRead },
      createdAt: Date.now(),
      retryCount: 0,
      lastError: null,
    });
  }

  async deleteEmail(emailId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const store = this.getStore('emails', 'readwrite');
      const request = store.delete(emailId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // ─── Thread Operations ──────────────────────────────────────────────────

  async putThread(thread: CachedThread): Promise<void> {
    return new Promise((resolve, reject) => {
      const store = this.getStore('threads', 'readwrite');
      const request = store.put(thread);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getThread(id: string): Promise<CachedThread | undefined> {
    return new Promise((resolve, reject) => {
      const store = this.getStore('threads');
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result ?? undefined);
      request.onerror = () => reject(request.error);
    });
  }

  async getThreadsByAccount(
    accountId: string,
    options: { limit?: number; sortBy?: 'lastMessageAt' | 'aiPriority' } = {},
  ): Promise<CachedThread[]> {
    const { limit = 50, sortBy = 'lastMessageAt' } = options;
    return new Promise((resolve, reject) => {
      const store = this.getStore('threads');
      const index = store.index('accountId');
      const request = index.getAll(accountId);
      request.onsuccess = () => {
        let threads = request.result as CachedThread[];
        if (sortBy === 'aiPriority') {
          threads.sort((a, b) => b.aiPriority - a.aiPriority);
        } else {
          threads.sort((a, b) => b.lastMessageAt - a.lastMessageAt);
        }
        resolve(threads.slice(0, limit));
      };
      request.onerror = () => reject(request.error);
    });
  }

  // ─── Mailbox Operations ─────────────────────────────────────────────────

  async putMailbox(mailbox: CachedMailbox): Promise<void> {
    return new Promise((resolve, reject) => {
      const store = this.getStore('mailboxes', 'readwrite');
      const request = store.put(mailbox);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getMailboxesByAccount(accountId: string): Promise<CachedMailbox[]> {
    return new Promise((resolve, reject) => {
      const store = this.getStore('mailboxes');
      const index = store.index('accountId');
      const request = index.getAll(accountId);
      request.onsuccess = () => {
        const mailboxes = request.result as CachedMailbox[];
        mailboxes.sort((a, b) => a.sortOrder - b.sortOrder);
        resolve(mailboxes);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async getMailboxByRole(accountId: string, role: MailboxRole): Promise<CachedMailbox | undefined> {
    const mailboxes = await this.getMailboxesByAccount(accountId);
    return mailboxes.find((m) => m.role === role);
  }

  // ─── Contact Operations ─────────────────────────────────────────────────

  async putContact(contact: CachedContact): Promise<void> {
    return new Promise((resolve, reject) => {
      const store = this.getStore('contacts', 'readwrite');
      const request = store.put(contact);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async searchContacts(accountId: string, query: string, limit: number = 10): Promise<CachedContact[]> {
    return new Promise((resolve, reject) => {
      const store = this.getStore('contacts');
      const index = store.index('accountId');
      const request = index.getAll(accountId);
      const lower = query.toLowerCase();

      request.onsuccess = () => {
        const contacts = (request.result as CachedContact[])
          .filter((c) => c.name.toLowerCase().includes(lower) || c.email.toLowerCase().includes(lower))
          .sort((a, b) => b.interactionCount - a.interactionCount)
          .slice(0, limit);
        resolve(contacts);
      };
      request.onerror = () => reject(request.error);
    });
  }

  // ─── Sync Queue ─────────────────────────────────────────────────────────

  async enqueueSyncAction(item: SyncQueueItem): Promise<void> {
    return new Promise((resolve, reject) => {
      const store = this.getStore('syncQueue', 'readwrite');
      const request = store.put(item);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getPendingSyncActions(limit: number = 100): Promise<SyncQueueItem[]> {
    return new Promise((resolve, reject) => {
      const store = this.getStore('syncQueue');
      const index = store.index('createdAt');
      const request = index.openCursor(null, 'next');
      const results: SyncQueueItem[] = [];

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
        if (!cursor || results.length >= limit) {
          resolve(results);
          return;
        }
        results.push(cursor.value);
        cursor.continue();
      };
      request.onerror = () => reject(request.error);
    });
  }

  async removeSyncAction(id: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const store = this.getStore('syncQueue', 'readwrite');
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getSyncQueueSize(): Promise<number> {
    return new Promise((resolve, reject) => {
      const store = this.getStore('syncQueue');
      const request = store.count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // ─── Local Full-Text Search ─────────────────────────────────────────────

  async indexEmail(email: CachedEmail): Promise<void> {
    const tokens = this.tokenize(
      `${email.subject} ${email.from.name} ${email.from.address} ${email.to.map((t) => `${t.name} ${t.address}`).join(' ')} ${email.textBody}`,
    );

    const entry: SearchIndex = {
      emailId: email.id,
      tokens,
      from: email.from.address.toLowerCase(),
      to: email.to.map((t) => t.address.toLowerCase()).join(' '),
      subject: email.subject.toLowerCase(),
      date: email.receivedAt,
    };

    return new Promise((resolve, reject) => {
      const store = this.getStore('searchIndex', 'readwrite');
      const request = store.put(entry);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async searchEmails(query: string, options: { limit?: number; accountId?: string } = {}): Promise<string[]> {
    const { limit = 50 } = options;
    const queryTokens = this.tokenize(query).split(' ').filter((t) => t.length > 1);

    if (queryTokens.length === 0) return [];

    return new Promise((resolve, reject) => {
      const store = this.getStore('searchIndex');
      const request = store.openCursor(null, 'prev');
      const results: Array<{ emailId: string; score: number; date: number }> = [];

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
        if (!cursor) {
          results.sort((a, b) => b.score - a.score || b.date - a.date);
          resolve(results.slice(0, limit).map((r) => r.emailId));
          return;
        }

        const entry = cursor.value as SearchIndex;
        let score = 0;

        for (const token of queryTokens) {
          if (entry.subject.includes(token)) score += 3;
          if (entry.from.includes(token)) score += 2;
          if (entry.to.includes(token)) score += 2;
          if (entry.tokens.includes(token)) score += 1;
        }

        if (score > 0) {
          results.push({ emailId: entry.emailId, score, date: entry.date });
        }

        cursor.continue();
      };
      request.onerror = () => reject(request.error);
    });
  }

  private tokenize(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9@.\s-]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 1)
      .join(' ');
  }

  // ─── Metadata ───────────────────────────────────────────────────────────

  async setMeta(key: string, value: unknown): Promise<void> {
    return new Promise((resolve, reject) => {
      const store = this.getStore('metadata', 'readwrite');
      const request = store.put({ key, value, updatedAt: Date.now() });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getMeta<T = unknown>(key: string): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
      const store = this.getStore('metadata');
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result?.value as T | undefined);
      request.onerror = () => reject(request.error);
    });
  }

  // ─── Maintenance ────────────────────────────────────────────────────────

  async getStorageEstimate(): Promise<{ usage: number; quota: number; percentage: number }> {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const estimate = await navigator.storage.estimate();
      const usage = estimate.usage ?? 0;
      const quota = estimate.quota ?? 0;
      return { usage, quota, percentage: quota > 0 ? (usage / quota) * 100 : 0 };
    }
    return { usage: 0, quota: 0, percentage: 0 };
  }

  async purgeOldEmails(accountId: string, olderThanDays: number): Promise<number> {
    const cutoff = Date.now() - olderThanDays * 86_400_000;
    let purged = 0;

    return new Promise((resolve, reject) => {
      if (!this.db) { reject(new Error('DB not opened')); return; }
      const tx = this.db.transaction(['emails', 'searchIndex'], 'readwrite');
      const emailStore = tx.objectStore('emails');
      const searchStore = tx.objectStore('searchIndex');
      const index = emailStore.index('account_received');

      const range = IDBKeyRange.bound([accountId, 0], [accountId, cutoff]);
      const request = index.openCursor(range);

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
        if (!cursor) {
          resolve(purged);
          return;
        }
        const email = cursor.value as CachedEmail;
        emailStore.delete(email.id);
        searchStore.delete(email.id);
        purged++;
        cursor.continue();
      };
      request.onerror = () => reject(request.error);
    });
  }

  async clearAllData(): Promise<void> {
    if (!this.db) return;
    const storeNames = Array.from(this.db.objectStoreNames);
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(storeNames, 'readwrite');
      for (const name of storeNames) {
        tx.objectStore(name).clear();
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  close(): void {
    this.db?.close();
    this.db = null;
  }
}

// ─── Sync Engine ──────────────────────────────────────────────────────────

export interface SyncConfig {
  /** Server API base URL */
  apiUrl: string;
  /** Auth token */
  authToken: string;
  /** Sync interval in ms (default: 30000) */
  syncIntervalMs?: number;
  /** Max items per sync batch */
  batchSize?: number;
}

export class SyncEngine {
  private readonly db: ViennaDB;
  private readonly config: SyncConfig;
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private isSyncing = false;
  private listeners: Array<(event: SyncEvent) => void> = [];

  constructor(db: ViennaDB, config: SyncConfig) {
    this.db = db;
    this.config = config;
  }

  /** Start background sync loop */
  start(): void {
    if (this.syncTimer) return;
    const interval = this.config.syncIntervalMs ?? 30_000;

    // Immediate first sync
    this.sync().catch(() => {});

    this.syncTimer = setInterval(() => {
      this.sync().catch(() => {});
    }, interval);

    // Sync when coming back online
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.sync());
    }
  }

  stop(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }

  onSync(listener: (event: SyncEvent) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private emit(event: SyncEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  async sync(): Promise<void> {
    if (this.isSyncing) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;

    this.isSyncing = true;
    this.emit({ type: 'sync_start' });

    try {
      // Phase 1: Push local changes to server
      await this.pushLocalChanges();

      // Phase 2: Pull new data from server
      await this.pullServerChanges();

      this.emit({ type: 'sync_complete' });
    } catch (error) {
      this.emit({
        type: 'sync_error',
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.isSyncing = false;
    }
  }

  private async pushLocalChanges(): Promise<void> {
    const batchSize = this.config.batchSize ?? 50;
    const pendingActions = await this.db.getPendingSyncActions(batchSize);

    if (pendingActions.length === 0) return;

    this.emit({ type: 'push_start', count: pendingActions.length });

    for (const action of pendingActions) {
      try {
        const response = await fetch(`${this.config.apiUrl}/sync/push`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.config.authToken}`,
          },
          body: JSON.stringify({
            operation: action.operation,
            objectType: action.objectType,
            objectId: action.objectId,
            payload: action.payload,
          }),
        });

        if (response.ok) {
          await this.db.removeSyncAction(action.id);
        } else if (response.status === 409) {
          // Conflict — server wins, fetch latest
          await this.db.removeSyncAction(action.id);
          this.emit({ type: 'conflict', objectId: action.objectId });
        } else if (action.retryCount >= 3) {
          // Max retries exceeded — drop the action
          await this.db.removeSyncAction(action.id);
          this.emit({ type: 'push_failed', objectId: action.objectId });
        }
      } catch {
        // Network error — will retry on next sync
        break;
      }
    }
  }

  private async pullServerChanges(): Promise<void> {
    const lastSyncToken = await this.db.getMeta<string>('syncToken');

    try {
      const response = await fetch(
        `${this.config.apiUrl}/sync/pull${lastSyncToken ? `?since=${lastSyncToken}` : ''}`,
        {
          headers: {
            Authorization: `Bearer ${this.config.authToken}`,
          },
        },
      );

      if (!response.ok) return;

      const data = (await response.json()) as {
        emails?: CachedEmail[];
        threads?: CachedThread[];
        mailboxes?: CachedMailbox[];
        contacts?: CachedContact[];
        deletedIds?: string[];
        syncToken: string;
      };

      // Apply changes
      if (data.emails && data.emails.length > 0) {
        await this.db.putEmails(data.emails);
        for (const email of data.emails) {
          await this.db.indexEmail(email);
        }
        this.emit({ type: 'new_emails', count: data.emails.length });
      }

      if (data.threads) {
        for (const thread of data.threads) {
          await this.db.putThread(thread);
        }
      }

      if (data.mailboxes) {
        for (const mailbox of data.mailboxes) {
          await this.db.putMailbox(mailbox);
        }
      }

      if (data.contacts) {
        for (const contact of data.contacts) {
          await this.db.putContact(contact);
        }
      }

      if (data.deletedIds) {
        for (const id of data.deletedIds) {
          await this.db.deleteEmail(id);
        }
      }

      await this.db.setMeta('syncToken', data.syncToken);
      await this.db.setMeta('lastSyncAt', Date.now());
    } catch {
      // Network error — silent fail, will retry
    }
  }
}

// ─── Sync Events ──────────────────────────────────────────────────────────

export type SyncEvent =
  | { type: 'sync_start' }
  | { type: 'sync_complete' }
  | { type: 'sync_error'; error: string }
  | { type: 'push_start'; count: number }
  | { type: 'push_failed'; objectId: string }
  | { type: 'conflict'; objectId: string }
  | { type: 'new_emails'; count: number };
