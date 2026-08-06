/**
 * Journal-monotonicity guard.
 *
 * Drizzle's migrator applies a migration only when the DB's MAX recorded
 * created_at is less than the migration's `when` (folderMillis) — it does
 * NOT track applied migrations individually. So a journal entry whose
 * `when` is smaller than any earlier entry's is invisible to every
 * database that already applied the larger value: it is silently skipped,
 * forever, with green CI. That exact state shipped once — hand-written
 * 0006 carried a timestamp larger than generated 0007–0010, which would
 * have made the next production deploy skip the dedup index (0008), the
 * provider_message_id column (0009) and stripe_webhook_events (0010).
 *
 * 0007 is grandfathered: its `when` predates 0006's and cannot be bumped,
 * because production has already applied it and its SQL (ALTER TYPE ...
 * ADD VALUE without IF NOT EXISTS) is not idempotent — re-applying would
 * fail the whole migration transaction. Every database that applied 0006
 * did so in the same run as 0007 (file order), so no DB can be stranded
 * between them.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

interface JournalEntry {
  idx: number;
  when: number;
  tag: string;
}

const GRANDFATHERED_TAGS = new Set(["0007_numerous_valkyrie"]);

function loadJournal(): JournalEntry[] {
  const raw = readFileSync(
    join(__dirname, "..", "src", "migrations", "meta", "_journal.json"),
    "utf8",
  );
  const parsed = JSON.parse(raw) as { entries: JournalEntry[] };
  return parsed.entries;
}

describe("migration journal ordering", () => {
  it("every non-grandfathered entry's `when` exceeds the running maximum before it", () => {
    const entries = loadJournal();
    let runningMax = 0;
    const violations: string[] = [];
    for (const entry of entries) {
      if (entry.when <= runningMax && !GRANDFATHERED_TAGS.has(entry.tag)) {
        violations.push(
          `${entry.tag} (when=${entry.when}) <= running max ${runningMax} — ` +
            `this migration will be SILENTLY SKIPPED by every DB that already ` +
            `migrated past the larger timestamp`,
        );
      }
      runningMax = Math.max(runningMax, entry.when);
    }
    expect(violations).toEqual([]);
  });

  it("entries are indexed contiguously from 0", () => {
    const entries = loadJournal();
    entries.forEach((entry, i) => {
      expect(entry.idx).toBe(i);
    });
  });
});
