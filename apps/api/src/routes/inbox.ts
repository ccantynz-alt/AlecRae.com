/**
 * Smart Inbox Route — AI Triage, Screener, Commitments, Follow-ups
 *
 * POST /v1/inbox/classify       — Classify an email into categories
 * GET  /v1/inbox/screener       — List emails awaiting sender approval
 * POST /v1/inbox/screener/:id   — Approve or block a sender
 * GET  /v1/inbox/commitments    — List tracked commitments/action items
 * PATCH /v1/inbox/commitments/:id — Update commitment status
 * GET  /v1/inbox/follow-ups     — Get follow-up nudges
 * GET  /v1/inbox/categories     — List inbox categories
 * POST /v1/inbox/categories     — Create custom category with natural language rule
 */

import { Hono } from "hono";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { requireScope } from "../middleware/auth.js";
import { validateBody, getValidatedBody } from "../middleware/validator.js";
import {
  classifyEmail,
  screenSender,
  detectFollowUpNeeded,
  DEFAULT_CATEGORIES,
  type InboxCategory,
  type Commitment,
} from "@alecrae/ai-engine/inbox";
import {
  getDatabase,
  screenerQueue as screenerQueueTable,
  commitments as commitmentsTable,
  inboxCategories as inboxCategoriesTable,
  screenerDecisions as screenerDecisionsTable,
} from "@alecrae/db";

// ─── Helpers ────────────────────────────────────────────────────────────────

