"use client";

/**
 * AlecRae Offline Store — IndexedDB-backed email cache
 *
 * Core of the offline-first architecture. All reads hit local cache first
 * (sub-50ms), background sync keeps data fresh from the server.
 *
 * Database: "alecrae_mail" (version 1)
 * Object stores:
 *   - emails    — cached email messages (key: id)
 *   - drafts    — locally saved drafts (key: id)
 *   - outbox    — emails queued for sending while offline (key: id)
 *   - sync_meta — sync cursor/timestamp tracking (key: storeName)
 *
 * Uses the native IndexedDB API directly — no Dexie or other wrapper libraries.
 */

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

// ─── Constants ──────────────────────────────────────────────────────────────

const DB_NAME = "alecrae_mail";
const DB_VERSION = 1;

const STORE_EMAILS = "emails" as const;
const STORE_DRAFTS = "drafts" as const;
const STORE_OUTBOX = "outbox" as const;
const STORE_SYNC_META = "sync_meta" as const;
const STORE_QUEUED_ACTIONS = "queued_actions" as const;

// ─── Types ──────────────────────────────────────────────────────────────────

export interface EmailContact {
  email: string;
  name?: string;
}

export interface CachedEmail {
  id: string;
  messageId: string;
  from: EmailContact;
  to: EmailContact[];
  cc?: EmailContact[];
  subject: string;
  preview: string;
  textBody?: string;
  htmlBody?: string;
  status: string;
  tags: string[];
  hasAttachments: boolean;
  starred: boolean;
  read: boolean;
  snoozedUntil?: string;
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
  /** Timestamp (ms since epoch) for cache invalidation */
  cachedAt: number;
}

export interface CachedDraft {
  id: string;
  to: EmailContact[];
  cc?: EmailContact[];
  bcc?: EmailContact[];
  subject: string;
  body: string;
  bodyFormat: "text" | "html";
  replyToId?: string;
  forwardOfId?: string;
  savedAt: number;
}

export interface OutboxEmail {
  id: string;
  to: EmailContact[];
  cc?: EmailContact[];
  bcc?: EmailContact[];
  subject: string;
  body: string;
  bodyFormat: "text" | "html";
  replyToId?: string;
  forwardOfId?: string;
  queuedAt: number;
  retryCount: number;
  lastError?: string;
}

export type QueuedActionType = "star" | "unstar" | "archive" | "delete" | "read" | "unread";

export interface QueuedAction {
  id: string;
  emailId: string;
  action: QueuedActionType;
  queuedAt: number;
}

interface SyncMeta {
  storeName: string;
  cursor: string;
  updatedAt: number;
}

export type EmailFilter = "all" | "unread" | "starred" | "sent";

export interface CacheStats {
  emailCount: number;
  draftCount: number;
  outboxCount: number;
  lastSyncAt: string | null;
}

// ─── Database Connection ────────────────────────────────────────────────────

let dbInstance: IDBDatabase | null = null;

/**
 * Opens (or upgrades) the alecrae_mail IndexedDB database.
 * Creates all four object stores and the required indexes on first run.
 * Subsequent calls return the cached database handle.
 */
