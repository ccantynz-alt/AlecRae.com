import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireScope } from "../middleware/auth.js";
import { validateBody, getValidatedBody } from "../middleware/validator.js";
import { getDatabase, accounts, users } from "@alecrae/db";

const account = new Hono();

const UpdateProfileSchema = z.object({
  name: z.string().trim().min(1).max(256).optional(),
  accountName: z.string().trim().min(1).max(256).optional(),
  billingEmail: z.string().email().optional(),
});

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

// PATCH /v1/account — Update profile (user's name, account name, billing email)
account.patch(
  "/",
  requireScope("account:manage"),
  validateBody(UpdateProfileSchema),
  async (c) => {
    const auth = c.get("auth");
    const input = getValidatedBody<z.infer<typeof UpdateProfileSchema>>(c);
    const db = getDatabase();

    if (input.name !== undefined && auth.userId) {
      await db.update(users).set({ name: input.name }).where(eq(users.id, auth.userId));
    }

    const accountUpdates: Record<string, unknown> = {};
    if (input.accountName !== undefined) accountUpdates.name = input.accountName;
    if (input.billingEmail !== undefined) accountUpdates.billingEmail = input.billingEmail;
    if (Object.keys(accountUpdates).length > 0) {
      await db.update(accounts).set(accountUpdates).where(eq(accounts.id, auth.accountId));
    }

    return c.json({ data: { success: true } });
  },
);

export { account };
