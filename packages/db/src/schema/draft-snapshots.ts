import {
  pgTable,
  text,
  timestamp,
  integer,
  customType,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { accounts } from "./users.js";

/**
 * Postgres `bytea` column type for storing raw Y.Doc binary state.
 */
const bytea = customType<{ data: Uint8Array; default: false }>({
  dataType() {
    return "bytea";
  },
});

// ---------------------------------------------------------------------------
// Draft Snapshots — CRDT state for collaborative draft editing
// ---------------------------------------------------------------------------

export const draftSnapshots = pgTable(
  "draft_snapshots",
  {
    id: text("id").primaryKey(),
    draftId: text("draft_id").notNull(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    /** Encoded Y.Doc state (Y.encodeStateAsUpdate). */
    ydocState: bytea("ydoc_state").notNull(),
    /** Monotonic version number, bumped on each persisted update. */
    version: integer("version").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("draft_snapshots_draft_id_idx").on(table.draftId),
    index("draft_snapshots_account_id_idx").on(table.accountId),
  ],
);

export const draftSnapshotsRelations = relations(draftSnapshots, ({ one }) => ({
  account: one(accounts, {
    fields: [draftSnapshots.accountId],
    references: [accounts.id],
  }),
}));

export type DraftSnapshot = typeof draftSnapshots.$inferSelect;
export type NewDraftSnapshot = typeof draftSnapshots.$inferInsert;
