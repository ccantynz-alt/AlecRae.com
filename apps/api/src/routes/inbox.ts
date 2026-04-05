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
import { requireScope } from "../middleware/auth.js";
import { validateBody, getValidatedBody } from "../middleware/validator.js";
import {
  classifyEmail,
  screenSender,
  getScreenerDecision,
  extractCommitments,
  detectFollowUpNeeded,
  DEFAULT_CATEGORIES,
  type InboxCategory,
  type Commitment,
  type ScreenerEntry,
} from "@emailed/ai-engine/inbox";

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
  icon: z.string().max(4).default("📁"),
  rule: z.string().min(1).max(500),
  priority: z.number().int().min(1).max(98).default(50),
});

const inbox = new Hono();

// In-memory stores (production: use DB)
const customCategories = new Map<string, InboxCategory[]>();
const commitmentStore = new Map<string, Commitment[]>();
const screenerQueue = new Map<string, ScreenerEntry[]>();

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

    // Store commitments
    if (result.commitments.length > 0) {
      const existing = commitmentStore.get(auth.accountId) ?? [];
      commitmentStore.set(auth.accountId, [...existing, ...result.commitments]);
    }

    // If screening required, add to screener queue
    if (result.requiresScreening) {
      const queue = screenerQueue.get(auth.accountId) ?? [];
      queue.push({
        senderId: input.from,
        senderEmail: input.from,
        senderName: input.fromName,
        firstEmailId: input.emailId,
        firstEmailSubject: input.subject,
        firstEmailSnippet: input.body.slice(0, 200),
        receivedAt: new Date(),
        aiAssessment: {
          isLikelySpam: false,
          isLikelyNewsletter: result.isNewsletter,
          isLikelyImportant: result.category.id === "important",
          reasoning: result.reasoning,
        },
      });
      screenerQueue.set(auth.accountId, queue);
    }

    return c.json({ data: result });
  },
);

// GET /v1/inbox/screener — List pending screener entries
inbox.get(
  "/screener",
  requireScope("inbox:read"),
  (c) => {
    const auth = c.get("auth");
    const queue = screenerQueue.get(auth.accountId) ?? [];
    return c.json({ data: queue });
  },
);

// POST /v1/inbox/screener/decide — Approve or block a sender
inbox.post(
  "/screener/decide",
  requireScope("inbox:write"),
  validateBody(ScreenerDecisionSchema),
  (c) => {
    const input = getValidatedBody<z.infer<typeof ScreenerDecisionSchema>>(c);
    const auth = c.get("auth");

    screenSender(auth.accountId, input.senderEmail, input.decision);

    // Remove from screener queue
    const queue = screenerQueue.get(auth.accountId) ?? [];
    screenerQueue.set(
      auth.accountId,
      queue.filter((e) => e.senderEmail !== input.senderEmail),
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
  (c) => {
    const auth = c.get("auth");
    const commitments = commitmentStore.get(auth.accountId) ?? [];
    const status = c.req.query("status");

    const filtered = status
      ? commitments.filter((co) => co.status === status)
      : commitments;

    return c.json({ data: filtered });
  },
);

// PATCH /v1/inbox/commitments/:id — Update commitment status
inbox.patch(
  "/commitments/:id",
  requireScope("inbox:write"),
  validateBody(CommitmentUpdateSchema),
  (c) => {
    const id = c.req.param("id");
    const input = getValidatedBody<z.infer<typeof CommitmentUpdateSchema>>(c);
    const auth = c.get("auth");

    const commitments = commitmentStore.get(auth.accountId) ?? [];
    const commitment = commitments.find((co) => co.id === id);

    if (!commitment) {
      return c.json(
        { error: { type: "not_found", message: "Commitment not found", code: "commitment_not_found" } },
        404,
      );
    }

    commitment.status = input.status;
    return c.json({ data: commitment });
  },
);

// GET /v1/inbox/follow-ups — Get follow-up nudges
inbox.get(
  "/follow-ups",
  requireScope("inbox:read"),
  (c) => {
    const auth = c.get("auth");
    // In production, query sent emails from DB
    const nudges = detectFollowUpNeeded([]);
    return c.json({ data: nudges });
  },
);

// GET /v1/inbox/categories — List all categories (system + custom)
inbox.get(
  "/categories",
  requireScope("inbox:read"),
  (c) => {
    const auth = c.get("auth");
    const custom = customCategories.get(auth.accountId) ?? [];
    const all = [...DEFAULT_CATEGORIES, ...custom].sort((a, b) => a.priority - b.priority);
    return c.json({ data: all });
  },
);

// POST /v1/inbox/categories — Create custom category
inbox.post(
  "/categories",
  requireScope("inbox:write"),
  validateBody(CreateCategorySchema),
  (c) => {
    const input = getValidatedBody<z.infer<typeof CreateCategorySchema>>(c);
    const auth = c.get("auth");

    const category: InboxCategory = {
      id: `custom_${Date.now()}`,
      name: input.name,
      icon: input.icon,
      rule: input.rule,
      source: "user_rule",
      priority: input.priority,
    };

    const existing = customCategories.get(auth.accountId) ?? [];
    customCategories.set(auth.accountId, [...existing, category]);

    return c.json({ data: category }, 201);
  },
);

export { inbox };
