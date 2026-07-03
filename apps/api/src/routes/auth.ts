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
  issueWorkspaceTokenPair,
  rotateRefreshToken,
  revokeAllUserTokens,
  verifyAccessToken,
  TokenError,
} from "../lib/jwt.js";
import { upsertWorkspaceMembership, getWorkspaceRole } from "../lib/workspace-membership.js";
import {
  getGoogleSignInUrl,
  exchangeGoogleSignInCode,
  isGoogleSignInConfigured,
} from "../lib/google-auth.js";
import { signAuthState, verifyAuthState } from "../lib/oauth-state.js";
import { sendTransactionalEmail } from "../lib/transactional-email.js";
import { isOwnerEmail, reconcileOwnerPlan, OWNER_PLAN_TIER } from "../lib/owner-allowlist.js";

const auth = new Hono();

/**
 * Fire-and-forget welcome email for newly created accounts. Gated behind
 * VAPRON_WELCOME_EMAIL=true so we never send outbound mail to real users until
 * Craig explicitly turns it on. Failures are logged, never thrown — a welcome
 * email must not be able to break signup.
 */
function maybeSendWelcomeEmail(to: string, name: string): void {
  if (process.env["VAPRON_WELCOME_EMAIL"] !== "true") return;
  void sendTransactionalEmail({
    to,
    subject: "Welcome to AlecRae",
    html: `<p>Hi ${name},</p><p>Welcome to AlecRae — email, evolved. Your account is ready.</p>`,
  }).catch((err: unknown) => {
    console.error("[auth] Welcome email failed:", err);
  });
}

const WEB_URL = process.env["WEB_URL"] ?? "https://mail.alecrae.com";

