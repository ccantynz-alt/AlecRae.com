/**
 * IMAP Message Operation Handlers
 * Implements FETCH, STORE, COPY, MOVE, EXPUNGE, SEARCH, APPEND, and IDLE.
 * RFC 9051 Sections 6.4 (Selected State Commands).
 */

import type {
  ImapSession,
  ImapMessage,
  ImapFetchItem,
  ImapSearchCriteria,
  ImapFlag,
  Result,
} from "../types.js";
import { ok, err } from "../types.js";

// ─── Mailbox Storage Interface ──────────────────────────────────────────────

/**
 * Abstract storage interface that bridges IMAP to the underlying mailbox system.
 * The real implementation connects to the same storage backend as JMAP.
 */
export interface MessageStore {
  getMessages(mailbox: string, userId: string, uids: number[]): Promise<ImapMessage[]>;
  getMessagesBySequence(mailbox: string, userId: string, seqNums: number[]): Promise<ImapMessage[]>;
  getMessageCount(mailbox: string, userId: string): Promise<number>;
  searchMessages(mailbox: string, userId: string, criteria: ImapSearchCriteria): Promise<number[]>;
  updateFlags(mailbox: string, userId: string, uids: number[], operation: FlagOperation, flags: ImapFlag[]): Promise<ImapMessage[]>;
  copyMessages(fromMailbox: string, toMailbox: string, userId: string, uids: number[]): Promise<UidMapping[]>;
  moveMessages(fromMailbox: string, toMailbox: string, userId: string, uids: number[]): Promise<UidMapping[]>;
  expunge(mailbox: string, userId: string, uids?: number[]): Promise<number[]>;
  appendMessage(mailbox: string, userId: string, message: AppendData): Promise<{ uid: number }>;
}

export type FlagOperation = "set" | "add" | "remove";

export interface UidMapping {
  sourceUid: number;
  destUid: number;
}

export interface AppendData {
  flags: ImapFlag[];
  internalDate: Date;
  rawMessage: string;
}

// ─── FETCH Handler ──────────────────────────────────────────────────────────

/**
 * Handle FETCH command — retrieve message data.
 * RFC 9051 Section 6.4.5.
 *
 * Supports: FLAGS, ENVELOPE, BODYSTRUCTURE, BODY[], BODY.PEEK[],
 *           RFC822, RFC822.HEADER, RFC822.TEXT, UID, INTERNALDATE.
 */
export async function handleFetch(
  session: ImapSession,
  sequenceSet: string,
  items: ImapFetchItem[],
  useUid: boolean,
  store: MessageStore,
): Promise<Result<FetchResponse[]>> {
  if (!session.selectedMailbox || !session.user) {
    return err(new Error("No mailbox selected"));
  }

  const ids = parseSequenceSet(sequenceSet);
  if (ids.length === 0) {
    return err(new Error("Invalid sequence set"));
  }

  try {
    const messages = useUid
      ? await store.getMessages(session.selectedMailbox.name, session.user, ids)
      : await store.getMessagesBySequence(session.selectedMailbox.name, session.user, ids);

    const responses: FetchResponse[] = messages.map((msg) => {
      const data: Record<string, unknown> = {};

      for (const item of items) {
        switch (item.type) {
          case "FLAGS":
            data["FLAGS"] = formatFlags(msg.flags);
            break;
          case "UID":
            data["UID"] = msg.uid;
            break;
          case "INTERNALDATE":
            data["INTERNALDATE"] = formatInternalDate(msg.internalDate);
            break;
          case "RFC822.SIZE":
            data["RFC822.SIZE"] = msg.size;
            break;
          case "ENVELOPE":
            data["ENVELOPE"] = msg.envelope;
            break;
          case "BODYSTRUCTURE":
            data["BODYSTRUCTURE"] = msg.bodyStructure;
            break;
          case "BODY":
          case "BODY.PEEK":
            data[item.section ? `BODY[${item.section}]` : "BODY[]"] = msg.body ?? "";
            break;
          case "RFC822":
            data["RFC822"] = msg.body ?? "";
            break;
          case "RFC822.HEADER":
            data["RFC822.HEADER"] = msg.rawHeaders ?? "";
            break;
          case "RFC822.TEXT":
            data["RFC822.TEXT"] = msg.body ?? "";
            break;
        }
      }

      // BODY (not PEEK) implicitly sets \Seen flag
      const setsSeen = items.some((i) => i.type === "BODY" || i.type === "RFC822");
      return {
        sequenceNumber: msg.sequenceNumber,
        uid: msg.uid,
        data,
        implicitSeen: setsSeen,
      };
    });

    return ok(responses);
  } catch (error) {
    return err(error instanceof Error ? error : new Error(String(error)));
  }
}