export function openDB(): Promise<IDBDatabase> {
  if (dbInstance !== null) {
    return Promise.resolve(dbInstance);
  }

  return new Promise<IDBDatabase>((resolve, reject) => {
    const request: IDBOpenDBRequest = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event: IDBVersionChangeEvent): void => {
      const db: IDBDatabase = (event.target as IDBOpenDBRequest).result;

      // ── emails store ──────────────────────────────────────────────────
      if (!db.objectStoreNames.contains(STORE_EMAILS)) {
        const emailStore: IDBObjectStore = db.createObjectStore(STORE_EMAILS, {
          keyPath: "id",
        });
        emailStore.createIndex("by-status", "status", { unique: false });
        emailStore.createIndex("by-starred", "starred", { unique: false });
        emailStore.createIndex("by-read", "read", { unique: false });
        emailStore.createIndex("by-createdAt", "createdAt", { unique: false });
        emailStore.createIndex("by-from", "from.email", { unique: false });
      }

      // ── drafts store ──────────────────────────────────────────────────
      if (!db.objectStoreNames.contains(STORE_DRAFTS)) {
        db.createObjectStore(STORE_DRAFTS, { keyPath: "id" });
      }

      // ── outbox store ──────────────────────────────────────────────────
      if (!db.objectStoreNames.contains(STORE_OUTBOX)) {
        db.createObjectStore(STORE_OUTBOX, { keyPath: "id" });
      }

      // ── sync_meta store ───────────────────────────────────────────────
      if (!db.objectStoreNames.contains(STORE_SYNC_META)) {
        db.createObjectStore(STORE_SYNC_META, { keyPath: "storeName" });
      }

      // ── queued_actions store (offline action queue for sync) ────────
      if (!db.objectStoreNames.contains(STORE_QUEUED_ACTIONS)) {
        db.createObjectStore(STORE_QUEUED_ACTIONS, { keyPath: "id" });
      }
    };

    request.onsuccess = (): void => {
      dbInstance = request.result;

      // Reset the cached handle if the database is closed externally
      dbInstance.onclose = (): void => {
        dbInstance = null;
      };

      resolve(dbInstance);
    };

    request.onerror = (): void => {
      reject(
        new Error(
          `Failed to open IndexedDB "${DB_NAME}": ${String(request.error?.message ?? "unknown error")}`,
        ),
      );
    };
  });
}

// ─── Internal Helpers ───────────────────────────────────────────────────────

/** Promisify an IDBTransaction's completion. */
function txComplete(tx: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = (): void => resolve();
    tx.onerror = (): void => reject(tx.error);
  });
}

/** Promisify a single IDBRequest. */
function reqResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = (): void => resolve(request.result);
    request.onerror = (): void => reject(request.error);
  });
}

// ─── Emails ─────────────────────────────────────────────────────────────────

/**
 * Bulk upsert emails into the cache.
 * Stamps `cachedAt` with the current time if not already set to a positive value.
 */
export async function cacheEmails(emails: CachedEmail[]): Promise<void> {
  if (emails.length === 0) return;

  const db: IDBDatabase = await openDB();
  const tx: IDBTransaction = db.transaction(STORE_EMAILS, "readwrite");
  const store: IDBObjectStore = tx.objectStore(STORE_EMAILS);
  const now: number = Date.now();

  for (const email of emails) {
    const record: CachedEmail = {
      ...email,
      cachedAt: email.cachedAt > 0 ? email.cachedAt : now,
    };
    store.put(record);
  }

  await txComplete(tx);
}

/**
 * Read cached emails with optional filtering and limit.
 * Results are sorted by `createdAt` descending (newest first).
 */
export async function getCachedEmails(options?: {
  limit?: number;
  filter?: EmailFilter;
}): Promise<CachedEmail[]> {
  const db: IDBDatabase = await openDB();
  const tx: IDBTransaction = db.transaction(STORE_EMAILS, "readonly");
  const store: IDBObjectStore = tx.objectStore(STORE_EMAILS);

  const filter: EmailFilter = options?.filter ?? "all";
  const limit: number | undefined = options?.limit;

  let results: CachedEmail[];

  const allEmails: CachedEmail[] = await reqResult<CachedEmail[]>(store.getAll());

  if (filter === "unread") {
    results = allEmails.filter((e: CachedEmail): boolean => !e.read);
  } else if (filter === "starred") {
    results = allEmails.filter((e: CachedEmail): boolean => e.starred);
  } else if (filter === "sent") {
    results = allEmails.filter((e: CachedEmail): boolean => e.status === "sent");
  } else {
    results = allEmails;
  }

  // Sort newest first by ISO date string (lexicographic comparison works for ISO 8601)
  results.sort((a: CachedEmail, b: CachedEmail): number => {
    if (a.createdAt > b.createdAt) return -1;
    if (a.createdAt < b.createdAt) return 1;
    return 0;
  });

  if (limit !== undefined && limit > 0) {
    return results.slice(0, limit);
  }

  return results;
}

