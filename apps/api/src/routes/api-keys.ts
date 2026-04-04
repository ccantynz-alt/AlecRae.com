import { Hono } from "hono";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { requireScope } from "../middleware/auth.js";
import { validateBody, getValidatedBody } from "../middleware/validator.js";
import { getDatabase, apiKeys } from "@emailed/db";

const apiKeysRouter = new Hono();

function generateId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hashKey(key: string): Promise<string> {
  const data = new TextEncoder().encode(key);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const CreateApiKeySchema = z.object({
  name: z.string().min(1).max(256),
  permissions: z.object({
    sendEmail: z.boolean().default(true),
    readEmail: z.boolean().default(true),
    manageDomains: z.boolean().default(false),
    manageApiKeys: z.boolean().default(false),
    manageWebhooks: z.boolean().default(false),
    viewAnalytics: z.boolean().default(true),
    manageAccount: z.boolean().default(false),
    manageTeamMembers: z.boolean().default(false),
  }),
  environment: z.enum(["live", "test"]).default("live"),
  expiresAt: z.string().datetime().optional(),
});

// POST /v1/api-keys — Create a new API key
apiKeysRouter.post(
  "/",
  requireScope("api_keys:manage"),
  validateBody(CreateApiKeySchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof CreateApiKeySchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const id = generateId();

    // Generate the raw key: em_live_<random> or em_test_<random>
    const randomPart = Array.from(crypto.getRandomValues(new Uint8Array(24)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const rawKey = `em_${input.environment}_${randomPart}`;
    const keyPrefix = rawKey.slice(0, 16);
    const keyHash = await hashKey(rawKey);

    await db.insert(apiKeys).values({
      id,
      accountId: auth.accountId,
      name: input.name,
      keyPrefix,
      keyHash,
      permissions: input.permissions,
      environment: input.environment,
      isActive: true,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    });

    // Return the full key ONCE — it cannot be retrieved again
    return c.json(
      {
        data: {
          id,
          name: input.name,
          key: rawKey,
          keyPrefix,
          permissions: input.permissions,
          environment: input.environment,
          expiresAt: input.expiresAt ?? null,
          createdAt: new Date().toISOString(),
        },
      },
      201,
    );
  },
);

// GET /v1/api-keys — List all API keys for the account
apiKeysRouter.get("/", requireScope("api_keys:manage"), async (c) => {
  const auth = c.get("auth");
  const db = getDatabase();

  const rows = await db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      keyPrefix: apiKeys.keyPrefix,
      permissions: apiKeys.permissions,
      environment: apiKeys.environment,
      isActive: apiKeys.isActive,
      lastUsedAt: apiKeys.lastUsedAt,
      expiresAt: apiKeys.expiresAt,
      createdAt: apiKeys.createdAt,
      revokedAt: apiKeys.revokedAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.accountId, auth.accountId))
    .orderBy(desc(apiKeys.createdAt));

  const data = rows.map((r) => ({
    id: r.id,
    name: r.name,
    keyPrefix: r.keyPrefix,
    permissions: r.permissions,
    environment: r.environment,
    isActive: r.isActive,
    lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
    expiresAt: r.expiresAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    revokedAt: r.revokedAt?.toISOString() ?? null,
  }));

  return c.json({ data });
});

// DELETE /v1/api-keys/:id — Revoke an API key
apiKeysRouter.delete("/:id", requireScope("api_keys:manage"), async (c) => {
  const id = c.req.param("id");
  const auth = c.get("auth");
  const db = getDatabase();

  const [existing] = await db
    .select({ id: apiKeys.id })
    .from(apiKeys)
    .where(and(eq(apiKeys.id, id), eq(apiKeys.accountId, auth.accountId)))
    .limit(1);

  if (!existing) {
    return c.json(
      {
        error: {
          type: "not_found",
          message: `API key ${id} not found`,
          code: "api_key_not_found",
        },
      },
      404,
    );
  }

  // Soft-revoke: mark as inactive and set revokedAt
  await db
    .update(apiKeys)
    .set({ isActive: false, revokedAt: new Date() })
    .where(eq(apiKeys.id, id));

  return c.json({ revoked: true, id });
});

export { apiKeysRouter };