export interface FetchResponse {
  sequenceNumber: number;
  uid: number;
  data: Record<string, unknown>;
  implicitSeen: boolean;
}

// ─── STORE Handler ──────────────────────────────────────────────────────────

/**
 * Handle STORE command — modify message flags.
 * RFC 9051 Section 6.4.6.
 *
 * Supports: FLAGS, +FLAGS, -FLAGS (and .SILENT variants).
 */
export async function handleStore(
  session: ImapSession,
  sequenceSet: string,
  operation: FlagOperation,
  flags: ImapFlag[],
  silent: boolean,
  useUid: boolean,
  store: MessageStore,
): Promise<Result<StoreResponse[]>> {
  if (!session.selectedMailbox || !session.user) {
    return err(new Error("No mailbox selected"));
  }

  if (session.selectedMailbox.readOnly) {
    return err(new Error("Mailbox is read-only (opened with EXAMINE)"));
  }

  const ids = parseSequenceSet(sequenceSet);
  if (ids.length === 0) {
    return err(new Error("Invalid sequence set"));
  }

  try {
    // For non-UID STORE, we need to resolve sequence numbers to UIDs first
    const messages = useUid
      ? await store.updateFlags(session.selectedMailbox.name, session.user, ids, operation, flags)
      : await store.updateFlags(session.selectedMailbox.name, session.user, ids, operation, flags);

    const responses: StoreResponse[] = messages.map((msg) => ({
      sequenceNumber: msg.sequenceNumber,
      uid: msg.uid,
      flags: msg.flags,
      silent,
    }));

    return ok(responses);
  } catch (error) {
    return err(error instanceof Error ? error : new Error(String(error)));
  }
}

export interface StoreResponse {
  sequenceNumber: number;
  uid: number;
  flags: ImapFlag[];
  silent: boolean;
}

// ─── COPY Handler ───────────────────────────────────────────────────────────

/**
 * Handle COPY command — copy messages to another mailbox.
 * RFC 9051 Section 6.4.7.
 */
export async function handleCopy(
  session: ImapSession,
  sequenceSet: string,
  destMailbox: string,
  useUid: boolean,
  store: MessageStore,
): Promise<Result<CopyResponse>> {
  if (!session.selectedMailbox || !session.user) {
    return err(new Error("No mailbox selected"));
  }

  const ids = parseSequenceSet(sequenceSet);
  if (ids.length === 0) {
    return err(new Error("Invalid sequence set"));
  }

  try {
    const mappings = await store.copyMessages(
      session.selectedMailbox.name,
      destMailbox,
      session.user,
      ids,
    );

    return ok({
      sourceUids: mappings.map((m) => m.sourceUid),
      destUids: mappings.map((m) => m.destUid),
      destMailbox,
    });
  } catch (error) {
    return err(error instanceof Error ? error : new Error(String(error)));
  }
}

export interface CopyResponse {
  sourceUids: number[];
  destUids: number[];
  destMailbox: string;
}

// ─── MOVE Handler ───────────────────────────────────────────────────────────

/**
 * Handle MOVE command — atomically move messages to another mailbox.
 * RFC 6851 / RFC 9051 Section 6.4.8.
 */