/**
 * Retrieve a single cached email by its ID.
 * Returns `undefined` if not found.
 */
export async function getCachedEmail(id: string): Promise<CachedEmail | undefined> {
  const db: IDBDatabase = await openDB();
  const tx: IDBTransaction = db.transaction(STORE_EMAILS, "readonly");
  const store: IDBObjectStore = tx.objectStore(STORE_EMAILS);
  const result: CachedEmail | undefined = await reqResult<CachedEmail | undefined>(
    store.get(id),
  );
  return result;
}

/**
 * Partially update a cached email. Merges `updates` into the existing record.
 * The `id` field is immutable and cannot be changed via updates.
 * No-op if the email does not exist in cache.
 */
export async function updateCachedEmail(
  id: string,
  updates: Partial<CachedEmail>,
): Promise<void> {
  const db: IDBDatabase = await openDB();
  const tx: IDBTransaction = db.transaction(STORE_EMAILS, "readwrite");
  const store: IDBObjectStore = tx.objectStore(STORE_EMAILS);

  const existing: CachedEmail | undefined = await reqResult<CachedEmail | undefined>(
    store.get(id),
  );
  if (existing === undefined) return;

  const merged: CachedEmail = {
    ...existing,
    ...updates,
    id: existing.id, // id is immutable
    cachedAt: Date.now(),
  };

  store.put(merged);
  await txComplete(tx);
}

/**
 * Remove a single email from the cache by ID.
 */
export async function deleteCachedEmail(id: string): Promise<void> {
  const db: IDBDatabase = await openDB();
  const tx: IDBTransaction = db.transaction(STORE_EMAILS, "readwrite");
  tx.objectStore(STORE_EMAILS).delete(id);
  await txComplete(tx);
}

// ─── Drafts ─────────────────────────────────────────────────────────────────

/**
 * Save (or overwrite) a draft locally.
 */
export async function saveDraft(draft: CachedDraft): Promise<void> {
  const db: IDBDatabase = await openDB();
  const tx: IDBTransaction = db.transaction(STORE_DRAFTS, "readwrite");
  tx.objectStore(STORE_DRAFTS).put(draft);
  await txComplete(tx);
}

/**
 * List all locally saved drafts, newest first (by `savedAt`).
 */
export async function getDrafts(): Promise<CachedDraft[]> {
  const db: IDBDatabase = await openDB();
  const tx: IDBTransaction = db.transaction(STORE_DRAFTS, "readonly");
  const results: CachedDraft[] = await reqResult<CachedDraft[]>(
    tx.objectStore(STORE_DRAFTS).getAll(),
  );
  results.sort((a: CachedDraft, b: CachedDraft): number => b.savedAt - a.savedAt);
  return results;
}

/**
 * Delete a draft by ID.
 */
export async function deleteDraft(id: string): Promise<void> {
  const db: IDBDatabase = await openDB();
  const tx: IDBTransaction = db.transaction(STORE_DRAFTS, "readwrite");
  tx.objectStore(STORE_DRAFTS).delete(id);
  await txComplete(tx);
}

// ─── Outbox ─────────────────────────────────────────────────────────────────

/**
 * Queue an email for sending when the client comes back online.
 */
export async function queueOutboxEmail(email: OutboxEmail): Promise<void> {
  const db: IDBDatabase = await openDB();
  const tx: IDBTransaction = db.transaction(STORE_OUTBOX, "readwrite");
  tx.objectStore(STORE_OUTBOX).put(email);
  await txComplete(tx);
}

/**
 * Get all emails waiting in the outbox, oldest first (by `queuedAt`).
 */
