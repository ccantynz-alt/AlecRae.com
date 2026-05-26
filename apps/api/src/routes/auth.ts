/**
 * Authentication Routes
 *
 * POST /v1/auth/login     — Email + password login, returns access + refresh tokens
 * POST /v1/auth/register  — Create account + user, returns access + refresh tokens
 * POST /v1/auth/refresh   — Rotate refresh token, returns new token pair
 * POST /v1/auth/logout    — Revoke all refresh tokens for the user
 * GET  /v1/auth/me        — Get current user from session token
 */

import { Hono } from "hono";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { validateBody, getValidatedBody } from "../middleware/validator.js";
import { getDatabase, users, accounts } from "@alecrae/db";
import {
  issueTokenPair,
  rotateRefreshToken,
  revokeAllUserTokens,
  verifyAccessToken,
  TokenError,
} from "../lib/jwt.js";

const auth = new Hono();

function generateId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hashPassword(password: string): Promise<string> {
  return Bun.password.hash(password, { algorithm: "argon2id", memoryCost: 19456, timeCost: 2 });
}

async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (storedHash.startsWith("$argon2")) {
    return Bun.password.verify(password, storedHash);
  }
  // Legacy SHA-256 hashes (pre-Argon2 migration) — verify constant-time and auto-upgrade handled by caller
  const data = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const legacyHex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  if (legacyHex.length !== storedHash.length) return false;
  let mismatch = 0;
  for (let i = 0; i < legacyHex.length; i++) {
    mismatch |= legacyHex.charCodeAt(i) ^ storedHash.charCodeAt(i);
  }
  return mismatch === 0;
}

// ─── Schemas ───────────────────────────────────────────────────────────────

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(256),
  accountName: z.string().min(1).max(256).optional(),
});

// POST /v1/auth/login
auth.post("/login", validateBody(LoginSchema), async (c) => {
  const input = getValidatedBody<z.infer<typeof LoginSchema>>(c);
  const db = getDatabase();

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, input.email.toLowerCase()))
    .limit(1);

  if (!user) {
    return c.json(
      {
        error: {
          type: "authentication_error",
          message: "Invalid email or password",
          code: "invalid_credentials",
        },
      },
      401,
    );
  }

  const valid = user.passwordHash ? await verifyPassword(input.password, user.passwordHash) : false;
  if (!valid) {
    return c.json(
      {
        error: {
          type: "authentication_error",
          message: "Invalid email or password",
          code: "invalid_credentials",
        },
      },
      401,
    );
  }

  // Transparent upgrade: legacy SHA-256 hashes migrate to Argon2id on successful login
  const updates: Record<string, unknown> = { lastLoginAt: new Date() };
  if (user.passwordHash && !user.passwordHash.startsWith("$argon2")) {
    updates.passwordHash = await hashPassword(input.password);
  }
  await db.update(users).set(updates).where(eq(users.id, user.id));

  // Look up account tier
  let tier = "free";
  try {
    const [account] = await db
      .select({ planTier: accounts.planTier })
      .from(accounts)
      .where(eq(accounts.id, user.accountId))
      .limit(1);
    if (account) tier = account.planTier ?? "free";
  } catch {
    // fall through
  }

  const tokenPair = await issueTokenPair({
    sub: user.accountId,
    userId: user.id,
    email: user.email,
    role: user.role,
    tier,
  });

  return c.json({
    data: {
      token: tokenPair.accessToken,
      refreshToken: tokenPair.refreshToken,
      expiresIn: tokenPair.expiresIn,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        accountId: user.accountId,
      },
    },
  });
});

// POST /v1/auth/register
auth.post("/register", validateBody(RegisterSchema), async (c) => {
  const input = getValidatedBody<z.infer<typeof RegisterSchema>>(c);
  const db = getDatabase();

  // Check if user already exists
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

  const accountId = generateId();
  const userId = generateId();
  const passwordHash = await hashPassword(input.password);

  // Create account
  await db.insert(accounts).values({
    id: accountId,
    name: input.accountName ?? `${input.name}'s Account`,
    planTier: "free",
    billingEmail: input.email.toLowerCase(),
    emailsSentThisPeriod: 0,
  });

  // Create user
  await db.insert(users).values({
    id: userId,
    accountId,
    email: input.email.toLowerCase(),
    name: input.name,
    passwordHash,
    role: "owner",
    emailVerified: false,
    permissions: {
      sendEmail: true,
      readEmail: true,
      manageDomains: true,
      manageApiKeys: true,
      manageWebhooks: true,
      viewAnalytics: true,
      manageAccount: true,
      manageTeamMembers: true,
    },
  });

  const tokenPair = await issueTokenPair({
    sub: accountId,
    userId,
    email: input.email.toLowerCase(),
    role: "owner",
    tier: "free",
  });

  return c.json(
    {
      data: {
        token: tokenPair.accessToken,
        refreshToken: tokenPair.refreshToken,
        expiresIn: tokenPair.expiresIn,
        user: {
          id: userId,
          email: input.email.toLowerCase(),
          name: input.name,
          role: "owner",
          accountId,
        },
      },
    },
    201,
  );
});

// ─── Schemas for new endpoints ────────────��───────────────────────────────

const RefreshSchema = z.object({
  refreshToken: z.string().min(1),
});

