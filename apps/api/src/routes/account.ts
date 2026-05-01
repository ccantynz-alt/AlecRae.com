import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireScope } from "../middleware/auth.js";
import { validateBody, getValidatedBody } from "../middleware/validator.js";
import { getDatabase, accounts, users, passkeys } from "@alecrae/db";

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

// ─── Profile Update ──────────────────────────────────────────────────────────

const UpdateProfileSchema = z.object({
  name: z.string().min(1).max(128).optional(),
  email: z.string().email().optional(),
});

account.patch(
  "/profile",
  requireScope("messages:read"),
  validateBody(UpdateProfileSchema),
  async (c) => {
    const auth = c.get("auth");
    const body = getValidatedBody<z.infer<typeof UpdateProfileSchema>>(c);
    const db = getDatabase();

    if (!body.name && !body.email) {
      return c.json(
        { error: { type: "validation", message: "No fields to update", code: "empty_update" } },
        400,
      );
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.name) updates["name"] = body.name;
    if (body.email) updates["email"] = body.email;

    await db.update(users).set(updates).where(eq(users.id, auth.userId));

    const [updated] = await db
      .select({ id: users.id, name: users.name, email: users.email, role: users.role })
      .from(users)
      .where(eq(users.id, auth.userId))
      .limit(1);

    return c.json({ data: updated });
  },
);

// ─── Passkey Management ──────────────────────────────────────────────────────

account.get("/passkeys", requireScope("messages:read"), async (c) => {
  const auth = c.get("auth");
  const db = getDatabase();

  const rows = await db
    .select({
      id: passkeys.id,
      credentialId: passkeys.credentialId,
      friendlyName: passkeys.friendlyName,
      deviceType: passkeys.deviceType,
      createdAt: passkeys.createdAt,
      lastUsedAt: passkeys.lastUsedAt,
    })
    .from(passkeys)
    .where(eq(passkeys.userId, auth.userId));

  return c.json({
    data: rows.map((r) => ({
      id: r.id,
      credentialId: r.credentialId,
      deviceName: r.friendlyName ?? r.deviceType ?? "Unknown device",
      createdAt: r.createdAt?.toISOString() ?? null,
      lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
    })),
  });
});

account.delete("/passkeys/:id", requireScope("messages:read"), async (c) => {
  const auth = c.get("auth");
  const passkeyId = c.req.param("id");
  const db = getDatabase();

  const [existing] = await db
    .select({ id: passkeys.id })
    .from(passkeys)
    .where(eq(passkeys.id, passkeyId))
    .limit(1);

  if (!existing) {
    return c.json(
      { error: { type: "not_found", message: "Passkey not found", code: "passkey_not_found" } },
      404,
    );
  }

  await db.delete(passkeys).where(eq(passkeys.id, passkeyId));

  return c.json({ data: { deleted: true, id: passkeyId } });
});

// ─── Notification Preferences ────────────────────────────────────────────────

const NotificationPrefsSchema = z.object({
  emailNotifications: z.boolean().optional(),
  aiDigest: z.boolean().optional(),
  deliverabilityAlerts: z.boolean().optional(),
});

account.get("/notifications", requireScope("messages:read"), async (c) => {
  const auth = c.get("auth");
  const db = getDatabase();

  const [user] = await db
    .select({ permissions: users.permissions })
    .from(users)
    .where(eq(users.id, auth.userId))
    .limit(1);

  const prefs = (user?.permissions as Record<string, unknown>) ?? {};

  return c.json({
    data: {
      emailNotifications: prefs["emailNotifications"] !== false,
      aiDigest: prefs["aiDigest"] !== false,
      deliverabilityAlerts: prefs["deliverabilityAlerts"] !== false,
    },
  });
});

account.put(
  "/notifications",
  requireScope("messages:read"),
  validateBody(NotificationPrefsSchema),
  async (c) => {
    const auth = c.get("auth");
    const body = getValidatedBody<z.infer<typeof NotificationPrefsSchema>>(c);
    const db = getDatabase();

    const [user] = await db
      .select({ permissions: users.permissions })
      .from(users)
      .where(eq(users.id, auth.userId))
      .limit(1);

    const current = (user?.permissions as Record<string, unknown>) ?? {};
    const merged = { ...current, ...body };

    await db.update(users).set({ permissions: merged, updatedAt: new Date() }).where(eq(users.id, auth.userId));

    return c.json({
      data: {
        emailNotifications: merged["emailNotifications"] !== false,
        aiDigest: merged["aiDigest"] !== false,
        deliverabilityAlerts: merged["deliverabilityAlerts"] !== false,
      },
    });
  },
);

// ─── Account Deletion ────────────────────────────────────────────────────────

account.delete("/", requireScope("messages:read"), async (c) => {
  const auth = c.get("auth");
  const db = getDatabase();

  const [user] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, auth.userId))
    .limit(1);

  if (user?.role !== "owner") {
    return c.json(
      { error: { type: "forbidden", message: "Only account owners can delete accounts", code: "not_owner" } },
      403,
    );
  }

  await db.delete(accounts).where(eq(accounts.id, auth.accountId));

  return c.json({ data: { deleted: true } });
});

export { account };