export async function getOutboxEmails(): Promise<OutboxEmail[]> {
  const db: IDBDatabase = await openDB();
  const tx: IDBTransaction = db.transaction(STORE_OUTBOX, "readonly");
  const results: OutboxEmail[] = await reqResult<OutboxEmail[]>(
    tx.objectStore(STORE_OUTBOX).getAll(),
  );
  results.sort((a: OutboxEmail, b: OutboxEmail): number => a.queuedAt - b.queuedAt);
  return results;
}

/**
 * Remove an outbox email after it has been successfully sent.
 */
export async function removeOutboxEmail(id: string): Promise<void> {
  const db: IDBDatabase = await openDB();
  const tx: IDBTransaction = db.transaction(STORE_OUTBOX, "readwrite");
  tx.objectStore(STORE_OUTBOX).delete(id);
  await txComplete(tx);
}

// ─── Sync Meta ──────────────────────────────────────────────────────────────

/**
 * Get the last sync cursor for a given store name.
 * Returns `undefined` if the store has never been synced.
 */
export async function getSyncCursor(storeName: string): Promise<string | undefined> {
  const db: IDBDatabase = await openDB();
  const tx: IDBTransaction = db.transaction(STORE_SYNC_META, "readonly");
  const result: SyncMeta | undefined = await reqResult<SyncMeta | undefined>(
    tx.objectStore(STORE_SYNC_META).get(storeName),
  );
  return result?.cursor;
}

/**
 * Update the sync cursor for a given store name.
 */
export async function setSyncCursor(storeName: string, cursor: string): Promise<void> {
  const db: IDBDatabase = await openDB();
  const tx: IDBTransaction = db.transaction(STORE_SYNC_META, "readwrite");
  const meta: SyncMeta = {
    storeName,
    cursor,
    updatedAt: Date.now(),
  };
  tx.objectStore(STORE_SYNC_META).put(meta);
  await txComplete(tx);
}

// ─── Queued Actions (Offline Conflict Resolution) ───────────────────────────

/**
 * Queue an offline action (star, archive, delete, etc.) for later sync.
 * Deduplicates by emailId + action type — the latest action wins.
 */
export async function queueAction(action: QueuedAction): Promise<void> {
  const db: IDBDatabase = await openDB();
  const tx: IDBTransaction = db.transaction(STORE_QUEUED_ACTIONS, "readwrite");
  const store: IDBObjectStore = tx.objectStore(STORE_QUEUED_ACTIONS);

  // Remove any existing action for the same email + action type
  const existing: QueuedAction[] = await reqResult<QueuedAction[]>(store.getAll());
  for (const item of existing) {
    if (item.emailId === action.emailId && item.action === action.action) {
      store.delete(item.id);
    }
  }

  store.put(action);
  await txComplete(tx);
}

/**
 * Get all queued offline actions, oldest first.
 */
export async function getQueuedActions(): Promise<QueuedAction[]> {
  const db: IDBDatabase = await openDB();
  const tx: IDBTransaction = db.transaction(STORE_QUEUED_ACTIONS, "readonly");
  const results: QueuedAction[] = await reqResult<QueuedAction[]>(
    tx.objectStore(STORE_QUEUED_ACTIONS).getAll(),
  );
  results.sort((a: QueuedAction, b: QueuedAction): number => a.queuedAt - b.queuedAt);
  return results;
}

/**
 * Remove a specific queued action after it has been applied to the server.
 */
export async function removeQueuedAction(id: string): Promise<void> {
  const db: IDBDatabase = await openDB();
  const tx: IDBTransaction = db.transaction(STORE_QUEUED_ACTIONS, "readwrite");
  tx.objectStore(STORE_QUEUED_ACTIONS).delete(id);
  await txComplete(tx);
}

/**
 * Clear all queued actions (e.g. after a full sync).
 */
export async function clearQueuedActions(): Promise<void> {
  const db: IDBDatabase = await openDB();
  const tx: IDBTransaction = db.transaction(STORE_QUEUED_ACTIONS, "readwrite");
  tx.objectStore(STORE_QUEUED_ACTIONS).clear();
  await txComplete(tx);
}

