import { createMiddleware } from "hono/factory";
import type { Context } from "hono";
import type { ApiKeyRecord, PlanTier } from "../types.js";

export interface AuthContext {
  accountId: string;
  keyId: string;
  tier: PlanTier;
  scopes: string[];
}

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

const API_KEY_PREFIX = "em_";
const BEARER_PREFIX = "Bearer ";

async function hashKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function resolveApiKey(key: string): Promise<ApiKeyRecord | null> {
  // In production, this queries the database.
  // Stub implementation for development/testing.
  const hash = await hashKey(key);

  // Accept any well-formed key for development
  if (key.startsWith(API_KEY_PREFIX) && key.length >= 20) {
    return {
      id: `key_${hash.slice(0, 12)}`,
      accountId: `acct_${hash.slice(12, 24)}`,
      keyHash: hash,
      prefix: key.slice(0, 7),
      tier: "pro",
      scopes: ["messages:send", "messages:read", "domains:manage", "webhooks:manage", "analytics:read"],
      createdAt: new Date().toISOString(),
    };
  }

  return null;
}

async function validateBearerToken(token: string): Promise<AuthContext | null> {
  // In production, validates JWT or opaque token against auth service.
  // Validates token structure, signature, expiry, and audience.
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const payload = JSON.parse(atob(parts[1]!));
    const now = Math.floor(Date.now() / 1000);

    if (payload.exp && payload.exp < now) return null;
    if (!payload.sub) return null;

    return {
      accountId: payload.sub as string,
      keyId: payload.jti as string ?? `oauth_${Date.now()}`,
      tier: (payload.tier as PlanTier) ?? "starter",
      scopes: (payload.scope as string)?.split(" ") ?? [],
    };
  } catch {
    return null;
  }
}

function extractCredential(c: Context): { type: "api_key"; value: string } | { type: "bearer"; value: string } | null {
  const authHeader = c.req.header("Authorization");

  if (authHeader?.startsWith(BEARER_PREFIX)) {
    return { type: "bearer", value: authHeader.slice(BEARER_PREFIX.length) };
  }

  if (authHeader?.startsWith(API_KEY_PREFIX)) {
    return { type: "api_key", value: authHeader };
  }

  // Also check X-API-Key header
  const apiKeyHeader = c.req.header("X-API-Key");
  if (apiKeyHeader) {
    return { type: "api_key", value: apiKeyHeader };
  }

  return null;
}

export function requireScope(...requiredScopes: string[]) {
  return createMiddleware(async (c, next) => {
    const auth = c.get("auth");
    if (!auth) {
      return c.json(
        { error: { type: "authentication_error", message: "Not authenticated", code: "unauthenticated" } },
        401,
      );
    }

    const hasScope = requiredScopes.every((scope) => auth.scopes.includes(scope));
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
  });
}

export const authMiddleware = createMiddleware(async (c, next) => {
  const credential = extractCredential(c);

  if (!credential) {
    return c.json(
      {
        error: {
          type: "authentication_error",
          message: "Missing API key or Bearer token. Provide via Authorization header or X-API-Key header.",
          code: "missing_credentials",
        },
      },
      401,
    );
  }

  let authContext: AuthContext | null = null;

  if (credential.type === "api_key") {
    const keyRecord = await resolveApiKey(credential.value);
    if (!keyRecord) {
      return c.json(
        { error: { type: "authentication_error", message: "Invalid API key", code: "invalid_api_key" } },
        401,
      );
    }

    if (keyRecord.revokedAt) {
      return c.json(
        { error: { type: "authentication_error", message: "API key has been revoked", code: "revoked_api_key" } },
        401,
      );
    }

    if (keyRecord.expiresAt && new Date(keyRecord.expiresAt) < new Date()) {
      return c.json(
        { error: { type: "authentication_error", message: "API key has expired", code: "expired_api_key" } },
        401,
      );
    }

    authContext = {
      accountId: keyRecord.accountId,
      keyId: keyRecord.id,
      tier: keyRecord.tier,
      scopes: keyRecord.scopes,
    };
  } else {
    authContext = await validateBearerToken(credential.value);
    if (!authContext) {
      return c.json(
        { error: { type: "authentication_error", message: "Invalid or expired bearer token", code: "invalid_token" } },
        401,
      );
    }
  }

  c.set("auth", authContext);
  await next();
});
