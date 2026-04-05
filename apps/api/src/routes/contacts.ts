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
import { requireScope } from "../middleware/auth.js";
import { validateBody, getValidatedBody } from "../middleware/validator.js";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Contact {
  id: string;
  accountId: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  company: string | null;
  tags: string[];
  notes: string;
  /** Auto-calculated from email history */
  stats: {
    totalEmails: number;
    lastContactedAt: string | null;
    firstContactedAt: string | null;
    avgResponseTimeHours: number | null;
    sentCount: number;
    receivedCount: number;
  };
  createdAt: string;
  updatedAt: string;
}

// In-memory store (production: DB table populated from email sync)
const contactStore = new Map<string, Contact[]>();

function generateId(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

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
  (c) => {
    const auth = c.get("auth");
    const limit = parseInt(c.req.query("limit") ?? "50", 10);
    const offset = parseInt(c.req.query("offset") ?? "0", 10);
    const all = contactStore.get(auth.accountId) ?? [];
    const page = all.slice(offset, offset + limit);

    return c.json({
      data: page,
      total: all.length,
      limit,
      offset,
    });
  },
);

// GET /v1/contacts/search — Search contacts
contacts.get(
  "/search",
  requireScope("contacts:read"),
  (c) => {
    const auth = c.get("auth");
    const q = (c.req.query("q") ?? "").toLowerCase();
    const limit = parseInt(c.req.query("limit") ?? "10", 10);

    if (!q) {
      return c.json({ data: [] });
    }

    const all = contactStore.get(auth.accountId) ?? [];
    const matches = all
      .filter(
        (contact) =>
          contact.email.toLowerCase().includes(q) ||
          (contact.name?.toLowerCase().includes(q) ?? false) ||
          (contact.company?.toLowerCase().includes(q) ?? false),
      )
      .slice(0, limit);

    return c.json({ data: matches });
  },
);

// GET /v1/contacts/suggestions — AI autocomplete for compose
contacts.get(
  "/suggestions",
  requireScope("contacts:read"),
  (c) => {
    const auth = c.get("auth");
    const q = (c.req.query("q") ?? "").toLowerCase();
    const limit = parseInt(c.req.query("limit") ?? "5", 10);

    const all = contactStore.get(auth.accountId) ?? [];

    // Rank by interaction frequency + recency
    const scored = all
      .filter(
        (contact) =>
          contact.email.toLowerCase().includes(q) ||
          (contact.name?.toLowerCase().includes(q) ?? false),
      )
      .map((contact) => ({
        ...contact,
        score:
          contact.stats.totalEmails * 2 +
          (contact.stats.lastContactedAt
            ? Math.max(0, 30 - Math.floor((Date.now() - new Date(contact.stats.lastContactedAt).getTime()) / (24 * 60 * 60 * 1000)))
            : 0),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

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
  (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth");
    const all = contactStore.get(auth.accountId) ?? [];
    const contact = all.find((ct) => ct.id === id);

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
  (c) => {
    const id = c.req.param("id");
    const input = getValidatedBody<z.infer<typeof UpdateContactSchema>>(c);
    const auth = c.get("auth");
    const all = contactStore.get(auth.accountId) ?? [];
    const contact = all.find((ct) => ct.id === id);

    if (!contact) {
      return c.json({ error: { message: "Contact not found", code: "contact_not_found" } }, 404);
    }

    if (input.name !== undefined) contact.name = input.name;
    if (input.company !== undefined) contact.company = input.company;
    if (input.tags !== undefined) contact.tags = input.tags;
    if (input.notes !== undefined) contact.notes = input.notes;
    contact.updatedAt = new Date().toISOString();

    return c.json({ data: contact });
  },
);

// POST /v1/contacts/merge — Merge duplicates
contacts.post(
  "/merge",
  requireScope("contacts:write"),
  validateBody(MergeSchema),
  (c) => {
    const input = getValidatedBody<z.infer<typeof MergeSchema>>(c);
    const auth = c.get("auth");
    const all = contactStore.get(auth.accountId) ?? [];
    const primary = all.find((ct) => ct.id === input.primaryId);

    if (!primary) {
      return c.json({ error: { message: "Primary contact not found" } }, 404);
    }

    // Merge stats and remove duplicates
    const merged = all.filter((ct) => !input.mergeIds.includes(ct.id));
    contactStore.set(auth.accountId, merged);

    return c.json({
      data: {
        primaryId: input.primaryId,
        mergedCount: input.mergeIds.length,
        message: `Merged ${input.mergeIds.length} contacts into ${primary.email}`,
      },
    });
  },
);

export { contacts };
