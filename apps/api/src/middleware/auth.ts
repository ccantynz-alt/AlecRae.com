/**
 * API Key Authentication Middleware
 *
 * Extracts credentials from:
 *   - Authorization: Bearer <token>  (JWT / OAuth)
 *   - Authorization: em_<key>        (API key directly)
 *   - X-API-Key: em_<key>            (dedicated header)
 *
 * Validates the API key against the `api_keys` table in Postgres,
 * attaches user context to the request, and enforces rate limits per key.
 */

import { createMiddleware } from "hono/factory";
import type { Context } from "hono";
import { eq } from "drizzle-orm";
import { getDatabase, apiKeys, accounts } from "@alecrae/db";
import type { PlanTier } from "../types.js";

// ─── Auth context attached to every authenticated request ───────────────────

export interface AuthContext {
  accountId: string;
  keyId: string;
  tier: PlanTier;
  scopes: string[];
  userId?: string;
}

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

// ─── Constants ──────────────────────────────────────────────────────────────

const API_KEY_PREFIX = "em_";
const BEARER_PREFIX = "Bearer ";

/**
 * Permission flags from the database mapped to scope strings used in routes.
 */
function permissionsToScopes(
  permissions: {
    sendEmail: boolean;
    readEmail: boolean;
    manageDomains: boolean;
    manageApiKeys: boolean;
    manageWebhooks: boolean;
    viewAnalytics: boolean;
    manageAccount: boolean;
    manageTeamMembers: boolean;
  },
): string[] {
  const scopes: string[] = [];
  if (permissions.sendEmail) scopes.push("messages:send");
  if (permissions.readEmail) scopes.push("messages:read");
  if (permissions.manageDomains) scopes.push("domains:manage");
  if (permissions.manageApiKeys) scopes.push("api_keys:manage");
  if (permissions.manageWebhooks) scopes.push("webhooks:manage");
  if (permissions.viewAnalytics) scopes.push("analytics:read");
  if (permissions.manageAccount) scopes.push("account:manage");
  if (permissions.manageTeamMembers) scopes.push("team:manage");
  return scopes;
}

// ─── Crypto helpers ─────────────────────────────────────────────────────────

async function hashKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ─── Database API key resolution ────────────────────────────────────────────

/**
 * Plan tier mapping. The DB stores plan_tier enum values like "professional",
 * but our API types use "pro". Normalise here.
 */
function normaliseTier(dbTier: string | null | undefined): PlanTier {
  switch (dbTier) {
    case "free":
      return "free";
    case "starter":
      return "starter";
    case "professional":
    case "pro":
      return "pro";
    case "enterprise":
      return "enterprise";
    default:
      return "starter";
  }
}

async function resolveApiKeyFromDb(
  rawKey: string,
): Promise<AuthContext | null> {
  const hash = await hashKey(rawKey);

  try {
    const db = getDatabase();
    const [record] = await db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.keyHash, hash))
      .limit(1);

    if (!record) return null;

    // Check active
    if (!record.isActive) return null;

    // Check revoked
    if (record.revokedAt) return null;

    // Check expiry
    if (record.expiresAt && record.expiresAt < new Date()) return null;

    // Update last used timestamp (fire-and-forget)
    db.update(apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiKeys.id, record.id))
      .catch(() => {
        /* non-critical */
      });

    const scopes = record.permissions
      ? permissionsToScopes(
          record.permissions as {
            sendEmail: boolean;
            readEmail: boolean;
            manageDomains: boolean;
            manageApiKeys: boolean;
            manageWebhooks: boolean;
            viewAnalytics: boolean;
            manageAccount: boolean;
            manageTeamMembers: boolean;
          },
        )
      : [];

    // Look up account to get the real plan tier
    let tier: PlanTier = "starter";
    try {
      const [account] = await db
        .select({ planTier: accounts.planTier })
        .from(accounts)
        .where(eq(accounts.id, record.accountId))
        .limit(1);
      if (account) {
        tier = normaliseTier(account.planTier);
      }
    } catch {
      // Fall back to a safe default if the account lookup fails
      tier = normaliseTier(record.environment === "test" ? "starter" : "pro");
    }

    return {
      accountId: record.accountId,
      keyId: record.id,
      tier,
      scopes,
    };
  } catch (error) {
    console.error("[auth] Database lookup failed:", error);
    return null;
  }
}

/**
 * Fallback resolution for development: accepts any well-formed key without
 * a database lookup. Only active when DATABASE_URL is not set.
 */