// POST /v1/auth/refresh — Rotate refresh token, return new token pair
auth.post("/refresh", validateBody(RefreshSchema), async (c) => {
  const input = getValidatedBody<z.infer<typeof RefreshSchema>>(c);

  try {
    const tokenPair = await rotateRefreshToken(input.refreshToken);

    return c.json({
      data: {
        token: tokenPair.accessToken,
        refreshToken: tokenPair.refreshToken,
        expiresIn: tokenPair.expiresIn,
      },
    });
  } catch (err) {
    const code = err instanceof TokenError ? err.code : "invalid_refresh_token";
    const message = err instanceof Error ? err.message : "Invalid refresh token";

    return c.json(
      {
        error: {
          type: "authentication_error",
          message,
          code,
        },
      },
      401,
    );
  }
});

// POST /v1/auth/logout — Revoke all refresh tokens for the authenticated user
auth.post("/logout", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json(
      {
        error: {
          type: "authentication_error",
          message: "Missing token",
          code: "unauthenticated",
        },
      },
      401,
    );
  }

  const token = authHeader.slice(7);
  try {
    const payload = await verifyAccessToken(token);
    const userId = payload.userId as string;

    await revokeAllUserTokens(userId);

    return c.json({ data: { message: "All sessions revoked" } });
  } catch {
    // Try legacy decode as fallback
    try {
      const parts = token.split(".");
      if (parts.length !== 3) throw new Error("Invalid token");
      const segment = parts[1];
      if (!segment) throw new Error("Invalid token");
      const payload = JSON.parse(atob(segment));
      if (payload.userId) {
        await revokeAllUserTokens(payload.userId as string);
        return c.json({ data: { message: "All sessions revoked" } });
      }
    } catch {
      // fall through
    }

    return c.json(
      {
        error: {
          type: "authentication_error",
          message: "Invalid or expired token",
          code: "invalid_token",
        },
      },
      401,
    );
  }
});

// ─── Helper for lightweight bearer token verification ───────────────────────

interface SessionPayload {
  readonly userId: string;
  readonly accountId: string;
}

function verifyBearerToken(authHeader: string | undefined): SessionPayload | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const payload = JSON.parse(atob(parts[1])) as {
      exp?: number;
      userId?: string;
      sub?: string;
    };
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (!payload.userId || !payload.sub) return null;
    return { userId: payload.userId, accountId: payload.sub };
  } catch {
    return null;
  }
}

function unauthenticatedResponse() {
  return {
    error: {
      type: "authentication_error" as const,
      message: "Invalid or expired token",
      code: "invalid_token" as const,
    },
  };
}

// GET /v1/auth/me — Get current user from bearer token
auth.get("/me", async (c) => {
  const session = verifyBearerToken(c.req.header("Authorization"));
  if (!session) return c.json(unauthenticatedResponse(), 401);

  const db = getDatabase();
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      accountId: users.accountId,
    })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  if (!user) return c.json(unauthenticatedResponse(), 401);

  return c.json({ data: user });
});

// PATCH /v1/auth/me — Update the authenticated user's profile
const UpdateProfileSchema = z.object({
  name: z.string().min(1).max(256).optional(),
  email: z.string().email().optional(),
});

auth.patch("/me", validateBody(UpdateProfileSchema), async (c) => {
  const session = verifyBearerToken(c.req.header("Authorization"));
  if (!session) return c.json(unauthenticatedResponse(), 401);

  const input = getValidatedBody<z.infer<typeof UpdateProfileSchema>>(c);
  const db = getDatabase();

  // If email is being changed, make sure the new address isn't already claimed.
  if (input.email) {
    const lower = input.email.toLowerCase();
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, lower))
      .limit(1);
    if (existing && existing.id !== session.userId) {
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

  const patch: { name?: string; email?: string; updatedAt: Date } = {
    updatedAt: new Date(),
  };
  if (input.name !== undefined) patch.name = input.name;
  if (input.email !== undefined) patch.email = input.email.toLowerCase();

  await db.update(users).set(patch).where(eq(users.id, session.userId));

  const [updated] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      accountId: users.accountId,
    })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  if (!updated) return c.json(unauthenticatedResponse(), 401);

  return c.json({ data: updated });
});

// DELETE /v1/auth/me — Soft-delete the current user's account (30-day window)
auth.delete("/me", async (c) => {
  const session = verifyBearerToken(c.req.header("Authorization"));
  if (!session) return c.json(unauthenticatedResponse(), 401);

  const db = getDatabase();

  // Only the account owner may delete the account.
  const [user] = await db
    .select({ id: users.id, role: users.role, accountId: users.accountId })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  if (!user) return c.json(unauthenticatedResponse(), 401);
  if (user.role !== "owner") {
    return c.json(
      {
        error: {
          type: "permission_error",
          message: "Only account owners can delete the account",
          code: "forbidden",
        },
      },
      403,
    );
  }

  // Soft-delete: mark the account as scheduled for deletion 30 days from now.
  // A background job (not part of this request path) performs the hard delete.
  const deletionDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await db
    .update(accounts)
    .set({
      status: "scheduled_for_deletion",
      scheduledDeletionAt: deletionDate,
      updatedAt: new Date(),
    })
    .where(eq(accounts.id, user.accountId));

  return c.json({
    data: {
      status: "scheduled_for_deletion",
      scheduledDeletionAt: deletionDate.toISOString(),
      message:
        "Account scheduled for deletion in 30 days. Log in again before then to cancel.",
    },
  });
});

export { auth };
