import {
  pgTable,
  text,
  timestamp,
  jsonb,
  index,
  integer,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { accounts } from "./users.js";

// ---------------------------------------------------------------------------
// Smart Folders / Saved Searches — auto-populating custom views
// ---------------------------------------------------------------------------

export const smartFolderTypeEnum = pgEnum("smart_folder_type", [
  "smart",
  "saved_search",
]);

export interface SmartFolderFilter {
  from?: string;
  to?: string;
  subject?: string;
  hasAttachment?: boolean;
  isRead?: boolean;
  isStarred?: boolean;
  labels?: string[];
  dateAfter?: string;
  dateBefore?: string;
  query?: string;
  senderDomain?: string;
  category?: string;
}

export const smartFolders = pgTable(
  "smart_folders",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    icon: text("icon"),
    color: text("color"),
    type: smartFolderTypeEnum("type").notNull().default("smart"),
    filters: jsonb("filters").notNull().$type<SmartFolderFilter>(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("smart_folders_account_id_idx").on(table.accountId),
    index("smart_folders_type_idx").on(table.accountId, table.type),
  ],
);

export const smartFoldersRelations = relations(smartFolders, ({ one }) => ({
  account: one(accounts, {
    fields: [smartFolders.accountId],
    references: [accounts.id],
  }),
}));
