/**
 * Persistence — saves Y.Doc state to Postgres so that clients can resume
 * a collaborative draft after a disconnect or server restart.
 *
 * We persist:
 *   1. The *full encoded state* (Y.encodeStateAsUpdate) in draft_snapshots — for fast resume.
 *   2. Individual update deltas in collaboration_history — for version history / undo.
 *   3. Session-level metadata in collaboration_sessions — for the UI.
 */

import * as Y from "yjs";
import { eq, desc, and } from "drizzle-orm";
import {
  getDb,
  draftSnapshots,
  collaborationSessions,
  collaborationHistory,
  type DraftSnapshot,
} from "@alecrae/db";

export interface PersistenceOptions {
  /** Debounce window before flushing updates to Postgres (ms). */
  debounceMs?: number;
  /** Whether to record individual updates in collaboration_history. */
  recordHistory?: boolean;
}

const DEFAULT_DEBOUNCE_MS = 750;

export class DraftPersistence {
  private readonly debounceMs: number;
  private readonly recordHistory: boolean;
  private readonly pending = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(opts: PersistenceOptions = {}) {
    this.debounceMs = opts.debounceMs ?? DEFAULT_DEBOUNCE_MS;
    this.recordHistory = opts.recordHistory ?? true;
  }

  /**
   * Load the latest persisted snapshot for a draft and apply it to `doc`.
   * Returns the loaded version, or 0 if there was no snapshot.
   */
  async load(draftId: string, doc: Y.Doc): Promise<number> {
    const db = getDb();
    const rows = await db
      .select()
      .from(draftSnapshots)
      .where(eq(draftSnapshots.draftId, draftId))
      .orderBy(desc(draftSnapshots.version))
      .limit(1);

    const row = rows[0] as DraftSnapshot | undefined;
    if (!row) return 0;

    Y.applyUpdate(doc, new Uint8Array(row.ydocState), "load");
    return row.version;
  }

  /**
   * Schedule a debounced save for the given draft. Multiple rapid calls
   * coalesce into a single write. Optionally records the individual
   * update delta in collaboration_history.
   */
  schedule(
    draftId: string,
    accountId: string,
    doc: Y.Doc,
    currentVersion: { value: number },
    sessionId?: string,
    editedBy?: string,
    update?: Uint8Array,
  ): void {
    // Record individual update history immediately (not debounced).
    if (this.recordHistory && update && sessionId) {
      void this.recordUpdateHistory(
        sessionId,
        currentVersion.value + 1,
        editedBy,
        update,
      ).catch((err: unknown) => {
        console.error(
          `[collab:persistence] history record failed for ${draftId}:`,
          err,
        );
      });
    }

    const existing = this.pending.get(draftId);
    if (existing) clearTimeout(existing);

    const handle = setTimeout(() => {
      this.pending.delete(draftId);
      void this.flush(draftId, accountId, doc, currentVersion, sessionId).catch(
        (err: unknown) => {
          console.error(
            `[collab:persistence] flush failed for ${draftId}:`,
            err,
          );
        },
      );
    }, this.debounceMs);

    this.pending.set(draftId, handle);
  }

  /**
   * Force-flush any pending save and write the current state immediately.
   */
  async flush(
    draftId: string,
    accountId: string,
    doc: Y.Doc,
    currentVersion: { value: number },
    sessionId?: string,
  ): Promise<void> {
    const pending = this.pending.get(draftId);
    if (pending) {
      clearTimeout(pending);
      this.pending.delete(draftId);
    }

    const db = getDb();
    const state = Y.encodeStateAsUpdate(doc);
    const nextVersion = currentVersion.value + 1;

    await db.insert(draftSnapshots).values({
      id: crypto.randomUUID().replace(/-/g, ""),
      draftId,
      accountId,
      ydocState: state,
      version: nextVersion,
      updatedAt: new Date(),
    });

    // Also update the session's latest snapshot and version.
    if (sessionId) {
      await db
        .update(collaborationSessions)
        .set({
          currentVersion: nextVersion,
          latestSnapshot: state,
          updatedAt: new Date(),
        })
        .where(eq(collaborationSessions.id, sessionId))
        .catch((err: unknown) => {
          console.error(
            `[collab:persistence] session update failed for ${sessionId}:`,
            err,
          );
        });
    }

    currentVersion.value = nextVersion;
  }

  /**
   * Record an individual Yjs update delta in the collaboration_history table.
   * This enables version history and undo per-collaborator.
   */
  private async recordUpdateHistory(
    sessionId: string,
    version: number,
    editedBy: string | undefined,
    update: Uint8Array,
  ): Promise<void> {
    const db = getDb();
    await db.insert(collaborationHistory).values({
      id: crypto.randomUUID().replace(/-/g, ""),
      sessionId,
      version,
      editedBy: editedBy ?? null,
      ydocUpdate: update,
      updateSize: update.byteLength,
      createdAt: new Date(),
    });
  }

  /**
   * Delete all persisted snapshots for a draft (e.g. when the draft is sent
   * or discarded).
   */
  async purge(draftId: string, accountId: string): Promise<void> {
    const db = getDb();
    await db
      .delete(draftSnapshots)
      .where(
        and(
          eq(draftSnapshots.draftId, draftId),
          eq(draftSnapshots.accountId, accountId),
        ),
      );
  }

  /**
   * Get version history entries for a collaboration session.
   */
  async getHistory(
    sessionId: string,
    limit = 50,
    offset = 0,
  ): Promise<
    {
      id: string;
      version: number;
      editedBy: string | null;
      updateSize: number;
      createdAt: Date;
    }[]
  > {
    const db = getDb();
    const rows = await db
      .select({
        id: collaborationHistory.id,
        version: collaborationHistory.version,
        editedBy: collaborationHistory.editedBy,
        updateSize: collaborationHistory.updateSize,
        createdAt: collaborationHistory.createdAt,
      })
      .from(collaborationHistory)
      .where(eq(collaborationHistory.sessionId, sessionId))
      .orderBy(desc(collaborationHistory.version))
      .limit(limit)
      .offset(offset);

    return rows;
  }
}