export async function handleMove(
  session: ImapSession,
  sequenceSet: string,
  destMailbox: string,
  useUid: boolean,
  store: MessageStore,
): Promise<Result<CopyResponse>> {
  if (!session.selectedMailbox || !session.user) {
    return err(new Error("No mailbox selected"));
  }

  if (session.selectedMailbox.readOnly) {
    return err(new Error("Mailbox is read-only (opened with EXAMINE)"));
  }

  const ids = parseSequenceSet(sequenceSet);
  if (ids.length === 0) {
    return err(new Error("Invalid sequence set"));
  }

  try {
    const mappings = await store.moveMessages(
      session.selectedMailbox.name,
      destMailbox,
      session.user,
      ids,
    );

    return ok({
      sourceUids: mappings.map((m) => m.sourceUid),
      destUids: mappings.map((m) => m.destUid),
      destMailbox,
    });
  } catch (error) {
    return err(error instanceof Error ? error : new Error(String(error)));
  }
}

// ─── EXPUNGE Handler ────────────────────────────────────────────────────────

/**
 * Handle EXPUNGE command — permanently remove messages marked \Deleted.
 * RFC 9051 Section 6.4.9.
 * UID EXPUNGE allows expunging specific UIDs only.
 */
export async function handleExpunge(
  session: ImapSession,
  uids: number[] | undefined,
  store: MessageStore,
): Promise<Result<number[]>> {
  if (!session.selectedMailbox || !session.user) {
    return err(new Error("No mailbox selected"));
  }

  if (session.selectedMailbox.readOnly) {
    return err(new Error("Mailbox is read-only"));
  }

  try {
    const expunged = await store.expunge(
      session.selectedMailbox.name,
      session.user,
      uids,
    );
    return ok(expunged);
  } catch (error) {
    return err(error instanceof Error ? error : new Error(String(error)));
  }
}

// ─── SEARCH Handler ─────────────────────────────────────────────────────────

/**
 * Handle SEARCH command — find messages matching criteria.
 * RFC 9051 Section 6.4.4.
 *
 * Supports: ALL, ANSWERED, DELETED, DRAFT, FLAGGED, NEW, OLD, RECENT,
 *           SEEN, UNANSWERED, UNDELETED, UNDRAFT, UNFLAGGED, UNSEEN,
 *           FROM, TO, CC, BCC, SUBJECT, BODY, TEXT, BEFORE, SINCE, ON,
 *           LARGER, SMALLER, UID, HEADER, OR, NOT, sequence sets.
 */
export async function handleSearch(
  session: ImapSession,
  criteria: ImapSearchCriteria,
  useUid: boolean,
  store: MessageStore,
): Promise<Result<number[]>> {
  if (!session.selectedMailbox || !session.user) {
    return err(new Error("No mailbox selected"));
  }

  try {
    const results = await store.searchMessages(
      session.selectedMailbox.name,
      session.user,
      criteria,
    );
    return ok(results);
  } catch (error) {
    return err(error instanceof Error ? error : new Error(String(error)));
  }
}

// ─── APPEND Handler ─────────────────────────────────────────────────────────

/**
 * Handle APPEND command — add a message to a mailbox.
 * RFC 9051 Section 6.3.11.
 */
export async function handleAppend(
  session: ImapSession,
  mailbox: string,
  flags: ImapFlag[],
  internalDate: Date | undefined,
  rawMessage: string,
  store: MessageStore,
): Promise<Result<{ uid: number }>> {
  if (!session.user) {
    return err(new Error("Not authenticated"));
  }

  try {
    const result = await store.appendMessage(mailbox, session.user, {
      flags,
      internalDate: internalDate ?? new Date(),
      rawMessage,
    });
    return ok(result);
  } catch (error) {
    return err(error instanceof Error ? error : new Error(String(error)));
  }
}

// ─── IDLE Handler ───────────────────────────────────────────────────────────

/**
 * Manages IDLE state for a session.
 * RFC 2177 — allows the server to push notifications to the client
 * when mailbox state changes (new messages, flag changes, expunges).
 */
export class IdleManager {
  private readonly watchers = new Map<string, IdleWatcher>();

