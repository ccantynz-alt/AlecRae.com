import {
  pgTable,
  text,
  timestamp,
  boolean,
  index,
  pgEnum,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const changelogCategoryEnum = pgEnum("changelog_category", [
  "feature",
  "improvement",
  "fix",
  "security",
  "breaking",
]);

// ---------------------------------------------------------------------------
// Changelog Entries — every release note lives here
// ---------------------------------------------------------------------------

export const changelogEntries = pgTable(
  "changelog_entries",
  {
    id: text("id").primaryKey(),

    /** Semver version string (e.g. "1.2.0"). */
    version: text("version").notNull(),

    /** Human-readable title of the entry. */
    title: text("title").notNull(),

    /** Full markdown body of the entry. */
    content: text("content").notNull(),

    /** Category tag used for filtering and color-coding. */
    category: changelogCategoryEnum("category").notNull(),

    /** When this entry was published (null = draft). */
    publishedAt: timestamp("published_at", { withTimezone: true }),

    /** Whether this entry is visible to the public. */
    isPublished: boolean("is_published").notNull().default(false),

    /** Display name of the author. */
    authorName: text("author_name").notNull().default("Vienna Team"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("changelog_entries_version_idx").on(table.version),
    index("changelog_entries_category_idx").on(table.category),
    index("changelog_entries_published_at_idx").on(table.publishedAt),
    index("changelog_entries_is_published_idx").on(table.isPublished),
  ],
);
