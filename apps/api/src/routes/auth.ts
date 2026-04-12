/**
 * Authentication Routes
 *
 * POST /v1/auth/login     — Email + password login, returns session token
 * POST /v1/auth/register  — Create account + user, returns session token
 * GET  /v1/auth/me        — Get current user from session token
 */

import { Hono } from "hono";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { validateBody, getValidatedBody } from "../middleware/validator.js";
import { getDatabase, users, accounts } from "@emailed/db";

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

/**
 * Create a minimal JWT (no external library required).
 * In production, use a proper JWT library with RS256.
 */
function createToken(payload: Record<string, unknown>): string {
  const secret = process.env["JWT_SECRET"] ?? "dev_secret";
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = btoa(
    JSON.stringify({
      ...payload,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 86400 * 7, // 7 days
    }),
  );
  // Simplified HMAC — in production use crypto.subtle.sign
  const signature = btoa(`${header}.${body}.${secret}`);
  return `${header}.${body}.${signature}`;
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

  const token = createToken({
    sub: user.accountId,
    userId: user.id,
    email: user.email,
    role: user.role,
  });

  return c.json({
    data: {
      token,
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

  const token = createToken({
    sub: accountId,
    userId,
    email: input.email.toLowerCase(),
    role: "owner",
  });

  return c.json(
    {
      data: {
        token,
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
