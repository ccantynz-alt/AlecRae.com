import {
  pgTable,
  text,
  timestamp,
  integer,
  real,
  jsonb,
  index,
  uniqueIndex,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { accounts } from "./users.js";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const sentimentLevelEnum = pgEnum("sentiment_level", [
  "very_positive",
  "positive",
  "neutral",
  "negative",
  "very_negative",
]);

// ---------------------------------------------------------------------------
// Sentiment Timeline — per-email sentiment tracking over time
// ---------------------------------------------------------------------------

export const sentimentTimeline = pgTable(
  "sentiment_timeline",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),

    /** Email address of the contact this sentiment is about. */
    contactEmail: text("contact_email").notNull(),

    /** Reference to the email that was analyzed. */
    emailId: text("email_id").notNull(),

    /** Classified sentiment level. */
    sentiment: sentimentLevelEnum("sentiment").notNull(),

    /** Confidence score from 0.0 to 1.0. */
    score: real("score").notNull(),

    /** Topics discussed in this email (extracted by AI). */
    topics: jsonb("topics").$type<string[]>().default([]),

    /** Emotional tone descriptor (e.g. "frustrated", "appreciative", "formal"). */
    emotionalTone: text("emotional_tone"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("sentiment_timeline_account_id_idx").on(table.accountId),
    index("sentiment_timeline_contact_email_idx").on(table.contactEmail),
    index("sentiment_timeline_sentiment_idx").on(table.sentiment),
    index("sentiment_timeline_created_at_idx").on(table.createdAt),
  ],
);

// ---------------------------------------------------------------------------
// Relationship Health — aggregate relationship health score per contact
// ---------------------------------------------------------------------------

export const relationshipHealth = pgTable(
  "relationship_health",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),

    /** Contact's email address. */
    contactEmail: text("contact_email").notNull(),

    /** Contact's display name. */
    contactName: text("contact_name"),

    /** Composite health score from 0 to 100. */
    healthScore: real("health_score").notNull().default(50),

    /** Direction the relationship is trending. */
    trendDirection: text("trend_direction").notNull().default("stable"), // "improving" | "stable" | "declining"

    /** Average sentiment score across all interactions. */
    avgSentiment: real("avg_sentiment").notNull().default(0.5),

    /** Total number of analyzed interactions. */
    totalInteractions: integer("total_interactions").notNull().default(0),

    /** Last time a positive interaction was recorded. */
    lastPositiveAt: timestamp("last_positive_at", { withTimezone: true }),

    /** Last time a negative interaction was recorded. */
    lastNegativeAt: timestamp("last_negative_at", { withTimezone: true }),

    /** Risk level based on declining sentiment patterns. */
    riskLevel: text("risk_level").notNull().default("none"), // "none" | "low" | "medium" | "high"

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("relationship_health_account_id_idx").on(table.accountId),
    uniqueIndex("relationship_health_account_contact_idx").on(
      table.accountId,
      table.contactEmail,
    ),
    index("relationship_health_health_score_idx").on(table.healthScore),
    index("relationship_health_risk_level_idx").on(table.riskLevel),
  ],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const sentimentTimelineRelations = relations(
  sentimentTimeline,
  ({ one }) => ({
    account: one(accounts, {
      fields: [sentimentTimeline.accountId],
      references: [accounts.id],
    }),
  }),
);

export const relationshipHealthRelations = relations(
  relationshipHealth,
  ({ one }) => ({
    account: one(accounts, {
      fields: [relationshipHealth.accountId],
      references: [accounts.id],
    }),
  }),
);

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type SentimentTimelineEntry = typeof sentimentTimeline.$inferSelect;
export type NewSentimentTimelineEntry = typeof sentimentTimeline.$inferInsert;
export type RelationshipHealthRecord = typeof relationshipHealth.$inferSelect;
export type NewRelationshipHealthRecord = typeof relationshipHealth.$inferInsert;
