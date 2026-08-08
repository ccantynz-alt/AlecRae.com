/**
 * Mailboxes Route — Native business-email addresses on hosted domains.
 *
 * POST   /v1/mailboxes      — Provision a mailbox (e.g. info@bookaride.co.nz)
 * GET    /v1/mailboxes      — List mailboxes for the account
 * PATCH  /v1/mailboxes/:id  — Update displayName / forwardTo / isActive
 * DELETE /v1/mailboxes/:id  — Remove a mailbox
 *
 * A mailbox can only be created on a domain that is registered AND verified for
 * the caller's account (see POST /v1/domains). Inbound mail to the mailbox is
 * routed to the account's inbox by the inbound service; sending as the mailbox
 * is already permitted because the account owns the verified domain.
 */

import { Hono } from "hono";
import { z } from "zod";
import { eq, and, desc, sql } from "drizzle-orm";
import crypto from "node:crypto";
import { requireScope } from "../middleware/auth.js";
import { validateBody, getValidatedBody } from "../middleware/validator.js";
import {
  getDatabase,
  mailboxes as mailboxesTable,
  domains as domainsTable,
  emails,
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

    // Normalise the address: local-part and domain are matched/stored
    // lowercase (email domains are case-insensitive; a mixed-case address must
    // resolve to the same mailbox and the same domain row).
    const normalizedAddress = input.address.trim().toLowerCase();
    const atIdx = normalizedAddress.indexOf("@");
    const localPart = normalizedAddress.slice(0, atIdx);
    const domainName = normalizedAddress.slice(atIdx + 1);

    // The domain must be registered + verified + active for this account.
    // Compared case-insensitively (lower() on both sides) so a domain that was
    // stored mixed-case before normalisation on write existed still resolves.
    const [domainRecord] = await db
      .select({
        id: domainsTable.id,
        verificationStatus: domainsTable.verificationStatus,
        isActive: domainsTable.isActive,
      })
      .from(domainsTable)
      .where(
        and(
          sql`lower(${domainsTable.domain}) = ${domainName}`,
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

    // address is globally unique (stored lowercase).
    const [existing] = await db
      .select({ id: mailboxesTable.id })
      .from(mailboxesTable)
      .where(eq(mailboxesTable.address, normalizedAddress))
      .limit(1);

    if (existing) {
      return c.json(
        {
          error: {
            type: "conflict_error",
            message: `Mailbox "${normalizedAddress}" already exists.`,
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
      address: normalizedAddress,
      displayName: input.displayName ?? null,
      forwardTo: input.forwardTo ?? null,
      isActive: true,
    });

    return c.json(
      {
        id,
        accountId: auth.accountId,
        address: normalizedAddress,
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

// GET /v1/mailboxes/unread-counts — unread inbox count per mailbox + catch-all
//
// The inbox count badge each mailbox shows in the switcher. Two bounded
// queries, never one-per-mailbox:
//
//  1. A LEFT JOIN grouped by mailbox — driven by the `mailboxes` table (bounded
//     by the account's mailbox count, not the message count), so a mailbox with
//     zero unread still returns a 0 row. The join matches an unread inbox
//     message when its `tags` array contains the mailbox's row id — the same
//     axis `deliveredTo` and the `?mailboxId=` filter resolve.
//  2. One count for the "unrouted" bucket: unread inbox mail carrying NONE of
//     this account's mailbox ids (the account-level catch-all), so catch-all
//     volume is visible rather than silently uncounted.
//
// Registered before the `/:id` routes; a static path, so no collision.
mailboxes.get("/unread-counts", requireScope("domains:manage"), async (c) => {
  const auth = c.get("auth");
  const db = getDatabase();

  const perMailbox = await db
    .select({
      mailboxId: mailboxesTable.id,
      address: mailboxesTable.address,
      unreadCount: sql<number>`count(${emails.id})::int`,
    })
    .from(mailboxesTable)
    .leftJoin(
      emails,
      and(
        eq(emails.accountId, mailboxesTable.accountId),
        eq(emails.folder, "inbox"),
        eq(emails.isRead, false),
        sql`${emails.tags} @> jsonb_build_array(${mailboxesTable.id})`,
      ),
    )
    .where(eq(mailboxesTable.accountId, auth.accountId))
    .groupBy(mailboxesTable.id, mailboxesTable.address);

  // Unrouted: reuse the mailbox ids we already have rather than re-querying.
  const unroutedConditions = [
    eq(emails.accountId, auth.accountId),
    eq(emails.folder, "inbox"),
    eq(emails.isRead, false),
  ];
  for (const mb of perMailbox) {
    unroutedConditions.push(
      sql`NOT (${emails.tags} @> ${JSON.stringify([mb.mailboxId])}::jsonb)`,
    );
  }
  const [unroutedRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(emails)
    .where(and(...unroutedConditions));

  return c.json({
    data: {
      mailboxes: perMailbox.map((r) => ({
        mailboxId: r.mailboxId,
        address: r.address,
        unreadCount: Number(r.unreadCount ?? 0),
      })),
      unrouted: Number(unroutedRow?.count ?? 0),
    },
  });
});

// PATCH /v1/mailboxes/:id — update a mailbox's mutable fields
//
// `address` (and its derived `localPart`/`domainId`) is deliberately NOT
// editable. Inbound routing resolves recipients by exact address
// (services/inbound/src/routing/router.ts `lookupMailbox`), and mail already
// delivered references the old one — renaming in place would silently strand
// anything still addressed to it. Changing an address is a delete plus a
// create, which makes that consequence visible.
//
// `isActive: false` is the reversible alternative to DELETE: the router treats
// an inactive mailbox as absent and falls through to the domain's catch-all,
// so mail keeps arriving at the account rather than bouncing.
const UpdateMailboxSchema = z
  .object({
    displayName: z.string().min(1).max(200).nullable().optional(),
    forwardTo: z.array(z.string().email()).max(20).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (v) =>
      v.displayName !== undefined ||
      v.forwardTo !== undefined ||
      v.isActive !== undefined,
    {
      message:
        "At least one of displayName, forwardTo, or isActive is required",
    },
  );

mailboxes.patch(
  "/:id",
  requireScope("domains:manage"),
  validateBody(UpdateMailboxSchema),
  async (c) => {
    const auth = c.get("auth");
    const id = c.req.param("id");
    const input = getValidatedBody<z.infer<typeof UpdateMailboxSchema>>(c);
    const db = getDatabase();

    // Resolve through the caller's own account, so a guessed id from another
    // tenant is a 404 rather than an update.
    const [row] = await db
      .select()
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

    await db
      .update(mailboxesTable)
      .set({
        ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
        ...(input.forwardTo !== undefined ? { forwardTo: input.forwardTo } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        updatedAt: new Date(),
      })
      .where(eq(mailboxesTable.id, id));

    const [updated] = await db
      .select()
      .from(mailboxesTable)
      .where(eq(mailboxesTable.id, id))
      .limit(1);

    return c.json(updated ?? row);
  },
);

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