function generateId(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

// ─── Schemas ────────────────────────────────────────────────────────────────

const ClassifySchema = z.object({
  emailId: z.string(),
  from: z.string(),
  fromName: z.string().default("Unknown"),
  subject: z.string(),
  body: z.string(),
  headers: z.record(z.string()).optional(),
});

const ScreenerDecisionSchema = z.object({
  decision: z.enum(["allow", "block"]),
  senderEmail: z.string().email(),
});

const CommitmentUpdateSchema = z.object({
  status: z.enum(["pending", "completed", "overdue", "unclear"]),
});

const CreateCategorySchema = z.object({
  name: z.string().min(1).max(50),
  icon: z.string().max(4).default("\u{1F4C1}"),
  rule: z.string().min(1).max(500),
  priority: z.number().int().min(1).max(98).default(50),
});

const inbox = new Hono();

// Exposed for cross-route access (e.g. todo.ts /from-commitment)
export async function getCommitmentsForAccount(accountId: string): Promise<readonly Commitment[]> {
  const db = getDatabase();
  const rows = await db
    .select()
    .from(commitmentsTable)
    .where(eq(commitmentsTable.accountId, accountId));

  return rows.map((row): Commitment => {
    const base = {
      id: row.id,
      actor: row.actor,
      actorName: row.actorName,
      description: row.description,
      status: row.status,
      sourceEmailId: row.sourceEmailId,
      sourceQuote: row.sourceQuote,
    };
    if (row.deadline !== null) {
      return { ...base, deadline: row.deadline };
    }
    return base;
  });
}

// POST /v1/inbox/classify — Classify an email
inbox.post(
  "/classify",
  requireScope("inbox:write"),
  validateBody(ClassifySchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof ClassifySchema>>(c);
    const auth = c.get("auth");

    const result = classifyEmail(
      input.emailId,
      auth.accountId,
      input.from,
      input.fromName,
      input.subject,
      input.body,
      input.headers,
    );

    const db = getDatabase();

    // Store commitments in DB
    if (result.commitments.length > 0) {
      const commitmentRows = result.commitments.map((co) => ({
        id: co.id,
        accountId: auth.accountId,
        actor: co.actor,
        actorName: co.actorName,
        description: co.description,
        deadline: co.deadline ?? null,
        status: co.status,
        sourceEmailId: co.sourceEmailId,
        sourceQuote: co.sourceQuote,
      }));

      await db.insert(commitmentsTable).values(commitmentRows);
    }

    // If screening required, add to screener queue
    if (result.requiresScreening) {
      await db.insert(screenerQueueTable).values({
        id: generateId(),
        accountId: auth.accountId,
        senderEmail: input.from,
        senderName: input.fromName,
        firstEmailId: input.emailId,
        firstEmailSubject: input.subject,
        firstEmailSnippet: input.body.slice(0, 200),
        aiAssessment: {
          isLikelySpam: false,
          isLikelyNewsletter: result.isNewsletter,
          isLikelyImportant: result.category.id === "important",
          reasoning: result.reasoning,
        },
        receivedAt: new Date(),
      });
    }

    return c.json({ data: result });
  },
);

// GET /v1/inbox/screener — List pending screener entries
inbox.get(
  "/screener",
  requireScope("inbox:read"),
  async (c) => {
    const auth = c.get("auth");
    const db = getDatabase();

    const queue = await db
      .select()
      .from(screenerQueueTable)
      .where(eq(screenerQueueTable.accountId, auth.accountId));

    return c.json({ data: queue });
  },
);

// POST /v1/inbox/screener/decide — Approve or block a sender
inbox.post(
  "/screener/decide",
  requireScope("inbox:write"),
  validateBody(ScreenerDecisionSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof ScreenerDecisionSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    // Upsert the screener decision
    const normalizedEmail = input.senderEmail.toLowerCase();

    // Check if decision already exists
    const [existing] = await db
      .select()
      .from(screenerDecisionsTable)
      .where(
        and(
          eq(screenerDecisionsTable.accountId, auth.accountId),
          eq(screenerDecisionsTable.senderEmail, normalizedEmail),
        ),
      )
      .limit(1);

    if (existing) {
      await db
        .update(screenerDecisionsTable)
        .set({ decision: input.decision, decidedAt: new Date() })
        .where(eq(screenerDecisionsTable.id, existing.id));
    } else {
      await db.insert(screenerDecisionsTable).values({
        id: generateId(),
        accountId: auth.accountId,
        senderEmail: normalizedEmail,
        decision: input.decision,
        decidedAt: new Date(),
      });
    }

    // Also call the AI engine's screenSender to keep its in-process state consistent
    screenSender(auth.accountId, input.senderEmail, input.decision);

    // Remove from screener queue
    await db
      .delete(screenerQueueTable)
      .where(
        and(
          eq(screenerQueueTable.accountId, auth.accountId),
          eq(screenerQueueTable.senderEmail, input.senderEmail),
        ),
      );

    return c.json({
      data: {
        senderEmail: input.senderEmail,
        decision: input.decision,
        message: input.decision === "allow"
          ? `${input.senderEmail} can now email you`
          : `${input.senderEmail} has been blocked`,
      },
    });
  },
);

// GET /v1/inbox/commitments — List tracked commitments
inbox.get(
  "/commitments",
  requireScope("inbox:read"),
  async (c) => {
    const auth = c.get("auth");
    const status = c.req.query("status");
    const db = getDatabase();

    const baseCondition = eq(commitmentsTable.accountId, auth.accountId);
    const condition = status
      ? and(
          baseCondition,
          eq(commitmentsTable.status, status as "pending" | "completed" | "overdue" | "unclear"),
        )
      : baseCondition;

    const rows = await db
      .select()
      .from(commitmentsTable)
      .where(condition);

    return c.json({ data: rows });
  },
);

// PATCH /v1/inbox/commitments/:id — Update commitment status
inbox.patch(
  "/commitments/:id",
  requireScope("inbox:write"),
  validateBody(CommitmentUpdateSchema),
  async (c) => {
    const id = c.req.param("id");
    const input = getValidatedBody<z.infer<typeof CommitmentUpdateSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const [existing] = await db
      .select()
      .from(commitmentsTable)
      .where(
        and(
          eq(commitmentsTable.id, id),
          eq(commitmentsTable.accountId, auth.accountId),
        ),
      )
      .limit(1);

    if (!existing) {
      return c.json(
        { error: { type: "not_found", message: "Commitment not found", code: "commitment_not_found" } },
        404,
      );
    }

    const [updated] = await db
      .update(commitmentsTable)
      .set({ status: input.status, updatedAt: new Date() })
      .where(eq(commitmentsTable.id, id))
      .returning();

    return c.json({ data: updated });
  },
);

// GET /v1/inbox/follow-ups — Get follow-up nudges
inbox.get(
  "/follow-ups",
  requireScope("inbox:read"),
  (c) => {
    // In production, query sent emails from DB
    const nudges = detectFollowUpNeeded([]);
    return c.json({ data: nudges });
  },
);

// GET /v1/inbox/categories — List all categories (system + custom)
inbox.get(
  "/categories",
  requireScope("inbox:read"),
  async (c) => {
    const auth = c.get("auth");
    const db = getDatabase();

    const custom = await db
      .select()
      .from(inboxCategoriesTable)
      .where(eq(inboxCategoriesTable.accountId, auth.accountId));

    const customAsCategories: InboxCategory[] = custom.map((row) => {
      const cat: InboxCategory = {
        id: row.id,
        name: row.name,
        icon: row.icon,
        source: row.source,
        priority: row.priority,
      };
      if (row.rule !== null) {
        cat.rule = row.rule;
      }
      return cat;
    });

    const all = [...DEFAULT_CATEGORIES, ...customAsCategories].sort(
      (a, b) => a.priority - b.priority,
    );

    return c.json({ data: all });
  },
);

// POST /v1/inbox/categories — Create custom category
inbox.post(
  "/categories",
  requireScope("inbox:write"),
  validateBody(CreateCategorySchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof CreateCategorySchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const id = `custom_${Date.now()}`;

    const rows = await db
      .insert(inboxCategoriesTable)
      .values({
        id,
        accountId: auth.accountId,
        name: input.name,
        icon: input.icon,
        rule: input.rule,
        source: "user_rule",
        priority: input.priority,
      })
      .returning();

    const row = rows[0];
    if (!row) {
      return c.json(
        { error: { type: "server_error", message: "Failed to create category", code: "create_failed" } },
        500,
      );
    }

    const category: InboxCategory = {
      id: row.id,
      name: row.name,
      icon: row.icon,
      source: row.source,
      priority: row.priority,
    };
    if (row.rule !== null) {
      category.rule = row.rule;
    }

    return c.json({ data: category }, 201);
  },
);

export { inbox };
