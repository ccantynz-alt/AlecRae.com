"use client";

/**
 * AlecRae Background Sync Engine
 *
 * Coordinates between the IndexedDB local cache and the remote API.
 * Handles periodic polling, outbox flushing, offline action queuing,
 * network awareness, and conflict resolution (last-write-wins).
 *
 * Architecture:
 *   - Polls the server every 30s (configurable) for new emails
 *   - Flushes queued outbox emails when online
 *   - Applies queued offline actions (star, archive, delete) to the server
 *   - Pauses automatically when offline, resumes when back online
 *   - Emits typed events for UI reactivity
 *   - Singleton pattern via getSyncEngine()
 */

import {
  cacheEmails,
  getOutboxEmails,
  removeOutboxEmail,
  getSyncCursor,
  setSyncCursor,
  getQueuedActions,
  removeQueuedAction,
  type CachedEmail,
} from "./offline-store";

import { messagesApi, type Message } from "./api";
import { useState, useEffect, useCallback, useRef } from "react";

// ─── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_SYNC_INTERVAL_MS = 30_000;
const SYNC_PAGE_LIMIT = 50;

// ─── Event Types ────────────────────────────────────────────────────────────

export type SyncEventType =
  | "sync:start"
  | "sync:complete"
  | "sync:error"
  | "sync:new-emails"
  | "outbox:sent"
  | "outbox:failed";

export interface SyncStartEvent {
  type: "sync:start";
  timestamp: number;
}

export interface SyncCompleteEvent {
  type: "sync:complete";
  timestamp: number;
  newEmailCount: number;
  syncedActions: number;
}

export interface SyncErrorEvent {
  type: "sync:error";
  timestamp: number;
  error: string;
}

export interface SyncNewEmailsEvent {
  type: "sync:new-emails";
  timestamp: number;
  emails: CachedEmail[];
}

export interface OutboxSentEvent {
  type: "outbox:sent";
  timestamp: number;
  emailId: string;
}

export interface OutboxFailedEvent {
  type: "outbox:failed";
  timestamp: number;
  emailId: string;
  error: string;
}

export type SyncEvent =
  | SyncStartEvent
  | SyncCompleteEvent
  | SyncErrorEvent
  | SyncNewEmailsEvent
  | OutboxSentEvent
  | OutboxFailedEvent;

type SyncEventCallback = (event: SyncEvent) => void;

// ─── Message → CachedEmail Mapper ───────────────────────────────────────────

function mapContact(addr: { email: string; name?: string }): { email: string; name?: string } {
  const contact: { email: string; name?: string } = { email: addr.email };
  if (addr.name !== undefined) {
    contact.name = addr.name;
  }
  return contact;
}

function mapMessageToCachedEmail(message: Message): CachedEmail {
  const tags: string[] = message.tags ?? [];
  return {
    id: message.id,
    messageId: message.messageId,
    from: mapContact(message.from),
    to: message.to.map(mapContact),
    cc: (message.cc ?? []).map(mapContact),
    subject: message.subject,
    preview: message.preview,
    status: message.status,
    tags,
    hasAttachments: message.hasAttachments,
    starred: tags.includes("starred"),
    read: !tags.includes("unread"),
    createdAt: message.createdAt,
    updatedAt: message.updatedAt,
    sentAt: message.sentAt,
    cachedAt: Date.now(),
  };
}

// ─── SyncEngine Class ───────────────────────────────────────────────────────

export class SyncEngine {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private intervalMs: number = DEFAULT_SYNC_INTERVAL_MS;
  private syncing: boolean = false;
  private online: boolean = true;
  private lastSyncAt: Date | null = null;
  private lastError: string | null = null;
  private listeners: Map<SyncEventType, Set<SyncEventCallback>> = new Map();
  private boundOnline: (() => void) | null = null;
  private boundOffline: (() => void) | null = null;

  constructor() {
    if (typeof window !== "undefined") {
      this.online = navigator.onLine;
      this.boundOnline = this.handleOnline.bind(this);
      this.boundOffline = this.handleOffline.bind(this);
      window.addEventListener("online", this.boundOnline);
      window.addEventListener("offline", this.boundOffline);
    }
  }

  // ─── Event System ───────────────────────────────────────────────────────

  /** Subscribe to a sync event. Returns an unsubscribe function. */
  on(eventType: SyncEventType, callback: SyncEventCallback): () => void {
    let callbacks = this.listeners.get(eventType);
    if (!callbacks) {
      callbacks = new Set();
      this.listeners.set(eventType, callbacks);
    }
    callbacks.add(callback);
    return (): void => {
      callbacks?.delete(callback);
    };
  }

  /** Remove a specific listener. */
  off(eventType: SyncEventType, callback: SyncEventCallback): void {
    const callbacks = this.listeners.get(eventType);
    if (callbacks) {
      callbacks.delete(callback);
    }
  }

  private emit(event: SyncEvent): void {
    const callbacks = this.listeners.get(event.type);
    if (callbacks) {
      for (const cb of callbacks) {
        try {
          cb(event);
        } catch {
          // Swallow listener errors — never let a listener crash the engine
        }
      }
    }
  }

