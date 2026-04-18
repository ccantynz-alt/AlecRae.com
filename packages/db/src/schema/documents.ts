import {
  pgTable,
  text,
  timestamp,
  pgEnum,
  integer,
  boolean,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { accounts } from "./users.js";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const documentTypeEnum = pgEnum("document_type", [
  "doc",
  "spreadsheet",
  "presentation",
  "form",
]);

// ---------------------------------------------------------------------------
// Documents — AlecRae Docs (replaces Word / Google Docs / Sheets / Slides)
// ---------------------------------------------------------------------------

export const documents = pgTable(
  "documents",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),

    /** Document title. */
    title: text("title").notNull(),
    /** Document body (markdown or ProseMirror JSON). */
    content: text("content").notNull().default(""),
    /** Document type: doc, spreadsheet, presentation, or form. */
    type: documentTypeEnum("type").notNull().default("doc"),

    /** Parent folder (nullable — root-level documents). */
    folderId: text("folder_id"),

    /** Whether the document is publicly accessible via link. */
    isPublic: boolean("is_public").notNull().default(false),
    /** Whether this document is a reusable template. */
    isTemplate: boolean("is_template").notNull().default(false),

    /** List of user IDs who have been granted access. */
    collaborators: jsonb("collaborators").notNull().$type<string[]>().default([]),
    /** User-defined tags for organisation and filtering. */
    tags: jsonb("tags").notNull().$type<string[]>().default([]),

    /** Current version number (auto-incremented on each update). */
    version: integer("version").notNull().default(1),
    /** Approximate word count (kept in sync on save). */
    wordCount: integer("word_count").notNull().default(0),
    /** User ID or email of the last editor. */
    lastEditedBy: text("last_edited_by"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** Soft-delete timestamp (null = active). */
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => [
    index("documents_account_id_idx").on(table.accountId),
    index("documents_folder_id_idx").on(table.folderId),
    index("documents_type_idx").on(table.accountId, table.type),
    index("documents_archived_at_idx").on(table.archivedAt),
    index("documents_is_template_idx").on(table.accountId, table.isTemplate),
  ],
);

// ---------------------------------------------------------------------------
// Document Folders — hierarchical organisation
// ---------------------------------------------------------------------------

export const documentFolders = pgTable(
  "document_folders",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),

    /** Folder display name. */
    name: text("name").notNull(),
    /** Parent folder ID for nesting (null = root). */
    parentId: text("parent_id"),
    /** Optional accent colour for the folder icon. */
    color: text("color"),
    /** Display order within the parent folder. */
    sortOrder: integer("sort_order").notNull().default(0),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("document_folders_account_id_idx").on(table.accountId),
    index("document_folders_parent_id_idx").on(table.parentId),
  ],
);

// ---------------------------------------------------------------------------
// Document Versions — full version history for every document
// ---------------------------------------------------------------------------

export const documentVersions = pgTable(
  "document_versions",
  {
    id: text("id").primaryKey(),
    documentId: text("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),

    /** Version number (mirrors documents.version at the time of snapshot). */
    version: integer("version").notNull(),
    /** Full document content at this version. */
    content: text("content").notNull(),
    /** User ID or email of whoever made this edit. */
    editedBy: text("edited_by"),
    /** Short description of what changed. */
    changeDescription: text("change_description"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("document_versions_document_id_idx").on(table.documentId),
    index("document_versions_doc_version_idx").on(
      table.documentId,
      table.version,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const documentsRelations = relations(documents, ({ one, many }) => ({
  account: one(accounts, {
    fields: [documents.accountId],
    references: [accounts.id],
  }),
  folder: one(documentFolders, {
    fields: [documents.folderId],
    references: [documentFolders.id],
  }),
  versions: many(documentVersions),
}));

export const documentFoldersRelations = relations(
  documentFolders,
  ({ one, many }) => ({
    account: one(accounts, {
      fields: [documentFolders.accountId],
      references: [accounts.id],
    }),
    parent: one(documentFolders, {
      fields: [documentFolders.parentId],
      references: [documentFolders.id],
      relationName: "parentChild",
    }),
    children: many(documentFolders, {
      relationName: "parentChild",
    }),
    documents: many(documents),
  }),
);

export const documentVersionsRelations = relations(
  documentVersions,
  ({ one }) => ({
    document: one(documents, {
      fields: [documentVersions.documentId],
      references: [documents.id],
    }),
  }),
);
