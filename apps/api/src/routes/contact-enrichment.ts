/**
 * Contact Enrichment Route — Auto-pull company info, social profiles from email
 *
 * POST   /v1/contacts/:contactId/enrich      — Trigger enrichment for a contact
 * GET    /v1/contacts/:contactId/enrichment   — Get enrichment data
 * POST   /v1/contacts/enrich-batch            — Batch enrich multiple contacts
 * DELETE /v1/contacts/:contactId/enrichment   — Clear enrichment data
 */

import { Hono } from "hono";
import { z } from "zod";
import { eq, and, inArray } from "drizzle-orm";
import { requireScope } from "../middleware/auth.js";
import {
  validateBody,
  getValidatedBody,
} from "../middleware/validator.js";
import { getDatabase, contacts, contactEnrichments } from "@alecrae/db";
import type { EnrichmentData } from "@alecrae/db";

// ─── Schemas ──────────────────────────────────────────────────────────────────

const BatchEnrichSchema = z.object({
  contactIds: z.array(z.string()).min(1).max(100),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Placeholder enrichment function — extracts domain from email address and
 * returns mock enrichment data. The real AI enrichment pipeline (DNS MX
 * lookups, domain WHOIS, public profile APIs, Claude for synthesis) connects
 * later. This function defines the shape and contract.
 */
function enrichFromEmail(email: string): {
  data: EnrichmentData;
  confidence: number;
} {
  const domain = email.split("@")[1] ?? "unknown.com";
  const localPart = email.split("@")[0] ?? "";

  // Derive a plausible name from the local part (john.doe → John Doe)
  const nameParts = localPart
    .replace(/[._-]/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase());
  const derivedName = nameParts.length > 0 ? nameParts.join(" ") : undefined;

  // Known free email providers — low enrichment confidence
  const freeProviders = new Set([
    "gmail.com",
    "yahoo.com",
    "hotmail.com",
    "outlook.com",
    "icloud.com",
    "protonmail.com",
    "aol.com",
    "mail.com",
    "zoho.com",
  ]);

  const isFreeProvider = freeProviders.has(domain.toLowerCase());

  const data: EnrichmentData = {
    fullName: derivedName,
    companyDomain: isFreeProvider ? undefined : domain,
    company: isFreeProvider
      ? undefined
      : domain
          .replace(/\.(com|io|co|org|net|dev)$/, "")
          .split(".")
          .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
          .join(" "),
  };

  return {
    data,
    confidence: isFreeProvider ? 0.2 : 0.5,
  };
}

// ─── Routes ───────────────────────────────────────────────────────────────────

const contactEnrichmentRouter = new Hono();

// POST /v1/contacts/:contactId/enrich — Trigger enrichment for a contact
contactEnrichmentRouter.post(
  "/:contactId/enrich",
  requireScope("contacts:write"),
  async (c) => {
    const contactId = c.req.param("contactId");
    const auth = c.get("auth");
    const db = getDatabase();

    // Verify the contact exists and belongs to this account
    const [contact] = await db
      .select({ id: contacts.id, email: contacts.email })
      .from(contacts)
      .where(
        and(
          eq(contacts.id, contactId),
          eq(contacts.accountId, auth.accountId),
        ),
      )
      .limit(1);

    if (!contact) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Contact ${contactId} not found`,
            code: "contact_not_found",
          },
        },
        404,
      );
    }

    const enrichment = enrichFromEmail(contact.email);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days

    // Check if enrichment already exists for this contact
    const [existing] = await db
      .select({ id: contactEnrichments.id })
      .from(contactEnrichments)
      .where(eq(contactEnrichments.contactId, contactId))
      .limit(1);

    if (existing) {
      // Update existing enrichment
      await db
        .update(contactEnrichments)
        .set({
          email: contact.email,
          data: enrichment.data,
          confidence: enrichment.confidence,
          source: "ai",
          enrichedAt: now,
          expiresAt,
        })
        .where(eq(contactEnrichments.id, existing.id));

      return c.json({
        data: {
          id: existing.id,
          contactId,
          email: contact.email,
          data: enrichment.data,
          confidence: enrichment.confidence,
          source: "ai",
          enrichedAt: now.toISOString(),
          expiresAt: expiresAt.toISOString(),
        },
      });
    }

    // Create new enrichment record
    const id = generateId();

    await db.insert(contactEnrichments).values({
      id,
      contactId,
      email: contact.email,
      data: enrichment.data,
      confidence: enrichment.confidence,
      source: "ai",
      enrichedAt: now,
      expiresAt,
    });

    return c.json(
      {
        data: {
          id,
          contactId,
          email: contact.email,
          data: enrichment.data,
          confidence: enrichment.confidence,
          source: "ai",
          enrichedAt: now.toISOString(),
          expiresAt: expiresAt.toISOString(),
        },
      },
      201,
    );
  },
);

// GET /v1/contacts/:contactId/enrichment — Get enrichment data
contactEnrichmentRouter.get(
  "/:contactId/enrichment",
  requireScope("contacts:read"),
  async (c) => {
    const contactId = c.req.param("contactId");
    const auth = c.get("auth");
    const db = getDatabase();

    // Verify the contact belongs to this account
    const [contact] = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(
        and(
          eq(contacts.id, contactId),
          eq(contacts.accountId, auth.accountId),
        ),
      )
      .limit(1);

    if (!contact) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Contact ${contactId} not found`,
            code: "contact_not_found",
          },
        },
        404,
      );
    }

    const [enrichment] = await db
      .select()
      .from(contactEnrichments)
      .where(eq(contactEnrichments.contactId, contactId))
      .limit(1);

    if (!enrichment) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `No enrichment data for contact ${contactId}`,
            code: "enrichment_not_found",
          },
        },
        404,
      );
    }

    return c.json({
      data: {
        id: enrichment.id,
        contactId: enrichment.contactId,
        email: enrichment.email,
        data: enrichment.data,
        confidence: enrichment.confidence,
        source: enrichment.source,
        enrichedAt: enrichment.enrichedAt.toISOString(),
        expiresAt: enrichment.expiresAt?.toISOString() ?? null,
      },
    });
  },
);