// ─── Utilities ──────────────────────────────────────────────────────────────

/**
 * Wipe all data from every object store.
 * Intended for logout or account reset.
 */
export async function clearAllData(): Promise<void> {
  const db: IDBDatabase = await openDB();
  const storeNames: string[] = [
    STORE_EMAILS,
    STORE_DRAFTS,
    STORE_OUTBOX,
    STORE_SYNC_META,
    STORE_QUEUED_ACTIONS,
  ];
  const tx: IDBTransaction = db.transaction(storeNames, "readwrite");

  for (const name of storeNames) {
    tx.objectStore(name).clear();
  }

  await txComplete(tx);
}

/**
 * Return aggregate statistics about the local cache.
 */
export async function getCacheStats(): Promise<CacheStats> {
  const db: IDBDatabase = await openDB();

  const storeNames: string[] = [
    STORE_EMAILS,
    STORE_DRAFTS,
    STORE_OUTBOX,
    STORE_SYNC_META,
  ];
  const tx: IDBTransaction = db.transaction(storeNames, "readonly");

  const emailCountReq: IDBRequest<number> = tx.objectStore(STORE_EMAILS).count();
  const draftCountReq: IDBRequest<number> = tx.objectStore(STORE_DRAFTS).count();
  const outboxCountReq: IDBRequest<number> = tx.objectStore(STORE_OUTBOX).count();
  const syncMetaReq: IDBRequest<SyncMeta[]> = tx.objectStore(STORE_SYNC_META).getAll();

  const [emailCount, draftCount, outboxCount, syncRecords] = await Promise.all([
    reqResult(emailCountReq),
    reqResult(draftCountReq),
    reqResult(outboxCountReq),
    reqResult(syncMetaReq),
  ]);

  let lastSyncAt: string | null = null;

  if (syncRecords.length > 0) {
    let mostRecentTimestamp = 0;
    for (const record of syncRecords) {
      if (record.updatedAt > mostRecentTimestamp) {
        mostRecentTimestamp = record.updatedAt;
      }
    }
    lastSyncAt = new Date(mostRecentTimestamp).toISOString();
  }

  return { emailCount, draftCount, outboxCount, lastSyncAt };
}

// ─── React Hook ─────────────────────────────────────────────────────────────

function subscribeOnline(callback: () => void): () => void {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return (): void => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

function getOnlineSnapshot(): boolean {
  return navigator.onLine;
}

function getServerSnapshot(): boolean {
  // During SSR, assume online
  return true;
}

interface OfflineStoreState {
  isOnline: boolean;
  cachedCount: number;
  outboxCount: number;
  lastSyncAt: string | null;
}

/**
 * React hook that tracks online/offline status and cache statistics.
 * Refreshes stats on mount, when online status changes, and via the
 * returned `refresh` callback.
 */
export function useOfflineStore(): OfflineStoreState & { refresh: () => void } {
  const isOnline: boolean = useSyncExternalStore(
    subscribeOnline,
    getOnlineSnapshot,
    getServerSnapshot,
  );

  const [stats, setStats] = useState<{
    cachedCount: number;
    outboxCount: number;
    lastSyncAt: string | null;
  }>({
    cachedCount: 0,
    outboxCount: 0,
    lastSyncAt: null,
  });

  const refresh = useCallback((): void => {
    getCacheStats()
      .then((result: CacheStats): void => {
        setStats({
          cachedCount: result.emailCount,
          outboxCount: result.outboxCount,
          lastSyncAt: result.lastSyncAt,
        });
      })
      .catch((): void => {
        // IndexedDB unavailable (e.g. incognito in some browsers) — keep defaults
      });
  }, []);

  useEffect((): void => {
    refresh();
  }, [isOnline, refresh]);

  return {
    isOnline,
    cachedCount: stats.cachedCount,
    outboxCount: stats.outboxCount,
    lastSyncAt: stats.lastSyncAt,
    refresh,
  };
}
