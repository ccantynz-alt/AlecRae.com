import {
  pgTable,
  text,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Link Previews — cached URL metadata for rich unfurling
// ---------------------------------------------------------------------------

export interface LinkPreviewData {
  title?: string;
  description?: string;
  image?: string;
  favicon?: string;
  siteName?: string;
  type?: string;
  author?: string;
  publishedDate?: string;
}

export const linkPreviews = pgTable(
  "link_previews",
  {
    id: text("id").primaryKey(),
    url: text("url").notNull(),
    urlHash: text("url_hash").notNull(),
    data: jsonb("data").notNull().$type<LinkPreviewData>().default({}),
    fetchedAt: timestamp("fetched_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("link_previews_url_hash_idx").on(table.urlHash),
    index("link_previews_expires_idx").on(table.expiresAt),
  ],
);