/** Default permission set for a fresh account owner (mirrors /register). */
const OWNER_PERMISSIONS = {
  sendEmail: true,
  readEmail: true,
  manageDomains: true,
  manageApiKeys: true,
  manageWebhooks: true,
  viewAnalytics: true,
  manageAccount: true,
  manageTeamMembers: true,
} as const;

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
    // Owner accounts are pinned to full access on every login.
    tier = await reconcileOwnerPlan(user.accountId, user.email, tier);
  } catch {
    // fall through
  }

  // Role in the identity's home workspace comes from workspace_members —
  // self-heals (and falls back to the legacy users.role) for any row that
  // predates that table.
  let role = await getWorkspaceRole(user.id, user.accountId);
  if (!role) {
    role = user.role;
    await upsertWorkspaceMembership({
      userId: user.id,
      accountId: user.accountId,
      role: user.role,
      permissions: user.permissions,
    });
  }

  const tokenPair = await issueTokenPair({
    sub: user.accountId,
    userId: user.id,
    email: user.email,
    role,
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
        role,
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

  const ownerPermissions = {
    sendEmail: true,
    readEmail: true,
    manageDomains: true,
    manageApiKeys: true,
    manageWebhooks: true,
    viewAnalytics: true,
    manageAccount: true,
    manageTeamMembers: true,
  };

  // Create user
  await db.insert(users).values({
    id: userId,
    accountId,
    email: input.email.toLowerCase(),
    name: input.name,
    passwordHash,
    role: "owner",
    emailVerified: false,
    permissions: ownerPermissions,
  });

  await upsertWorkspaceMembership({
    userId,
    accountId,
    role: "owner",
    permissions: ownerPermissions,
  });

  maybeSendWelcomeEmail(input.email.toLowerCase(), input.name);

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

// ─── Sign in with Google (identity only — NOT Gmail mailbox connection) ──────

// GET /v1/auth/google — start the Google sign-in flow
auth.get("/google", async (c) => {
  if (!isGoogleSignInConfigured()) {
    return c.redirect(`${WEB_URL}/login?error=google_unavailable`);
  }
  try {
    const state = await signAuthState({ flow: "google-signin" });
    return c.redirect(getGoogleSignInUrl(state));
  } catch (err) {
    // e.g. JWT_SECRET unset in production — surface a clean error to the user
    // instead of a raw 500, and log the real cause for operators.
    console.error("[auth] Failed to start Google sign-in:", err);
    return c.redirect(`${WEB_URL}/login?error=google_unavailable`);
  }
});

// GET /v1/auth/callback/google — Google sign-in callback (find-or-create + session)
auth.get("/callback/google", async (c) => {
  const code = c.req.query("code");
  const stateParam = c.req.query("state");

  if (!code || !stateParam) {
    return c.redirect(`${WEB_URL}/login?error=google_signin_failed`);
  }

  try {
    const stateResult = await verifyAuthState(stateParam);
    if (!stateResult.ok) {
      return c.redirect(`${WEB_URL}/login?error=google_state_invalid`);
    }

    const profile = await exchangeGoogleSignInCode(code);
    const db = getDatabase();

    // Find existing user by email — sign them in. Otherwise provision a new
    // OAuth-only account (passwordHash stays null; they sign in via Google).
    const [existing] = await db
      .select()
      .from(users)
      .where(eq(users.email, profile.email))
      .limit(1);

    let userId: string;
    let accountId: string;
    let role: string;
    let tier = "free";

    if (existing) {
      userId = existing.id;
      accountId = existing.accountId;

      const updates: Record<string, unknown> = { lastLoginAt: new Date() };
      if (!existing.avatarUrl && profile.picture) updates.avatarUrl = profile.picture;
      if (!existing.emailVerified && profile.emailVerified) updates.emailVerified = true;
      await db.update(users).set(updates).where(eq(users.id, existing.id));

      const [account] = await db
        .select({ planTier: accounts.planTier })
        .from(accounts)
        .where(eq(accounts.id, existing.accountId))
        .limit(1);
      if (account) tier = account.planTier ?? "free";
      // Owner accounts are pinned to full access — upgrade a pre-existing
      // free/paid account in place if this email is on the allowlist.
      tier = await reconcileOwnerPlan(existing.accountId, profile.email, tier);

      // Role in the home workspace comes from workspace_members — self-heals
      // for rows that predate that table.
      const existingMembershipRole = await getWorkspaceRole(userId, accountId);
      if (existingMembershipRole) {
        role = existingMembershipRole;
      } else {
        role = existing.role;
        await upsertWorkspaceMembership({
          userId,
          accountId,
          role: existing.role,
          permissions: existing.permissions,
        });
      }
    } else {
      accountId = generateId();
      userId = generateId();
      role = "owner";
      // Founder / staff accounts start at full access; everyone else at free.
      tier = isOwnerEmail(profile.email) ? OWNER_PLAN_TIER : "free";

      await db.insert(accounts).values({
        id: accountId,
        name: `${profile.name}'s Account`,
        planTier: tier as typeof OWNER_PLAN_TIER | "free",
        billingEmail: profile.email,
        emailsSentThisPeriod: 0,
      });

      await db.insert(users).values({
        id: userId,
        accountId,
        email: profile.email,
        name: profile.name,
        passwordHash: null,
        role: "owner",
        emailVerified: profile.emailVerified,
        avatarUrl: profile.picture,
        permissions: { ...OWNER_PERMISSIONS },
        lastLoginAt: new Date(),
      });

      await upsertWorkspaceMembership({
        userId,
        accountId,
        role: "owner",
        permissions: { ...OWNER_PERMISSIONS },
      });

      maybeSendWelcomeEmail(profile.email, profile.name);
    }

    const tokenPair = await issueTokenPair({
      sub: accountId,
      userId,
      email: profile.email,
      role,
      tier,
    });

    // Hand the access token to the browser via the URL fragment (never sent to
    // a server, kept out of referrers/logs). The web callback page reads it,
    // stores the session, and routes to the inbox — matching the other flows.
    const fragment = new URLSearchParams({
      token: tokenPair.accessToken,
      refreshToken: tokenPair.refreshToken,
      expiresIn: String(tokenPair.expiresIn),
    });
    return c.redirect(`${WEB_URL}/google/callback#${fragment.toString()}`);
  } catch (err) {
    console.error("[auth] Google sign-in failed:", err);
    return c.redirect(`${WEB_URL}/login?error=google_signin_failed`);
  }
});

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

const SwitchWorkspaceSchema = z.object({
  accountId: z.string().min(1),
});

// POST /v1/auth/switch-workspace — mint a fresh token pair scoped to another
// workspace the caller is a member of. Requires an existing valid session
// (authMiddleware, mounted in server.ts) — the target accountId's role comes
// strictly from workspace_members, never trusted from the request body.
auth.post("/switch-workspace", validateBody(SwitchWorkspaceSchema), async (c) => {
  const authCtx = c.get("auth");
  if (!authCtx?.userId) {
    return c.json(unauthenticatedResponse(), 401);
  }

  const input = getValidatedBody<z.infer<typeof SwitchWorkspaceSchema>>(c);
  const db = getDatabase();

  const role = await getWorkspaceRole(authCtx.userId, input.accountId);
  if (!role) {
    return c.json(
      {
        error: {
          type: "authorization_error",
          message: "You are not a member of this workspace",
          code: "not_a_member",
        },
      },
      403,
    );
  }

  const [user] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, authCtx.userId))
    .limit(1);
  if (!user) return c.json(unauthenticatedResponse(), 401);

  let tier = "free";
  try {
    const [account] = await db
      .select({ planTier: accounts.planTier })
      .from(accounts)
      .where(eq(accounts.id, input.accountId))
      .limit(1);
    if (account) tier = account.planTier ?? "free";
  } catch {
    // fall through
  }

  const tokenPair = await issueWorkspaceTokenPair({
    userId: authCtx.userId,
    accountId: input.accountId,
    email: user.email,
    role,
    tier,
  });

  return c.json({
    data: {
      token: tokenPair.accessToken,
      refreshToken: tokenPair.refreshToken,
      expiresIn: tokenPair.expiresIn,
      accountId: input.accountId,
      role,
    },
  });
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
    // SECURITY: do NOT fall back to an unsigned token decode here — that would let
    // an attacker revoke any user's sessions by forging a token. Require a verified token.
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

async function verifyBearerToken(
  authHeader: string | undefined,
): Promise<SessionPayload | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  // SECURITY: always verify the JWT signature + expiry via jose. Never trust an
  // unsigned/base64-decoded payload — that would let anyone forge a token for any user.
  try {
    const payload = await verifyAccessToken(token);
    const userId = payload.userId as string | undefined;
    const accountId = payload.sub as string | undefined;
    if (!userId || !accountId) return null;
    return { userId, accountId };
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
  const session = await verifyBearerToken(c.req.header("Authorization"));
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

  // Report the ACTIVE workspace (from the token), not the identity's home
  // account — these differ once a user belongs to more than one workspace.
  // Role comes from that workspace's membership row — every legitimate
  // membership (home or joined) has one, no fallback.
  const role = await getWorkspaceRole(user.id, session.accountId);
  if (!role) return c.json(unauthenticatedResponse(), 401);

  // planTier was never returned here, so the frontend's PlanGate always fell
  // back to "free" regardless of the account's actual plan.
  const [account] = await db
    .select({ planTier: accounts.planTier })
    .from(accounts)
    .where(eq(accounts.id, session.accountId))
    .limit(1);

  return c.json({
    data: { ...user, accountId: session.accountId, role, planTier: account?.planTier ?? "free" },
  });
});

// PATCH /v1/auth/me — Update the authenticated user's profile
const UpdateProfileSchema = z.object({
  name: z.string().min(1).max(256).optional(),
  email: z.string().email().optional(),
});

auth.patch("/me", validateBody(UpdateProfileSchema), async (c) => {
  const session = await verifyBearerToken(c.req.header("Authorization"));
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
  const session = await verifyBearerToken(c.req.header("Authorization"));
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