  // ─── Network Awareness ──────────────────────────────────────────────────

  private handleOnline(): void {
    this.online = true;
    // Resume sync and flush outbox immediately when coming back online
    if (this.intervalId !== null) {
      // Periodic sync was active before going offline — trigger immediate sync
      void this.syncNow();
    }
  }

  private handleOffline(): void {
    this.online = false;
    // Sync will naturally skip on next tick since we check this.online
  }

  /** Returns current network status. */
  getOnlineStatus(): boolean {
    return this.online;
  }

  // ─── Periodic Sync ─────────────────────────────────────────────────────

  /** Start periodic background sync. Default interval: 30 seconds. */
  startPeriodicSync(intervalMs?: number): void {
    if (this.intervalId !== null) {
      // Already running — stop and restart with new interval
      this.stopPeriodicSync();
    }

    this.intervalMs = intervalMs ?? DEFAULT_SYNC_INTERVAL_MS;

    // Run an immediate sync, then set up the interval
    void this.syncNow();

    this.intervalId = setInterval(() => {
      void this.syncNow();
    }, this.intervalMs);
  }

  /** Stop periodic background sync. */
  stopPeriodicSync(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /** Returns true if periodic sync is currently active. */
  isRunning(): boolean {
    return this.intervalId !== null;
  }

  // ─── Core Sync ──────────────────────────────────────────────────────────

  /** Perform an immediate full sync: fetch new emails, apply queued actions, flush outbox. */
  async syncNow(): Promise<void> {
    // Skip if offline or already syncing
    if (!this.online) return;
    if (this.syncing) return;

    this.syncing = true;
    this.lastError = null;

    this.emit({
      type: "sync:start",
      timestamp: Date.now(),
    });

    let newEmailCount = 0;
    let syncedActions = 0;

    try {
      // 1. Apply queued offline actions to the server
      syncedActions = await this.applyQueuedActions();

      // 2. Fetch new emails since last cursor
      const cursor = await getSyncCursor("emails");
      let hasMore = true;
      let currentCursor: string | null | undefined = cursor;
      const allNewEmails: CachedEmail[] = [];

      while (hasMore) {
        const listParams: Parameters<typeof messagesApi.list>[0] = {
          limit: SYNC_PAGE_LIMIT,
        };
        if (currentCursor != null) listParams.cursor = currentCursor;
        const response = await messagesApi.list(listParams);

        const emails = response.data;
        if (emails.length > 0) {
          const cached = emails.map(mapMessageToCachedEmail);
          await cacheEmails(cached);
          allNewEmails.push(...cached);
        }

        hasMore = response.hasMore;
        currentCursor = response.cursor;

        // Update the cursor to the latest position
        if (response.cursor) {
          await setSyncCursor("emails", response.cursor);
        }
      }

      newEmailCount = allNewEmails.length;

      // Emit new-emails event if we got any
      if (allNewEmails.length > 0) {
        this.emit({
          type: "sync:new-emails",
          timestamp: Date.now(),
          emails: allNewEmails,
        });
      }

      // 3. Flush the outbox
      await this.flushOutbox();

      // 4. Record successful sync
      this.lastSyncAt = new Date();

      this.emit({
        type: "sync:complete",
        timestamp: Date.now(),
        newEmailCount,
        syncedActions,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown sync error";
      this.lastError = message;

      this.emit({
        type: "sync:error",
        timestamp: Date.now(),
        error: message,
      });
    } finally {
      this.syncing = false;
    }
  }

  /** Sync a single email from the server to the local cache. */
  async syncEmail(id: string): Promise<void> {
    if (!this.online) return;

    try {
      const response = await messagesApi.get(id);
      const message = response.data;

      // MessageDetail extends Message, so we can map it the same way
      const cached = mapMessageToCachedEmail(message);

      // Preserve body content from the detail response
      if (message.textBody !== null) cached.textBody = message.textBody;
      if (message.htmlBody !== null) cached.htmlBody = message.htmlBody;

      await cacheEmails([cached]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to sync email";
      this.emit({
        type: "sync:error",
        timestamp: Date.now(),
        error: `syncEmail(${id}): ${message}`,
      });
    }
  }

  // ─── Outbox ─────────────────────────────────────────────────────────────

  /** Send all queued outbox emails. Remove from outbox on success. */
  async flushOutbox(): Promise<void> {
    if (!this.online) return;

    const outboxEmails = await getOutboxEmails();
    if (outboxEmails.length === 0) return;

    for (const email of outboxEmails) {
      try {
        const sendPayload: Parameters<typeof messagesApi.send>[0] = {
          from: email.to[0] ?? { email: "" },
          to: email.to,
          subject: email.subject,
        };
        if (email.cc !== undefined) sendPayload.cc = email.cc;
        if (email.bcc !== undefined) sendPayload.bcc = email.bcc;
        if (email.bodyFormat === "text") sendPayload.text = email.body;
        if (email.bodyFormat === "html") sendPayload.html = email.body;
        await messagesApi.send(sendPayload);
        await removeOutboxEmail(email.id);

        this.emit({
          type: "outbox:sent",
          timestamp: Date.now(),
          emailId: email.id,
        });
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : "Failed to send";

        this.emit({
          type: "outbox:failed",
          timestamp: Date.now(),
          emailId: email.id,
          error: errorMessage,
        });
      }
    }
  }

  // ─── Queued Action Application ──────────────────────────────────────────

  /** Apply all queued offline actions (star, archive, delete, etc.) to the server. */
  private async applyQueuedActions(): Promise<number> {
    const actions = await getQueuedActions();
    if (actions.length === 0) return 0;

    let applied = 0;

    for (const action of actions) {
      try {
        switch (action.action) {
          case "star":
            await messagesApi.star(action.emailId, true);
            break;
          case "unstar":
            await messagesApi.star(action.emailId, false);
            break;
          case "archive":
            await messagesApi.archive(action.emailId);
            break;
          case "delete":
            await messagesApi.delete(action.emailId);
            break;
          case "read":
          case "unread":
            // These map to a PATCH on the message — currently no dedicated API method,
            // so we skip server sync for read status. The local cache is authoritative.
            break;
        }

        await removeQueuedAction(action.id);
        applied++;
      } catch {
        // If applying fails, leave the action in the queue for next sync attempt
      }
    }

    return applied;
  }

  // ─── State Accessors ────────────────────────────────────────────────────

  /** Whether a sync operation is currently in progress. */
  getIsSyncing(): boolean {
    return this.syncing;
  }

  /** The timestamp of the last successful sync, or null if never synced. */
  getLastSyncAt(): Date | null {
    return this.lastSyncAt;
  }

  /** The last error message, or null if no error. */
  getLastError(): string | null {
    return this.lastError;
  }

  /** Get the count of emails waiting in the outbox. */
  async getPendingOutboxCount(): Promise<number> {
    const emails = await getOutboxEmails();
    return emails.length;
  }

  // ─── Cleanup ────────────────────────────────────────────────────────────

  /** Tear down the engine: stop sync, remove event listeners. */
  destroy(): void {
    this.stopPeriodicSync();

    if (typeof window !== "undefined") {
      if (this.boundOnline) {
        window.removeEventListener("online", this.boundOnline);
      }
      if (this.boundOffline) {
        window.removeEventListener("offline", this.boundOffline);
      }
    }

    this.listeners.clear();
    this.boundOnline = null;
    this.boundOffline = null;
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────────

let singletonInstance: SyncEngine | null = null;

/** Get the singleton SyncEngine instance. Creates one if it does not exist. */
export function getSyncEngine(): SyncEngine {
  if (singletonInstance === null) {
    singletonInstance = new SyncEngine();
  }
  return singletonInstance;
}

// ─── React Hook ─────────────────────────────────────────────────────────────

export interface UseSyncEngineReturn {
  isSyncing: boolean;
  isOnline: boolean;
  lastSyncAt: Date | null;
  pendingOutbox: number;
  syncNow: () => Promise<void>;
  error: string | null;
}

/** React hook that provides reactive sync engine state for UI components. */
export function useSyncEngine(): UseSyncEngineReturn {
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const [pendingOutbox, setPendingOutbox] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  const engineRef = useRef<SyncEngine | null>(null);

  useEffect(() => {
    const engine = getSyncEngine();
    engineRef.current = engine;

    // Initialize state from engine
    setIsSyncing(engine.getIsSyncing());
    setIsOnline(engine.getOnlineStatus());
    setLastSyncAt(engine.getLastSyncAt());
    setError(engine.getLastError());

    // Fetch initial outbox count
    void engine.getPendingOutboxCount().then(setPendingOutbox);

    // Subscribe to events
    const unsubStart = engine.on("sync:start", () => {
      setIsSyncing(true);
      setError(null);
    });

    const unsubComplete = engine.on("sync:complete", (event) => {
      setIsSyncing(false);
      if (event.type === "sync:complete") {
        setLastSyncAt(new Date(event.timestamp));
      }
      void engine.getPendingOutboxCount().then(setPendingOutbox);
    });

    const unsubError = engine.on("sync:error", (event) => {
      setIsSyncing(false);
      if (event.type === "sync:error") {
        setError(event.error);
      }
    });

    const unsubOutboxSent = engine.on("outbox:sent", () => {
      void engine.getPendingOutboxCount().then(setPendingOutbox);
    });

    const unsubOutboxFailed = engine.on("outbox:failed", (event) => {
      if (event.type === "outbox:failed") {
        setError(event.error);
      }
      void engine.getPendingOutboxCount().then(setPendingOutbox);
    });

    // Online/offline tracking
    const handleOnline = (): void => setIsOnline(true);
    const handleOffline = (): void => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      unsubStart();
      unsubComplete();
      unsubError();
      unsubOutboxSent();
      unsubOutboxFailed();
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const syncNow = useCallback(async (): Promise<void> => {
    if (engineRef.current) {
      await engineRef.current.syncNow();
    }
  }, []);

  return {
    isSyncing,
    isOnline,
    lastSyncAt,
    pendingOutbox,
    syncNow,
    error,
  };
}
