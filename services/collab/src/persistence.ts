/**
 * Persistence — saves Y.Doc state to Postgres so that clients can resume
 * a collaborative draft after a disconnect or server restart.
 *
 * We persist the *full encoded state* (Y.encodeStateAsUpdate) on a debounce.
 * On load, we decode it back into the live Y.Doc with Y.applyUpdate.
 */

import * as Y from "yjs";
import { eq, desc, and } from "drizzle-orm";
import { getDb, draftSnapshots, type DraftSnapshot } from "@emailed/db";

export interface PersistenceOptions {
  /** Debounce window before flushing updates to Postgres (ms). */
  debounceMs?: number;
}

const DEFAULT_DEBOUNCE_MS = 750;

export class DraftPersistence {
  private readonly debounceMs: number;
  private readonly pending = new Map<string, NodeJS.Timeout>();

  constructor(opts: PersistenceOptions = {}) {
    this.debounceMs = opts.debounceMs ?? DEFAULT_DEBOUNCE_MS;
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

    Y.applyUpdate(doc, new Uint8Array(row.ydocState));
    return row.version;
  }

  /**
   * Schedule a debounced save for the given draft. Multiple rapid calls
   * coalesce into a single write.
   */
  schedule(
    draftId: string,
    accountId: string,
    doc: Y.Doc,
    currentVersion: { value: number },
  ): void {
    const existing = this.pending.get(draftId);
    if (existing) clearTimeout(existing);

    const handle = setTimeout(() => {
      this.pending.delete(draftId);
      void this.flush(draftId, accountId, doc, currentVersion).catch((err) => {
        console.error(`[collab:persistence] flush failed for ${draftId}:`, err);
      });
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

    currentVersion.value = nextVersion;
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
}
