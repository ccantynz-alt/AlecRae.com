/**
 * Knowledge Graph Schema — AI-built knowledge graph from email content
 *
 * Extracts entities (people, companies, projects, topics) and their
 * relationships from email content. Powers the knowledge graph
 * visualization, search, and AI-suggested connections.
 *
 * Tables:
 * - knowledgeEntities   — entities extracted from emails
 * - knowledgeRelationships — relationships between entities
 * - knowledgeExtractions  — log of AI extractions from emails
 */

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

export const knowledgeEntityTypeEnum = pgEnum("knowledge_entity_type", [
  "person",
  "company",
  "project",
  "topic",
  "product",
  "event",
  "location",
]);

// ---------------------------------------------------------------------------
// knowledgeEntities — entities extracted from emails
// ---------------------------------------------------------------------------

export const knowledgeEntities = pgTable(
  "knowledge_entities",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    entityType: knowledgeEntityTypeEnum("entity_type").notNull(),
    name: text("name").notNull(),

    /** Lowercase deduped name for matching / uniqueness. */
    normalizedName: text("normalized_name").notNull(),

    /** Optional AI-generated description of the entity. */
    description: text("description"),

    /** Arbitrary key-value attributes (e.g. job title, website, domain). */
    attributes: jsonb("attributes")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),

    /** Total number of times this entity has been mentioned in emails. */
    mentionCount: integer("mention_count").notNull().default(1),

    /** Timestamp of the first email where this entity was seen. */
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    /** Timestamp of the most recent email where this entity was seen. */
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("knowledge_entities_account_id_idx").on(table.accountId),
    index("knowledge_entities_entity_type_idx").on(table.entityType),
    uniqueIndex("knowledge_entities_account_type_name_idx").on(
      table.accountId,
      table.entityType,
      table.normalizedName,
    ),
    index("knowledge_entities_mention_count_idx").on(table.mentionCount),
    index("knowledge_entities_last_seen_at_idx").on(table.lastSeenAt),
  ],
);

// ---------------------------------------------------------------------------
// knowledgeRelationships — relationships between entities
// ---------------------------------------------------------------------------

export const knowledgeRelationships = pgTable(
  "knowledge_relationships",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    sourceEntityId: text("source_entity_id")
      .notNull()
      .references(() => knowledgeEntities.id, { onDelete: "cascade" }),
    targetEntityId: text("target_entity_id")
      .notNull()
      .references(() => knowledgeEntities.id, { onDelete: "cascade" }),

    /**
     * Relationship type label:
     * "works_at", "manages", "collaborates_with", "works_on",
     * "mentioned_with", "reports_to", etc.
     */
    relationshipType: text("relationship_type").notNull(),

    /** Strength of the relationship (0.0 – 1.0). */
    strength: real("strength").notNull().default(0.5),

    /** Email IDs that serve as evidence for this relationship. */
    evidence: jsonb("evidence").$type<string[]>().notNull().default([]),

    /** Last time this relationship was observed in an email. */
    lastObservedAt: timestamp("last_observed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("knowledge_relationships_account_id_idx").on(table.accountId),
    index("knowledge_relationships_source_entity_id_idx").on(
      table.sourceEntityId,
    ),
    index("knowledge_relationships_target_entity_id_idx").on(
      table.targetEntityId,
    ),
    index("knowledge_relationships_relationship_type_idx").on(
      table.relationshipType,
    ),
    index("knowledge_relationships_strength_idx").on(table.strength),
  ],
);

// ---------------------------------------------------------------------------
// knowledgeExtractions — log of AI extractions from emails
// ---------------------------------------------------------------------------

export const knowledgeExtractions = pgTable(
  "knowledge_extractions",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    emailId: text("email_id").notNull(),

    /** Number of entities extracted in this pass. */
    entitiesExtracted: integer("entities_extracted").notNull().default(0),

    /** Number of relationships extracted in this pass. */
    relationshipsExtracted: integer("relationships_extracted")
      .notNull()
      .default(0),

    /** Time taken for the AI extraction in milliseconds. */
    processingTimeMs: integer("processing_time_ms").notNull().default(0),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("knowledge_extractions_account_id_idx").on(table.accountId),
    uniqueIndex("knowledge_extractions_email_id_idx").on(table.emailId),
    index("knowledge_extractions_created_at_idx").on(table.createdAt),
  ],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const knowledgeEntitiesRelations = relations(
  knowledgeEntities,
  ({ one, many }) => ({
    account: one(accounts, {
      fields: [knowledgeEntities.accountId],
      references: [accounts.id],
    }),
    sourceRelationships: many(knowledgeRelationships, {
      relationName: "sourceEntity",
    }),
    targetRelationships: many(knowledgeRelationships, {
      relationName: "targetEntity",
    }),
  }),
);

export const knowledgeRelationshipsRelations = relations(
  knowledgeRelationships,
  ({ one }) => ({
    account: one(accounts, {
      fields: [knowledgeRelationships.accountId],
      references: [accounts.id],
    }),
    sourceEntity: one(knowledgeEntities, {
      fields: [knowledgeRelationships.sourceEntityId],
      references: [knowledgeEntities.id],
      relationName: "sourceEntity",
    }),
    targetEntity: one(knowledgeEntities, {
      fields: [knowledgeRelationships.targetEntityId],
      references: [knowledgeEntities.id],
      relationName: "targetEntity",
    }),
  }),
);

export const knowledgeExtractionsRelations = relations(
  knowledgeExtractions,
  ({ one }) => ({
    account: one(accounts, {
      fields: [knowledgeExtractions.accountId],
      references: [accounts.id],
    }),
  }),
);