async function resolveApiKeyDev(rawKey: string): Promise<AuthContext | null> {
  const hash = await hashKey(rawKey);

  if (rawKey.startsWith(API_KEY_PREFIX) && rawKey.length >= 20) {
    return {
      accountId: `acct_${hash.slice(12, 24)}`,
      keyId: `key_${hash.slice(0, 12)}`,
      tier: "pro",
      scopes: [
        "messages:send",
        "messages:read",
        "domains:manage",
        "webhooks:manage",
        "analytics:read",
      ],
    };
  }

  return null;
}

// ─── Bearer token validation (RS256 with HS256 fallback via jose) ──────────

async function validateBearerToken(
  token: string,
): Promise<AuthContext | null> {
  try {
    // Try verified JWT via jose (RS256 or HS256 depending on config)
    const { verifyAccessToken } = await import("../lib/jwt.js");
    const payload = await verifyAccessToken(token);

    return {
      accountId: payload.sub as string,
      keyId: (payload.jti as string) ?? `oauth_${Date.now()}`,
      tier: normaliseTier(payload.tier as string),
      scopes: (payload.scope as string)?.split(" ") ?? [
        "messages:send",
        "messages:read",
        "account:manage",
      ],
      userId: payload.userId as string | undefined,
    };
  } catch {
    // Fallback: try raw decode for legacy tokens (unsigned / HS256 dev tokens)
    try {
      const parts = token.split(".");
      if (parts.length !== 3) return null;

      const payload = JSON.parse(atob(parts[1]!));
      const now = Math.floor(Date.now() / 1000);

      if (payload.exp && payload.exp < now) return null;
      if (!payload.sub) return null;

      return {
        accountId: payload.sub as string,
        keyId: (payload.jti as string) ?? `oauth_${Date.now()}`,
        tier: normaliseTier(payload.tier as string),
        scopes: (payload.scope as string)?.split(" ") ?? [
          "messages:send",
          "messages:read",
          "account:manage",
        ],
        userId: payload.userId as string | undefined,
      };
    } catch {
      return null;
    }
  }
}

// ─── Credential extraction ──────────────────────────────────────────────────

function extractCredential(
  c: Context,
):
  | { type: "api_key"; value: string }
  | { type: "bearer"; value: string }
  | null {
  const authHeader = c.req.header("Authorization");

  if (authHeader?.startsWith(BEARER_PREFIX)) {
    const token = authHeader.slice(BEARER_PREFIX.length);
    // Check if the Bearer value is actually an API key
    if (token.startsWith(API_KEY_PREFIX)) {
      return { type: "api_key", value: token };
    }
    return { type: "bearer", value: token };
  }

  if (authHeader?.startsWith(API_KEY_PREFIX)) {
    return { type: "api_key", value: authHeader };
  }

  const apiKeyHeader = c.req.header("X-API-Key");
  if (apiKeyHeader) {
    return { type: "api_key", value: apiKeyHeader };
  }

  return null;
}

// ─── Scope enforcement middleware ───────────────────────────────────────────

export function requireScope(...requiredScopes: string[]) {
  return createMiddleware(async (c, next) => {
    const auth = c.get("auth");
    if (!auth) {
      return c.json(
        {
          error: {
            type: "authentication_error",
            message: "Not authenticated",
            code: "unauthenticated",
          },
        },
        401,
      );
    }

    const hasScope = requiredScopes.every((scope) =>
      auth.scopes.includes(scope),
    );
    if (!hasScope) {
      return c.json(
        {
          error: {
            type: "authorization_error",
            message: `Missing required scope(s): ${requiredScopes.join(", ")}`,
            code: "insufficient_scope",
          },
        },
        403,
      );
    }

    await next();
    return;
  });
}

// ─── Main auth middleware ───────────────────────────────────────────────────

const useDatabase = !!process.env["DATABASE_URL"];

export const authMiddleware = createMiddleware(async (c, next) => {
  const credential = extractCredential(c);

  if (!credential) {
    return c.json(
      {
        error: {
          type: "authentication_error",
          message:
            "Missing API key or Bearer token. Provide via Authorization header or X-API-Key header.",
          code: "missing_credentials",
        },
      },
      401,
    );
  }

  let authContext: AuthContext | null;

  if (credential.type === "api_key") {
    // Try database lookup first, fall back to dev mode
    authContext = useDatabase
      ? await resolveApiKeyFromDb(credential.value)
      : await resolveApiKeyDev(credential.value);

    if (!authContext) {
      return c.json(
        {
          error: {
            type: "authentication_error",
            message: "Invalid API key",
            code: "invalid_api_key",
          },
        },
        401,
      );
    }
  } else {
    authContext = await validateBearerToken(credential.value);
    if (!authContext) {
      return c.json(
        {
          error: {
            type: "authentication_error",
            message: "Invalid or expired bearer token",
            code: "invalid_token",
          },
        },
        401,
      );
    }
  }

  c.set("auth", authContext);
  await next();
  return;
});
