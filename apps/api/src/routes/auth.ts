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
import { getDatabase, users, accounts } from "@emailed/db";
import {
  issueTokenPair,
  rotateRefreshToken,
  revokeAllUserTokens,
  verifyAccessToken,
  TokenError,
} from "../lib/jwt.js";
import type { TokenPayload } from "../lib/jwt.js";

const auth = new Hono();

function generateId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hashPassword(password: string): Promise<string> {
  const data = new TextEncoder().encode(password);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
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

  const passwordHash = await hashPassword(input.password);
  if (user.passwordHash !== passwordHash) {
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

  // Update last login
  await db
    .update(users)
    .set({ lastLoginAt: new Date() })
    .where(eq(users.id, user.id));

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
      const payload = JSON.parse(atob(parts[1]!));
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

// GET /v1/auth/me — Get current user from bearer token
auth.get("/me", async (c) => {
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
    // Try verified JWT first
    let userId: string | undefined;
    try {
      const payload = await verifyAccessToken(token);
      userId = payload.userId as string;
    } catch {
      // Fallback to raw decode for legacy tokens
      const parts = token.split(".");
      if (parts.length !== 3) throw new Error("Invalid token");
      const payload = JSON.parse(atob(parts[1]!));
      if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
        throw new Error("Token expired");
      }
      userId = payload.userId as string;
    }

    if (!userId) throw new Error("No userId in token");

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
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) throw new Error("User not found");

    return c.json({ data: user });
  } catch {
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

export { auth };
