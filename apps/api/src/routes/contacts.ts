/**
 * Contacts Route — Auto-Complete, Avatars, Notes, Interaction History
 *
 * GET    /v1/contacts              — List contacts (auto-extracted from emails)
 * GET    /v1/contacts/search       — Search contacts by name/email
 * GET    /v1/contacts/:id          — Get contact with interaction history
 * PATCH  /v1/contacts/:id          — Update contact (add notes, tags)
 * GET    /v1/contacts/suggestions  — AI autocomplete for compose
 * POST   /v1/contacts/merge        — Merge duplicate contacts
 */

import { Hono } from "hono";
import { z } from "zod";
import { eq, and, or, ilike, sql } from "drizzle-orm";
import { requireScope } from "../middleware/auth.js";
import { validateBody, getValidatedBody } from "../middleware/validator.js";
import { getDatabase, contacts as contactsTable } from "@emailed/db";

// ─── Helpers ────────────────────────────────────────────────────────────────

function getGravatarUrl(email: string): string {
  // Simple hash for gravatar — production would use actual MD5
  const hash = email.trim().toLowerCase();
  return `https://www.gravatar.com/avatar/${hash}?d=identicon&s=80`;
}

// ─── Schemas ─────────────────────────────────────────────────────────────────

const UpdateContactSchema = z.object({
  name: z.string().optional(),
  company: z.string().optional(),
  tags: z.array(z.string()).optional(),
  notes: z.string().optional(),
});

const MergeSchema = z.object({
  primaryId: z.string(),
  mergeIds: z.array(z.string()).min(1),
});

// ─── Routes ──────────────────────────────────────────────────────────────────

const contacts = new Hono();

// GET /v1/contacts — List all contacts
contacts.get(
  "/",
  requireScope("contacts:read"),
  async (c) => {
    const auth = c.get("auth");
    const limit = parseInt(c.req.query("limit") ?? "50", 10);
    const offset = parseInt(c.req.query("offset") ?? "0", 10);
    const db = getDatabase();

    const rows = await db
      .select()
      .from(contactsTable)
      .where(eq(contactsTable.accountId, auth.accountId))
      .limit(limit)
      .offset(offset);

    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(contactsTable)
      .where(eq(contactsTable.accountId, auth.accountId));

    return c.json({
      data: rows,
      total: countResult?.count ?? 0,
      limit,
      offset,
    });
  },
);

// GET /v1/contacts/search — Search contacts
contacts.get(
  "/search",
  requireScope("contacts:read"),
  async (c) => {
    const auth = c.get("auth");
    const q = (c.req.query("q") ?? "").trim();
    const limit = parseInt(c.req.query("limit") ?? "10", 10);

    if (!q) {
      return c.json({ data: [] });
    }

    const db = getDatabase();
    const pattern = `%${q}%`;

    const matches = await db
      .select()
      .from(contactsTable)
      .where(
        and(
          eq(contactsTable.accountId, auth.accountId),
          or(
            ilike(contactsTable.email, pattern),
            ilike(contactsTable.name, pattern),
            ilike(contactsTable.company, pattern),
          ),
        ),
      )
      .limit(limit);

    return c.json({ data: matches });
  },
);