  /**
   * Begin IDLE for a session.
   * Returns a controller that can push updates and be cancelled.
   */
  startIdle(session: ImapSession): Result<IdleController> {
    if (!session.selectedMailbox || !session.user) {
      return err(new Error("No mailbox selected"));
    }

    const controller: IdleController = {
      sessionId: session.id,
      mailbox: session.selectedMailbox.name,
      userId: session.user,
      notifications: [],
      active: true,
    };

    const watcher: IdleWatcher = {
      controller,
      startedAt: new Date(),
      timeout: setTimeout(() => {
        // Auto-end IDLE after 30 minutes per RFC recommendation
        this.stopIdle(session.id);
      }, 30 * 60 * 1000),
    };

    this.watchers.set(session.id, watcher);
    session.idling = true;

    return ok(controller);
  }

  /**
   * Stop IDLE for a session.
   */
  stopIdle(sessionId: string): void {
    const watcher = this.watchers.get(sessionId);
    if (watcher) {
      clearTimeout(watcher.timeout);
      watcher.controller.active = false;
      this.watchers.delete(sessionId);
    }
  }

  /**
   * Notify an idling session of a mailbox change.
   */
  notify(sessionId: string, notification: IdleNotification): void {
    const watcher = this.watchers.get(sessionId);
    if (watcher?.controller.active) {
      watcher.controller.notifications.push(notification);
    }
  }

  /**
   * Notify all sessions watching a specific mailbox.
   */
  notifyMailbox(mailbox: string, userId: string, notification: IdleNotification): void {
    for (const watcher of this.watchers.values()) {
      if (
        watcher.controller.mailbox === mailbox &&
        watcher.controller.userId === userId &&
        watcher.controller.active
      ) {
        watcher.controller.notifications.push(notification);
      }
    }
  }

  /**
   * Clean up all watchers (server shutdown).
   */
  shutdown(): void {
    for (const watcher of this.watchers.values()) {
      clearTimeout(watcher.timeout);
      watcher.controller.active = false;
    }
    this.watchers.clear();
  }
}

export interface IdleController {
  sessionId: string;
  mailbox: string;
  userId: string;
  notifications: IdleNotification[];
  active: boolean;
}

export interface IdleWatcher {
  controller: IdleController;
  startedAt: Date;
  timeout: ReturnType<typeof setTimeout>;
}

export type IdleNotification =
  | { type: "exists"; count: number }
  | { type: "recent"; count: number }
  | { type: "expunge"; sequenceNumber: number }
  | { type: "fetch"; sequenceNumber: number; flags: ImapFlag[] };

// ─── Sequence Set Parser ────────────────────────────────────────────────────

/**
 * Parse an IMAP sequence set into an array of numbers.
 * Supports individual numbers, ranges (n:m), and wildcard (*).
 * Example: "1:3,5,7:*" with max=10 => [1,2,3,5,7,8,9,10]
 */
export function parseSequenceSet(set: string, max = 999999): number[] {
  const result: number[] = [];
  const parts = set.split(",");

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    if (trimmed.includes(":")) {
      const [startStr, endStr] = trimmed.split(":");
      if (startStr === undefined || endStr === undefined) continue;
      const start = startStr === "*" ? max : parseInt(startStr, 10);
      const end = endStr === "*" ? max : parseInt(endStr, 10);

      if (Number.isNaN(start) || Number.isNaN(end)) continue;

      const low = Math.min(start, end);
      const high = Math.min(Math.max(start, end), max);

      for (let i = low; i <= high; i++) {
        result.push(i);
      }
    } else {
      const num = trimmed === "*" ? max : parseInt(trimmed, 10);
      if (!Number.isNaN(num) && num <= max) {
        result.push(num);
      }
    }
  }

  return [...new Set(result)].sort((a, b) => a - b);
}

// ─── Formatting Helpers ─────────────────────────────────────────────────────

function formatFlags(flags: ImapFlag[]): string {
  return `(${flags.map((f) => `\\${f}`).join(" ")})`;
}

function formatInternalDate(date: Date): string {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const d = date.getUTCDate().toString().padStart(2, " ");
  const m = months[date.getUTCMonth()];
  const y = date.getUTCFullYear();
  const h = date.getUTCHours().toString().padStart(2, "0");
  const min = date.getUTCMinutes().toString().padStart(2, "0");
  const sec = date.getUTCSeconds().toString().padStart(2, "0");
  return `"${d}-${m}-${y} ${h}:${min}:${sec} +0000"`;
}
