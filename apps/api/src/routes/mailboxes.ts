/**
 * Mailboxes Route — Native business-email addresses on hosted domains.
 *
 * POST   /v1/mailboxes      — Provision a mailbox (e.g. info@bookaride.co.nz)
 * GET    /v1/mailboxes      — List mailboxes for the account
 * DELETE /v1/mailboxes/:id  — Remove a mailbox
 *
 * A mailbox can only be created on a domain that is registered AND verified for
 * the caller's account (see POST /v1/domains). Inbound mail to the mailbox is
 * routed to the account's inbox by the inbound service; sending as the mailbox
 * is already permitted because the account owns the verified domain.
 */

import { Hono } from "hono";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import crypto from "node:crypto";
import { requireScope } from "../middleware/auth.js";
import { validateBody, getValidatedBody } from "../middleware/validator.js";
import {
  getDatabase,
  mailboxes as mailboxesTable,
  domains as domainsTable,
} from "@alecrae/db";

const mailboxes = new Hono();

function genId(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

const CreateMailboxSchema = z.object({
  address: z
    .string()
    .email()
    .transform((s) => s.toLowerCase()),
  displayName: z.string().min(1).max(200).optional(),
  forwardTo: z.array(z.string().email()).max(20).optional(),
});

// POST /v1/mailboxes — provision a native mailbox on a verified domain
mailboxes.post(
  "/",
  requireScope("domains:manage"),
  validateBody(CreateMailboxSchema),
  async (c) => {
    const auth = c.get("auth");
    const input = getValidatedBody<z.infer<typeof CreateMailboxSchema>>(c);
    const db = getDatabase();

    const atIdx = input.address.indexOf("@");
    const localPart = input.address.slice(0, atIdx);
    const domainName = input.address.slice(atIdx + 1);

    // The domain must be registered + verified + active for this account.
    const [domainRecord] = await db
      .select({
        id: domainsTable.id,
        verificationStatus: domainsTable.verificationStatus,
        isActive: domainsTable.isActive,
      })
      .from(domainsTable)
      .where(
        and(
          eq(domainsTable.domain, domainName),
          eq(domainsTable.accountId, auth.accountId),
        ),
      )
      .limit(1);

    if (!domainRecord) {
      return c.json(
        {
          error: {
            type: "validation_error",
            message: `Domain "${domainName}" is not registered for this account. Add it via POST /v1/domains first.`,
            code: "domain_not_found",
          },
        },
        400,
      );
    }

    if (domainRecord.verificationStatus !== "verified" || !domainRecord.isActive) {
      return c.json(
        {
          error: {
            type: "conflict_error",
            message: `Domain "${domainName}" is not verified/active yet. Verify it via POST /v1/domains/${domainRecord.id}/verify before provisioning mailboxes.`,
            code: "domain_not_verified",
          },
        },
        409,
      );
    }

    // address is globally unique.
    const [existing] = await db
      .select({ id: mailboxesTable.id })
      .from(mailboxesTable)
      .where(eq(mailboxesTable.address, input.address))
      .limit(1);

    if (existing) {
      return c.json(
        {
          error: {
            type: "conflict_error",
            message: `Mailbox "${input.address}" already exists.`,
            code: "mailbox_exists",
          },
        },
        409,
      );
    }

    const id = genId();
    await db.insert(mailboxesTable).values({
      id,
      accountId: auth.accountId,
      domainId: domainRecord.id,
      localPart,
      address: input.address,
      displayName: input.displayName ?? null,
      forwardTo: input.forwardTo ?? null,
      isActive: true,
    });

    return c.json(
      {
        id,
        accountId: auth.accountId,
        address: input.address,
        localPart,
        domainId: domainRecord.id,
        displayName: input.displayName ?? null,
        forwardTo: input.forwardTo ?? null,
        isActive: true,
      },
      201,
    );
  },
);

// GET /v1/mailboxes — list mailboxes for the account
mailboxes.get("/", requireScope("domains:manage"), async (c) => {
  const auth = c.get("auth");
  const db = getDatabase();
  const rows = await db
    .select()
    .from(mailboxesTable)
    .where(eq(mailboxesTable.accountId, auth.accountId))
    .orderBy(desc(mailboxesTable.createdAt));
  return c.json({ data: rows });
});

// DELETE /v1/mailboxes/:id — remove a mailbox
mailboxes.delete("/:id", requireScope("domains:manage"), async (c) => {
  const auth = c.get("auth");
  const id = c.req.param("id");
  const db = getDatabase();

  const [row] = await db
    .select({ id: mailboxesTable.id })
    .from(mailboxesTable)
    .where(
      and(eq(mailboxesTable.id, id), eq(mailboxesTable.accountId, auth.accountId)),
    )
    .limit(1);

  if (!row) {
    return c.json(
      {
        error: {
          type: "not_found_error",
          message: "Mailbox not found.",
          code: "mailbox_not_found",
        },
      },
      404,
    );
  }

  await db.delete(mailboxesTable).where(eq(mailboxesTable.id, id));
  return c.json({ deleted: true, id });
});

export { mailboxes };