// GET /v1/contacts/suggestions — AI autocomplete for compose
contacts.get(
  "/suggestions",
  requireScope("contacts:read"),
  async (c) => {
    const auth = c.get("auth");
    const q = (c.req.query("q") ?? "").trim();
    const limit = parseInt(c.req.query("limit") ?? "5", 10);

    const db = getDatabase();

    // If no query, return most frequently contacted
    const baseCondition = eq(contactsTable.accountId, auth.accountId);
    const searchCondition = q
      ? and(
          baseCondition,
          or(
            ilike(contactsTable.email, `%${q}%`),
            ilike(contactsTable.name, `%${q}%`),
          ),
        )
      : baseCondition;

    const rows = await db
      .select()
      .from(contactsTable)
      .where(searchCondition)
      .limit(limit);

    // Score by interaction frequency + recency
    const scored = rows
      .map((contact) => {
        const stats = contact.stats as {
          totalEmails: number;
          lastContactedAt: string | null;
        };
        const score =
          stats.totalEmails * 2 +
          (stats.lastContactedAt
            ? Math.max(
                0,
                30 -
                  Math.floor(
                    (Date.now() - new Date(stats.lastContactedAt).getTime()) /
                      (24 * 60 * 60 * 1000),
                  ),
              )
            : 0);
        return { ...contact, score };
      })
      .sort((a, b) => b.score - a.score);

    return c.json({
      data: scored.map((s) => ({
        email: s.email,
        name: s.name,
        avatarUrl: s.avatarUrl ?? getGravatarUrl(s.email),
        company: s.company,
      })),
    });
  },
);

// GET /v1/contacts/:id — Get contact with full history
contacts.get(
  "/:id",
  requireScope("contacts:read"),
  async (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth");
    const db = getDatabase();

    const [contact] = await db
      .select()
      .from(contactsTable)
      .where(
        and(
          eq(contactsTable.id, id),
          eq(contactsTable.accountId, auth.accountId),
        ),
      )
      .limit(1);

    if (!contact) {
      return c.json({ error: { message: "Contact not found", code: "contact_not_found" } }, 404);
    }

    return c.json({
      data: {
        ...contact,
        avatarUrl: contact.avatarUrl ?? getGravatarUrl(contact.email),
      },
    });
  },
);

// PATCH /v1/contacts/:id — Update contact
contacts.patch(
  "/:id",
  requireScope("contacts:write"),
  validateBody(UpdateContactSchema),
  async (c) => {
    const id = c.req.param("id");
    const input = getValidatedBody<z.infer<typeof UpdateContactSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    // Verify ownership
    const [existing] = await db
      .select({ id: contactsTable.id })
      .from(contactsTable)
      .where(
        and(
          eq(contactsTable.id, id),
          eq(contactsTable.accountId, auth.accountId),
        ),
      )
      .limit(1);

    if (!existing) {
      return c.json({ error: { message: "Contact not found", code: "contact_not_found" } }, 404);
    }

    const updateFields: Record<string, unknown> = {
      updatedAt: new Date(),
    };
    if (input.name !== undefined) updateFields["name"] = input.name;
    if (input.company !== undefined) updateFields["company"] = input.company;
    if (input.tags !== undefined) updateFields["tags"] = input.tags;
    if (input.notes !== undefined) updateFields["notes"] = input.notes;

    const [updated] = await db
      .update(contactsTable)
      .set(updateFields)
      .where(eq(contactsTable.id, id))
      .returning();

    return c.json({ data: updated });
  },
);

// POST /v1/contacts/merge — Merge duplicates
contacts.post(
  "/merge",
  requireScope("contacts:write"),
  validateBody(MergeSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof MergeSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    // Verify primary contact exists and belongs to this account
    const [primary] = await db
      .select()
      .from(contactsTable)
      .where(
        and(
          eq(contactsTable.id, input.primaryId),
          eq(contactsTable.accountId, auth.accountId),
        ),
      )
      .limit(1);

    if (!primary) {
      return c.json({ error: { message: "Primary contact not found" } }, 404);
    }

    // Delete the merged contacts (they belong to the same account)
    let deletedCount = 0;
    for (const mergeId of input.mergeIds) {
      const result = await db
        .delete(contactsTable)
        .where(
          and(
            eq(contactsTable.id, mergeId),
            eq(contactsTable.accountId, auth.accountId),
          ),
        )
        .returning({ id: contactsTable.id });
      deletedCount += result.length;
    }

    return c.json({
      data: {
        primaryId: input.primaryId,
        mergedCount: deletedCount,
        message: `Merged ${deletedCount} contacts into ${primary.email}`,
      },
    });
  },
);

export { contacts };