// POST /v1/contacts/enrich-batch — Batch enrich multiple contacts
contactEnrichmentRouter.post(
  "/enrich-batch",
  requireScope("contacts:write"),
  validateBody(BatchEnrichSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof BatchEnrichSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    // Fetch all requested contacts that belong to this account
    const contactRows = await db
      .select({ id: contacts.id, email: contacts.email })
      .from(contacts)
      .where(
        and(
          inArray(contacts.id, input.contactIds),
          eq(contacts.accountId, auth.accountId),
        ),
      );

    if (contactRows.length === 0) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: "No matching contacts found",
            code: "contacts_not_found",
          },
        },
        404,
      );
    }

    // Fetch existing enrichments for these contacts
    const contactIdList = contactRows.map((r) => r.id);
    const existingEnrichments = await db
      .select({ id: contactEnrichments.id, contactId: contactEnrichments.contactId })
      .from(contactEnrichments)
      .where(inArray(contactEnrichments.contactId, contactIdList));

    const existingByContactId = new Map(
      existingEnrichments.map((e) => [e.contactId, e.id]),
    );

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const results: Array<{
      contactId: string;
      email: string;
      data: EnrichmentData;
      confidence: number;
    }> = [];

    for (const contact of contactRows) {
      const enrichment = enrichFromEmail(contact.email);
      const existingId = existingByContactId.get(contact.id);

      if (existingId) {
        await db
          .update(contactEnrichments)
          .set({
            email: contact.email,
            data: enrichment.data,
            confidence: enrichment.confidence,
            source: "ai",
            enrichedAt: now,
            expiresAt,
          })
          .where(eq(contactEnrichments.id, existingId));
      } else {
        const id = generateId();
        await db.insert(contactEnrichments).values({
          id,
          contactId: contact.id,
          email: contact.email,
          data: enrichment.data,
          confidence: enrichment.confidence,
          source: "ai",
          enrichedAt: now,
          expiresAt,
        });
      }

      results.push({
        contactId: contact.id,
        email: contact.email,
        data: enrichment.data,
        confidence: enrichment.confidence,
      });
    }

    return c.json({
      data: {
        enriched: results.length,
        notFound: input.contactIds.length - contactRows.length,
        results,
      },
    });
  },
);

// DELETE /v1/contacts/:contactId/enrichment — Clear enrichment data
contactEnrichmentRouter.delete(
  "/:contactId/enrichment",
  requireScope("contacts:write"),
  async (c) => {
    const contactId = c.req.param("contactId");
    const auth = c.get("auth");
    const db = getDatabase();

    // Verify the contact belongs to this account
    const [contact] = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(
        and(
          eq(contacts.id, contactId),
          eq(contacts.accountId, auth.accountId),
        ),
      )
      .limit(1);

    if (!contact) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Contact ${contactId} not found`,
            code: "contact_not_found",
          },
        },
        404,
      );
    }

    const [existing] = await db
      .select({ id: contactEnrichments.id })
      .from(contactEnrichments)
      .where(eq(contactEnrichments.contactId, contactId))
      .limit(1);

    if (!existing) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `No enrichment data for contact ${contactId}`,
            code: "enrichment_not_found",
          },
        },
        404,
      );
    }

    await db
      .delete(contactEnrichments)
      .where(eq(contactEnrichments.contactId, contactId));

    return c.json({ deleted: true, contactId });
  },
);

export { contactEnrichmentRouter };
