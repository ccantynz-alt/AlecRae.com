import { Hono } from "hono";
import { z } from "zod";
import { eq, and, desc, lt, gte, sql, or, ilike } from "drizzle-orm";
import {
  getDatabase,
  knowledgeEntities,
  knowledgeRelationships,
  knowledgeExtractions,
} from "@alecrae/db";
import { generateId } from "../lib/id.js";
import { requireScope } from "../middleware/auth.js";
import {
  validateBody,
  validateQuery,
  getValidatedBody,
  getValidatedQuery,
} from "../middleware/validation.js";

const knowledgeGraphRouter = new Hono();

// ---------------------------------------------------------------------------
// POST /extract — extract entities/relationships from email
// ---------------------------------------------------------------------------

knowledgeGraphRouter.post(
  "/extract",
  requireScope("messages:write"),
  validateBody(
    z.object({
      emailId: z.string().min(1),
      content: z.string().min(1),
      senderEmail: z.string().optional(),
    }),
  ),
  async (c) => {
    const body = getValidatedBody(c);
    const accountId = c.get("accountId" as never) as string;
    const db = getDatabase();
    const startTime = Date.now();

    const entityTypes = ["person", "company", "project", "topic", "product", "event", "location"] as const;
    const contentLower = body.content.toLowerCase();

    const emailPattern = /[\w.-]+@[\w.-]+\.\w+/g;
    const emails = contentLower.match(emailPattern) ?? [];
    const companyPattern = /(?:at |@|from |with )([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)*)/g;
    const projectPattern = /(?:project|initiative|program)\s+["']?([A-Za-z][\w\s-]{2,30})["']?/gi;

    const extractedEntities: Array<{ name: string; type: (typeof entityTypes)[number]; normalized: string }> = [];

    if (body.senderEmail) {
      const name = body.senderEmail.split("@")[0]?.replace(/[._-]/g, " ") ?? body.senderEmail;
      extractedEntities.push({ name, type: "person", normalized: name.toLowerCase() });
    }

    for (const email of emails) {
      const name = email.split("@")[0]?.replace(/[._-]/g, " ") ?? email;
      extractedEntities.push({ name, type: "person", normalized: name.toLowerCase() });
      const domain = email.split("@")[1]?.split(".")[0];
      if (domain && domain.length > 2) {
        extractedEntities.push({ name: domain, type: "company", normalized: domain.toLowerCase() });
      }
    }

    let compMatch;
    while ((compMatch = companyPattern.exec(body.content)) !== null) {
      const name = compMatch[1]!;
      if (name.length > 2 && name.length < 40) {
        extractedEntities.push({ name, type: "company", normalized: name.toLowerCase() });
      }
    }

    let projMatch;
    while ((projMatch = projectPattern.exec(body.content)) !== null) {
      const name = projMatch[1]!.trim();
      if (name.length > 2) {
        extractedEntities.push({ name, type: "project", normalized: name.toLowerCase() });
      }
    }

    const topicKeywords = ["budget", "deadline", "launch", "design", "marketing", "sales", "hiring", "security", "infrastructure", "roadmap"];
    for (const topic of topicKeywords) {
      if (contentLower.includes(topic)) {
        extractedEntities.push({ name: topic, type: "topic", normalized: topic });
      }
    }

    const seen = new Set<string>();
    const unique = extractedEntities.filter((e) => {
      const key = `${e.type}:${e.normalized}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const entityIds: string[] = [];
    for (const ent of unique) {
      const existing = await db
        .select()
        .from(knowledgeEntities)
        .where(
          and(
            eq(knowledgeEntities.accountId, accountId),
            eq(knowledgeEntities.entityType, ent.type),
            eq(knowledgeEntities.normalizedName, ent.normalized),
          ),
        )
        .limit(1);

      if (existing.length > 0) {
        const record = existing[0]!;
        await db
          .update(knowledgeEntities)
          .set({
            mentionCount: record.mentionCount + 1,
            lastSeenAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(knowledgeEntities.id, record.id));
        entityIds.push(record.id);
      } else {
        const id = generateId();
        await db.insert(knowledgeEntities).values({
          id,
          accountId,
          entityType: ent.type,
          name: ent.name,
          normalizedName: ent.normalized,
        });
        entityIds.push(id);
      }
    }

    let relationshipsCreated = 0;
    for (let i = 0; i < entityIds.length && i < 10; i++) {
      for (let j = i + 1; j < entityIds.length && j < 10; j++) {
        const sourceId = entityIds[i]!;
        const targetId = entityIds[j]!;

        const existingRel = await db
          .select()
          .from(knowledgeRelationships)
          .where(
            and(
              eq(knowledgeRelationships.accountId, accountId),
              eq(knowledgeRelationships.sourceEntityId, sourceId),
              eq(knowledgeRelationships.targetEntityId, targetId),
            ),
          )
          .limit(1);

        if (existingRel.length > 0) {
          const rel = existingRel[0]!;
          const currentEvidence = (rel.evidence ?? []) as string[];
          const newStrength = Math.min(1, rel.strength + 0.1);
          await db
            .update(knowledgeRelationships)
            .set({
              strength: newStrength,
              evidence: [...currentEvidence, body.emailId].slice(-20),
              lastObservedAt: new Date(),
            })
            .where(eq(knowledgeRelationships.id, rel.id));
        } else {
          await db.insert(knowledgeRelationships).values({
            id: generateId(),
            accountId,
            sourceEntityId: sourceId,
            targetEntityId: targetId,
            relationshipType: "mentioned_with",
            strength: 0.3,
            evidence: [body.emailId],
          });
          relationshipsCreated++;
        }
      }
    }

    const processingTimeMs = Date.now() - startTime;
    await db.insert(knowledgeExtractions).values({
      id: generateId(),
      accountId,
      emailId: body.emailId,
      entitiesExtracted: unique.length,
      relationshipsExtracted: relationshipsCreated,
      processingTimeMs,
    });

    return c.json({
      success: true,
      data: {
        entitiesExtracted: unique.length,
        relationshipsCreated,
        processingTimeMs,
        entities: unique,
      },
    });
  },
);

// ---------------------------------------------------------------------------
// GET /entities — list entities
// ---------------------------------------------------------------------------

knowledgeGraphRouter.get(
  "/entities",
  requireScope("messages:read"),
  validateQuery(
    z.object({
      type: z.enum(["person", "company", "project", "topic", "product", "event", "location"]).optional(),
      search: z.string().optional(),
      sortBy: z.enum(["mentions", "recent"]).optional().default("mentions"),
      limit: z.coerce.number().int().min(1).max(100).optional().default(50),
      cursor: z.string().optional(),
    }),
  ),
  async (c) => {
    const query = getValidatedQuery(c);
    const accountId = c.get("accountId" as never) as string;
    const db = getDatabase();

    const conditions = [eq(knowledgeEntities.accountId, accountId)];
    if (query.type) conditions.push(eq(knowledgeEntities.entityType, query.type));
    if (query.search) conditions.push(ilike(knowledgeEntities.name, `%${query.search}%`));
    if (query.cursor) conditions.push(lt(knowledgeEntities.id, query.cursor));

    const orderCol = query.sortBy === "recent" ? knowledgeEntities.lastSeenAt : knowledgeEntities.mentionCount;

    const rows = await db
      .select()
      .from(knowledgeEntities)
      .where(and(...conditions))
      .orderBy(desc(orderCol))
      .limit(query.limit + 1);

    const hasMore = rows.length > query.limit;
    if (hasMore) rows.pop();

    return c.json({
      data: rows,
      pagination: { hasMore, nextCursor: hasMore ? rows[rows.length - 1]?.id : undefined },
    });
  },
);

// ---------------------------------------------------------------------------
// GET /entities/:id — get entity with relationships
// ---------------------------------------------------------------------------

knowledgeGraphRouter.get(
  "/entities/:id",
  requireScope("messages:read"),
  async (c) => {
    const id = c.req.param("id");
    const accountId = c.get("accountId" as never) as string;
    const db = getDatabase();

    const [entity] = await db
      .select()
      .from(knowledgeEntities)
      .where(and(eq(knowledgeEntities.id, id), eq(knowledgeEntities.accountId, accountId)))
      .limit(1);

    if (!entity) return c.json({ error: { type: "not_found", message: "Entity not found" } }, 404);

    const rels = await db
      .select()
      .from(knowledgeRelationships)
      .where(
        and(
          eq(knowledgeRelationships.accountId, accountId),
          or(
            eq(knowledgeRelationships.sourceEntityId, id),
            eq(knowledgeRelationships.targetEntityId, id),
          ),
        ),
      )
      .orderBy(desc(knowledgeRelationships.strength))
      .limit(50);

    return c.json({ data: { ...entity, relationships: rels } });
  },
);

// ---------------------------------------------------------------------------
// PUT /entities/:id — update entity
// ---------------------------------------------------------------------------

knowledgeGraphRouter.put(
  "/entities/:id",
  requireScope("messages:write"),
  validateBody(
    z.object({
      description: z.string().optional(),
      attributes: z.record(z.unknown()).optional(),
    }),
  ),
  async (c) => {
    const id = c.req.param("id");
    const body = getValidatedBody(c);
    const accountId = c.get("accountId" as never) as string;
    const db = getDatabase();

    const [updated] = await db
      .update(knowledgeEntities)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(knowledgeEntities.id, id), eq(knowledgeEntities.accountId, accountId)))
      .returning();

    if (!updated) return c.json({ error: { type: "not_found", message: "Entity not found" } }, 404);
    return c.json({ data: updated });
  },
);

// ---------------------------------------------------------------------------
// DELETE /entities/:id — delete entity
// ---------------------------------------------------------------------------

knowledgeGraphRouter.delete(
  "/entities/:id",
  requireScope("messages:write"),
  async (c) => {
    const id = c.req.param("id");
    const accountId = c.get("accountId" as never) as string;
    const db = getDatabase();

    const [deleted] = await db
      .delete(knowledgeEntities)
      .where(and(eq(knowledgeEntities.id, id), eq(knowledgeEntities.accountId, accountId)))
      .returning();

    if (!deleted) return c.json({ error: { type: "not_found", message: "Entity not found" } }, 404);
    return c.json({ success: true });
  },
);

// ---------------------------------------------------------------------------
// GET /entities/:id/relationships — entity relationships
// ---------------------------------------------------------------------------

knowledgeGraphRouter.get(
  "/entities/:id/relationships",
  requireScope("messages:read"),
  async (c) => {
    const id = c.req.param("id");
    const accountId = c.get("accountId" as never) as string;
    const db = getDatabase();

    const rows = await db
      .select()
      .from(knowledgeRelationships)
      .where(
        and(
          eq(knowledgeRelationships.accountId, accountId),
          or(
            eq(knowledgeRelationships.sourceEntityId, id),
            eq(knowledgeRelationships.targetEntityId, id),
          ),
        ),
      )
      .orderBy(desc(knowledgeRelationships.strength))
      .limit(100);

    return c.json({ data: rows });
  },
);

// ---------------------------------------------------------------------------
// GET /relationships — list relationships
// ---------------------------------------------------------------------------

knowledgeGraphRouter.get(
  "/relationships",
  requireScope("messages:read"),
  validateQuery(
    z.object({
      type: z.string().optional(),
      minStrength: z.coerce.number().min(0).max(1).optional(),
      limit: z.coerce.number().int().min(1).max(100).optional().default(50),
      cursor: z.string().optional(),
    }),
  ),
  async (c) => {
    const query = getValidatedQuery(c);
    const accountId = c.get("accountId" as never) as string;
    const db = getDatabase();

    const conditions = [eq(knowledgeRelationships.accountId, accountId)];
    if (query.type) conditions.push(eq(knowledgeRelationships.relationshipType, query.type));
    if (query.minStrength !== undefined) conditions.push(gte(knowledgeRelationships.strength, query.minStrength));
    if (query.cursor) conditions.push(lt(knowledgeRelationships.id, query.cursor));

    const rows = await db
      .select()
      .from(knowledgeRelationships)
      .where(and(...conditions))
      .orderBy(desc(knowledgeRelationships.strength))
      .limit(query.limit + 1);

    const hasMore = rows.length > query.limit;
    if (hasMore) rows.pop();

    return c.json({
      data: rows,
      pagination: { hasMore, nextCursor: hasMore ? rows[rows.length - 1]?.id : undefined },
    });
  },
);

// ---------------------------------------------------------------------------
// GET /search — search knowledge graph
// ---------------------------------------------------------------------------

knowledgeGraphRouter.get(
  "/search",
  requireScope("messages:read"),
  validateQuery(z.object({ q: z.string().min(1) })),
  async (c) => {
    const query = getValidatedQuery(c);
    const accountId = c.get("accountId" as never) as string;
    const db = getDatabase();

    const rows = await db
      .select()
      .from(knowledgeEntities)
      .where(
        and(
          eq(knowledgeEntities.accountId, accountId),
          or(
            ilike(knowledgeEntities.name, `%${query.q}%`),
            ilike(knowledgeEntities.normalizedName, `%${query.q.toLowerCase()}%`),
          ),
        ),
      )
      .orderBy(desc(knowledgeEntities.mentionCount))
      .limit(20);

    return c.json({ data: rows });
  },
);

// ---------------------------------------------------------------------------
// GET /graph — graph visualization data
// ---------------------------------------------------------------------------

knowledgeGraphRouter.get(
  "/graph",
  requireScope("messages:read"),
  validateQuery(
    z.object({
      centerEntityId: z.string().optional(),
      depth: z.coerce.number().int().min(1).max(3).optional().default(2),
      maxNodes: z.coerce.number().int().min(1).max(200).optional().default(50),
    }),
  ),
  async (c) => {
    const query = getValidatedQuery(c);
    const accountId = c.get("accountId" as never) as string;
    const db = getDatabase();

    let nodes;
    if (query.centerEntityId) {
      const rels = await db
        .select()
        .from(knowledgeRelationships)
        .where(
          and(
            eq(knowledgeRelationships.accountId, accountId),
            or(
              eq(knowledgeRelationships.sourceEntityId, query.centerEntityId),
              eq(knowledgeRelationships.targetEntityId, query.centerEntityId),
            ),
          ),
        )
        .orderBy(desc(knowledgeRelationships.strength))
        .limit(query.maxNodes);

      const entityIds = new Set<string>([query.centerEntityId]);
      for (const r of rels) {
        entityIds.add(r.sourceEntityId);
        entityIds.add(r.targetEntityId);
      }

      nodes = await db
        .select()
        .from(knowledgeEntities)
        .where(
          and(
            eq(knowledgeEntities.accountId, accountId),
            sql`${knowledgeEntities.id} = ANY(${sql.raw(`ARRAY[${[...entityIds].map((id) => `'${id}'`).join(",")}]`)})`,
          ),
        );

      return c.json({ data: { nodes, edges: rels } });
    }

    nodes = await db
      .select()
      .from(knowledgeEntities)
      .where(eq(knowledgeEntities.accountId, accountId))
      .orderBy(desc(knowledgeEntities.mentionCount))
      .limit(query.maxNodes);

    const nodeIds = nodes.map((n) => n.id);
    let edges: typeof knowledgeRelationships.$inferSelect[] = [];
    if (nodeIds.length > 0) {
      edges = await db
        .select()
        .from(knowledgeRelationships)
        .where(
          and(
            eq(knowledgeRelationships.accountId, accountId),
            sql`${knowledgeRelationships.sourceEntityId} = ANY(${sql.raw(`ARRAY[${nodeIds.map((id) => `'${id}'`).join(",")}]`)})`,
          ),
        )
        .limit(200);
    }

    return c.json({ data: { nodes, edges } });
  },
);

// ---------------------------------------------------------------------------
// POST /batch-extract — batch extract from emails
// ---------------------------------------------------------------------------

knowledgeGraphRouter.post(
  "/batch-extract",
  requireScope("messages:write"),
  validateBody(
    z.object({
      emails: z
        .array(
          z.object({
            emailId: z.string().min(1),
            content: z.string().min(1),
            senderEmail: z.string().optional(),
          }),
        )
        .min(1)
        .max(50),
    }),
  ),
  async (c) => {
    const body = getValidatedBody(c);
    const accountId = c.get("accountId" as never) as string;
    const db = getDatabase();

    const results: Array<{ emailId: string; entitiesExtracted: number }> = [];

    for (const email of body.emails) {
      const topicKeywords = ["budget", "deadline", "launch", "design", "marketing", "sales", "hiring"];
      const contentLower = email.content.toLowerCase();
      const topics = topicKeywords.filter((t) => contentLower.includes(t));

      let entCount = 0;
      for (const topic of topics) {
        const existing = await db
          .select()
          .from(knowledgeEntities)
          .where(
            and(
              eq(knowledgeEntities.accountId, accountId),
              eq(knowledgeEntities.entityType, "topic"),
              eq(knowledgeEntities.normalizedName, topic),
            ),
          )
          .limit(1);

        if (existing.length > 0) {
          await db
            .update(knowledgeEntities)
            .set({ mentionCount: existing[0]!.mentionCount + 1, lastSeenAt: new Date(), updatedAt: new Date() })
            .where(eq(knowledgeEntities.id, existing[0]!.id));
        } else {
          await db.insert(knowledgeEntities).values({
            id: generateId(),
            accountId,
            entityType: "topic",
            name: topic,
            normalizedName: topic,
          });
        }
        entCount++;
      }

      await db.insert(knowledgeExtractions).values({
        id: generateId(),
        accountId,
        emailId: email.emailId,
        entitiesExtracted: entCount,
        relationshipsExtracted: 0,
        processingTimeMs: 0,
      });

      results.push({ emailId: email.emailId, entitiesExtracted: entCount });
    }

    return c.json({ success: true, processed: results.length, data: results });
  },
);

// ---------------------------------------------------------------------------
// GET /stats — knowledge graph stats
// ---------------------------------------------------------------------------

knowledgeGraphRouter.get(
  "/stats",
  requireScope("messages:read"),
  async (c) => {
    const accountId = c.get("accountId" as never) as string;
    const db = getDatabase();

    const entityCounts = await db
      .select({
        entityType: knowledgeEntities.entityType,
        count: sql<number>`count(*)::int`,
      })
      .from(knowledgeEntities)
      .where(eq(knowledgeEntities.accountId, accountId))
      .groupBy(knowledgeEntities.entityType);

    const [relCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(knowledgeRelationships)
      .where(eq(knowledgeRelationships.accountId, accountId));

    const [extractionCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(knowledgeExtractions)
      .where(eq(knowledgeExtractions.accountId, accountId));

    return c.json({
      data: {
        entitiesByType: entityCounts,
        totalRelationships: relCount?.count ?? 0,
        totalExtractions: extractionCount?.count ?? 0,
      },
    });
  },
);

// ---------------------------------------------------------------------------
// GET /suggestions — AI-suggested connections
// ---------------------------------------------------------------------------

knowledgeGraphRouter.get(
  "/suggestions",
  requireScope("messages:read"),
  async (c) => {
    const accountId = c.get("accountId" as never) as string;
    const db = getDatabase();

    const highMention = await db
      .select()
      .from(knowledgeEntities)
      .where(and(eq(knowledgeEntities.accountId, accountId), gte(knowledgeEntities.mentionCount, 3)))
      .orderBy(desc(knowledgeEntities.mentionCount))
      .limit(10);

    const suggestions: Array<{ type: string; message: string; entities: string[] }> = [];

    for (let i = 0; i < highMention.length; i++) {
      for (let j = i + 1; j < highMention.length; j++) {
        const a = highMention[i]!;
        const b = highMention[j]!;

        const existingRel = await db
          .select()
          .from(knowledgeRelationships)
          .where(
            and(
              eq(knowledgeRelationships.accountId, accountId),
              or(
                and(
                  eq(knowledgeRelationships.sourceEntityId, a.id),
                  eq(knowledgeRelationships.targetEntityId, b.id),
                ),
                and(
                  eq(knowledgeRelationships.sourceEntityId, b.id),
                  eq(knowledgeRelationships.targetEntityId, a.id),
                ),
              ),
            ),
          )
          .limit(1);

        if (existingRel.length === 0) {
          suggestions.push({
            type: "potential_connection",
            message: `"${a.name}" and "${b.name}" are frequently mentioned but have no recorded relationship`,
            entities: [a.id, b.id],
          });
        }
      }
      if (suggestions.length >= 10) break;
    }

    return c.json({ data: suggestions });
  },
);

export { knowledgeGraphRouter };
