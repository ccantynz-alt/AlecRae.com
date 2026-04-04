import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { requireScope } from "../middleware/auth.js";
import { getDatabase, accounts } from "@emailed/db";

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

export { account };
