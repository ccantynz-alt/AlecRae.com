import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireScope } from "../middleware/auth.js";
import { validateBody, getValidatedBody } from "../middleware/validator.js";
import { getDatabase, accounts, users, domains, emails, apiKeys, webhooks, templates } from "@emailed/db";

const account = new Hono();

// GET /v1/account — Get current account details
account.get("/", requireScope("messages:read"), async (c) => {
  const auth = c.get("auth");
  const db = getDatabase();

  const [record] = await db
    .select({
      id: accounts.id,
      name: accounts.name,
      planTier: accounts.planTier,
      billingEmail: accounts.billingEmail,
      emailsSentThisPeriod: accounts.emailsSentThisPeriod,
      periodStartedAt: accounts.periodStartedAt,
      createdAt: accounts.createdAt,
    })
    .from(accounts)
    .where(eq(accounts.id, auth.accountId))
    .limit(1);

  if (!record) {
    return c.json(
      {
        error: {
          type: "not_found",
          message: "Account not found",
          code: "account_not_found",
        },
      },
      404,
    );
  }

  return c.json({
    data: {
      id: record.id,
      name: record.name,
      planTier: record.planTier,
      billingEmail: record.billingEmail,
      emailsSentThisPeriod: record.emailsSentThisPeriod,
      periodStartedAt: record.periodStartedAt.toISOString(),
      createdAt: record.createdAt.toISOString(),
    },
  });
});

// ─── Schemas ───────────────────────────────────────────────────────────────

const UpdateProfileSchema = z.object({
  name: z.string().min(1).max(256).optional(),
  email: z.string().email().optional(),
}).refine((data) => data.name !== undefined || data.email !== undefined, {
  message: "At least one of name or email must be provided",
});

// PUT /v1/account/profile — Update the current user's profile
account.put(
  "/profile",
  requireScope("account:manage"),
  validateBody(UpdateProfileSchema),
  async (c) => {
    const auth = c.get("auth");
    const db = getDatabase();
    const input = getValidatedBody<z.infer<typeof UpdateProfileSchema>>(c);

    // Find the user associated with this account (owner)
    const [user] = await db
      .select({ id: users.id, email: users.email, name: users.name })
      .from(users)
      .where(eq(users.accountId, auth.accountId))
      .limit(1);

    if (!user) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: "User not found",
            code: "user_not_found",
          },
        },
        404,
      );
    }

    // If email is being changed, check it's not already taken
    if (input.email && input.email.toLowerCase() !== user.email) {
      const [existing] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, input.email.toLowerCase()))
        .limit(1);

      if (existing) {
        return c.json(
          {
            error: {
              type: "validation_error",
              message: "An account with this email already exists",
              code: "email_exists",
            },
          },
          409,
        );
      }
    }

    // Build the update payload
    const updateFields: Record<string, unknown> = {
      updatedAt: new Date(),
    };
    if (input.name !== undefined) updateFields["name"] = input.name;
    if (input.email !== undefined) updateFields["email"] = input.email.toLowerCase();

    // Update the user record
    await db
      .update(users)
      .set(updateFields)
      .where(eq(users.id, user.id));

    // If email changed, also update the account's billing email
    if (input.email !== undefined) {
      await db
        .update(accounts)
        .set({ billingEmail: input.email.toLowerCase(), updatedAt: new Date() })
        .where(eq(accounts.id, auth.accountId));
    }

    // Fetch the updated user
    const [updated] = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        accountId: users.accountId,
      })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);

    return c.json({
      data: updated,
    });
  },
);

// DELETE /v1/account — Delete the account and all associated data
account.delete("/", requireScope("account:manage"), async (c) => {
  const auth = c.get("auth");
  const db = getDatabase();

  // Verify the account exists
  const [record] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.id, auth.accountId))
    .limit(1);

  if (!record) {
    return c.json(
      {
        error: {
          type: "not_found",
          message: "Account not found",
          code: "account_not_found",
        },
      },
      404,
    );
  }

  // Delete in order of dependencies.
  // The users table has ON DELETE CASCADE from accounts, but other tables
  // reference accountId directly, so we delete them explicitly.

  // Delete webhooks
  await db.delete(webhooks).where(eq(webhooks.accountId, auth.accountId));

  // Delete templates
  await db.delete(templates).where(eq(templates.accountId, auth.accountId));

  // Delete API keys
  await db.delete(apiKeys).where(eq(apiKeys.accountId, auth.accountId));

  // Delete domains
  await db.delete(domains).where(eq(domains.accountId, auth.accountId));

  // Delete emails
  await db.delete(emails).where(eq(emails.accountId, auth.accountId));

  // Delete users (should cascade from account, but explicit is safer)
  await db.delete(users).where(eq(users.accountId, auth.accountId));

  // Finally, delete the account itself
  await db.delete(accounts).where(eq(accounts.id, auth.accountId));

  return c.json({ deleted: true });
});

export { account };
