/**
 * SSO Routes — SAML 2.0 Service Provider (SP) for Admin SSO
 *
 * GET  /v1/sso/metadata          — SP metadata (EntityDescriptor XML)
 * POST /v1/sso/login             — SP-initiated SSO: redirect to IdP
 * POST /v1/sso/acs               — Assertion Consumer Service: validate SAML response
 * POST /v1/sso/slo               — Single Logout endpoint
 * GET  /v1/sso/config            — Get current SSO configuration (admin only)
 * PUT  /v1/sso/config            — Update SSO configuration (admin only)
 *
 * Uses the jose library (approved stack) for JWT token signing/verification.
 */

import { Hono } from "hono";
import { z } from "zod";
import { SignJWT, jwtVerify, importPKCS8, importSPKI } from "jose";
import { eq } from "drizzle-orm";
import { validateBody, getValidatedBody } from "../middleware/validator.js";
import { getDatabase, users, accounts } from "@emailed/db";

const sso = new Hono();

// ─── Types ─────────────��───────────────────────��──────────────────────────────

interface SsoConfig {
  entityId: string;
  ssoUrl: string;
  sloUrl: string;
  certificate: string;
  enabled: boolean;
}

interface SamlAttribute {
  name: string;
  value: string;
}

// ─── In-memory SSO config store (will migrate to DB) ──────���───────────────────

const ssoConfigs = new Map<string, SsoConfig>();

// ─── Environment ──────────���──────────────────────────���────────────────────────

function getBaseUrl(): string {
  return process.env["API_BASE_URL"] ?? "https://api.48co.ai";
}

function getJwtSecret(): Uint8Array {
  const secret = process.env["JWT_SECRET"] ?? "dev_secret_replace_in_production";
  return new TextEncoder().encode(secret);
}

// ─── Helpers ──────���───────────────────────────��───────────────────────────────

function generateId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Create a signed JWT using the jose library.
 */
async function createSignedToken(payload: Record<string, unknown>): Promise<string> {
  const secret = getJwtSecret();

  const jwt = await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .setIssuer("vienna-sso")
    .sign(secret);

  return jwt;
}

/**
 * Verify a JWT using the jose library.
 */
async function verifyToken(token: string): Promise<Record<string, unknown> | null> {
  try {
    const secret = getJwtSecret();
    const { payload } = await jwtVerify(token, secret, {
      issuer: "vienna-sso",
    });
    return payload as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Decode base64-encoded SAML response and extract assertions.
 * This is a lightweight XML parser for SAML responses. In production,
 * a full XML signature verification library should be used.
 */
function decodeSamlResponse(samlResponseB64: string): {
  nameId: string;
  attributes: SamlAttribute[];
  issuer: string;
  sessionIndex: string;
} | null {
  try {
    const xml = atob(samlResponseB64);

    // Extract NameID
    const nameIdMatch = xml.match(/<(?:saml2?:)?NameID[^>]*>([^<]+)<\/(?:saml2?:)?NameID>/);
    if (!nameIdMatch?.[1]) return null;

    // Extract Issuer
    const issuerMatch = xml.match(/<(?:saml2?:)?Issuer[^>]*>([^<]+)<\/(?:saml2?:)?Issuer>/);

    // Extract SessionIndex from AuthnStatement
    const sessionIndexMatch = xml.match(/SessionIndex="([^"]+)"/);

    // Extract attributes
    const attributes: SamlAttribute[] = [];
    const attrRegex = /<(?:saml2?:)?Attribute\s+Name="([^"]+)"[^>]*>[\s\S]*?<(?:saml2?:)?AttributeValue[^>]*>([^<]+)<\/(?:saml2?:)?AttributeValue>[\s\S]*?<\/(?:saml2?:)?Attribute>/g;
    let attrMatch = attrRegex.exec(xml);
    while (attrMatch !== null) {
      if (attrMatch[1] && attrMatch[2]) {
        attributes.push({ name: attrMatch[1], value: attrMatch[2] });
      }
      attrMatch = attrRegex.exec(xml);
    }

    return {
      nameId: nameIdMatch[1],
      attributes,
      issuer: issuerMatch?.[1] ?? "unknown",
      sessionIndex: sessionIndexMatch?.[1] ?? generateId(),
    };
  } catch {
    return null;
  }
}

/**
 * Build a SAML AuthnRequest XML for SP-initiated SSO.
 */
function buildAuthnRequest(requestId: string, accountId: string): string {
  const config = ssoConfigs.get(accountId);
  if (!config) return "";

  const baseUrl = getBaseUrl();
  const issueInstant = new Date().toISOString();

  return [
    `<samlp:AuthnRequest`,
    `  xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"`,
    `  xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"`,
    `  ID="_${escapeXml(requestId)}"`,
    `  Version="2.0"`,
    `  IssueInstant="${escapeXml(issueInstant)}"`,
    `  Destination="${escapeXml(config.ssoUrl)}"`,
    `  AssertionConsumerServiceURL="${escapeXml(baseUrl)}/v1/sso/acs"`,
    `  ProtocolBinding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST">`,
    `  <saml:Issuer>${escapeXml(baseUrl)}/v1/sso/metadata</saml:Issuer>`,
    `  <samlp:NameIDPolicy Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress" AllowCreate="true"/>`,
    `</samlp:AuthnRequest>`,
  ].join("\n");
}

/**
 * Build a SAML LogoutRequest XML.
 */
function buildLogoutRequest(requestId: string, nameId: string, sessionIndex: string, accountId: string): string {
  const config = ssoConfigs.get(accountId);
  if (!config) return "";

  const baseUrl = getBaseUrl();
  const issueInstant = new Date().toISOString();

  return [
    `<samlp:LogoutRequest`,
    `  xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"`,
    `  xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"`,
    `  ID="_${escapeXml(requestId)}"`,
    `  Version="2.0"`,
    `  IssueInstant="${escapeXml(issueInstant)}"`,
    `  Destination="${escapeXml(config.sloUrl)}">`,
    `  <saml:Issuer>${escapeXml(baseUrl)}/v1/sso/metadata</saml:Issuer>`,
    `  <saml:NameID Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress">${escapeXml(nameId)}</saml:NameID>`,
    `  <samlp:SessionIndex>${escapeXml(sessionIndex)}</samlp:SessionIndex>`,
    `</samlp:LogoutRequest>`,
  ].join("\n");
}

// ─── Schemas ──────���───────────────────────────��───────────────────────────────

const SsoConfigSchema = z.object({
  entityId: z.string().url().min(1),
  ssoUrl: z.string().url().min(1),
  sloUrl: z.string().url().min(1),
  certificate: z.string().min(1),
  enabled: z.boolean(),
});

const SsoLoginSchema = z.object({
  accountId: z.string().min(1),
  returnUrl: z.string().url().optional(),
});

const SsoAcsSchema = z.object({
  SAMLResponse: z.string().min(1),
  RelayState: z.string().optional(),
});

const SsoSloSchema = z.object({
  SAMLRequest: z.string().optional(),
  SAMLResponse: z.string().optional(),
  RelayState: z.string().optional(),
});

// ─── GET /v1/sso/metadata — SP Metadata ──────────────────────────────────────

sso.get("/metadata", (c) => {
  const baseUrl = getBaseUrl();

  const metadata = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<md:EntityDescriptor`,
    `  xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata"`,
    `  entityID="${escapeXml(baseUrl)}/v1/sso/metadata">`,
    `  <md:SPSSODescriptor`,
    `    AuthnRequestsSigned="false"`,
    `    WantAssertionsSigned="true"`,
    `    protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">`,
    `    <md:SingleLogoutService`,
    `      Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"`,
    `      Location="${escapeXml(baseUrl)}/v1/sso/slo"/>`,
    `    <md:NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</md:NameIDFormat>`,
    `    <md:AssertionConsumerService`,
    `      Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"`,
    `      Location="${escapeXml(baseUrl)}/v1/sso/acs"`,
    `      index="0"`,
    `      isDefault="true"/>`,
    `  </md:SPSSODescriptor>`,
    `  <md:Organization>`,
    `    <md:OrganizationName xml:lang="en">Vienna</md:OrganizationName>`,
    `    <md:OrganizationDisplayName xml:lang="en">Vienna Email</md:OrganizationDisplayName>`,
    `    <md:OrganizationURL xml:lang="en">https://48co.ai</md:OrganizationURL>`,
    `  </md:Organization>`,
    `</md:EntityDescriptor>`,
  ].join("\n");

  return c.text(metadata, 200, {
    "Content-Type": "application/xml",
    "Cache-Control": "public, max-age=86400",
  });
});

// ─── POST /v1/sso/login — SP-initiated SSO ──────────────────────────────────

sso.post("/login", validateBody(SsoLoginSchema), async (c) => {
  const input = getValidatedBody<z.infer<typeof SsoLoginSchema>>(c);
  const config = ssoConfigs.get(input.accountId);

  if (!config || !config.enabled) {
    return c.json(
      {
        error: {
          type: "configuration_error",
          message: "SSO is not configured or not enabled for this account",
          code: "sso_not_configured",
        },
      },
      404,
    );
  }

  const requestId = generateId();
  const authnRequest = buildAuthnRequest(requestId, input.accountId);
  const encodedRequest = btoa(authnRequest);

  const relayState = JSON.stringify({
    accountId: input.accountId,
    returnUrl: input.returnUrl ?? "https://admin.48co.ai",
    requestId,
  });

  // Build the redirect URL for SP-initiated SSO (HTTP-Redirect binding)
  const redirectUrl = new URL(config.ssoUrl);
  redirectUrl.searchParams.set("SAMLRequest", encodedRequest);
  redirectUrl.searchParams.set("RelayState", btoa(relayState));

  return c.json({
    data: {
      redirectUrl: redirectUrl.toString(),
      requestId,
    },
  });
});

// ─── POST /v1/sso/acs — Assertion Consumer Service ──────────────────────────

sso.post("/acs", validateBody(SsoAcsSchema), async (c) => {
  const input = getValidatedBody<z.infer<typeof SsoAcsSchema>>(c);

  // Decode SAML Response
  const assertion = decodeSamlResponse(input.SAMLResponse);
  if (!assertion) {
    return c.json(
      {
        error: {
          type: "authentication_error",
          message: "Invalid SAML response: could not decode assertion",
          code: "invalid_saml_response",
        },
      },
      400,
    );
  }

  // Parse RelayState to get account context
  let relayState: { accountId: string; returnUrl: string; requestId: string } | null = null;
  if (input.RelayState) {
    try {
      relayState = JSON.parse(atob(input.RelayState)) as {
        accountId: string;
        returnUrl: string;
        requestId: string;
      };
    } catch {
      // RelayState is optional; proceed without it
    }
  }

  const accountId = relayState?.accountId;
  if (!accountId) {
    return c.json(
      {
        error: {
          type: "authentication_error",
          message: "Missing account context in SSO flow",
          code: "missing_account_context",
        },
      },
      400,
    );
  }

  // Verify SSO is configured for this account
  const config = ssoConfigs.get(accountId);
  if (!config || !config.enabled) {
    return c.json(
      {
        error: {
          type: "configuration_error",
          message: "SSO is not configured for the target account",
          code: "sso_not_configured",
        },
      },
      403,
    );
  }

  // Verify the issuer matches the configured IdP entity ID
  if (assertion.issuer !== config.entityId && assertion.issuer !== "unknown") {
    return c.json(
      {
        error: {
          type: "authentication_error",
          message: "SAML issuer does not match configured IdP entity ID",
          code: "issuer_mismatch",
        },
      },
      403,
    );
  }

  const email = assertion.nameId.toLowerCase();

  // Look up or create the user in the database
  const db = getDatabase();

  const [existingUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  let userId: string;
  let userName: string;
  let userRole: string;

  if (existingUser) {
    // Verify user belongs to this account
    if (existingUser.accountId !== accountId) {
      return c.json(
        {
          error: {
            type: "authorization_error",
            message: "User account does not match SSO account",
            code: "account_mismatch",
          },
        },
        403,
      );
    }

    userId = existingUser.id;
    userName = existingUser.name;
    userRole = existingUser.role;

    // Update last login
    await db
      .update(users)
      .set({ lastLoginAt: new Date() })
      .where(eq(users.id, userId));
  } else {
    // Extract name from SAML attributes
    const nameAttr = assertion.attributes.find(
      (a) =>
        a.name === "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name" ||
        a.name === "displayName" ||
        a.name === "cn",
    );

    userId = generateId();
    userName = nameAttr?.value ?? email.split("@")[0] ?? "SSO User";
    userRole = "member";

    // Create the user via SSO (no password)
    await db.insert(users).values({
      id: userId,
      accountId,
      email,
      name: userName,
      passwordHash: null,
      role: "member",
      emailVerified: true, // SSO-verified
      permissions: {
        sendEmail: true,
        readEmail: true,
        manageDomains: false,
        manageApiKeys: false,
        manageWebhooks: false,
        viewAnalytics: true,
        manageAccount: false,
        manageTeamMembers: false,
      },
    });
  }

  // Create a signed JWT token using jose
  const token = await createSignedToken({
    sub: accountId,
    userId,
    email,
    role: userRole,
    ssoSessionIndex: assertion.sessionIndex,
    ssoIssuer: assertion.issuer,
  });

  const returnUrl = relayState?.returnUrl ?? "https://admin.48co.ai";

  // Return token + redirect info
  return c.json({
    data: {
      token,
      user: {
        id: userId,
        email,
        name: userName,
        role: userRole,
        accountId,
      },
      returnUrl,
      ssoSessionIndex: assertion.sessionIndex,
    },
  });
});

// ─── POST /v1/sso/slo — Single Logout ────────────────────────���─────────────

sso.post("/slo", validateBody(SsoSloSchema), async (c) => {
  const input = getValidatedBody<z.infer<typeof SsoSloSchema>>(c);

  // IdP-initiated SLO: we receive a LogoutRequest
  if (input.SAMLRequest) {
    // Decode and acknowledge the logout request
    try {
      const xml = atob(input.SAMLRequest);
      const nameIdMatch = xml.match(/<(?:saml2?:)?NameID[^>]*>([^<]+)<\/(?:saml2?:)?NameID>/);
      const email = nameIdMatch?.[1]?.toLowerCase();

      if (email) {
        // Mark user session as invalidated
        // In a production system, this would invalidate the JWT in a blocklist
        const db = getDatabase();
        await db
          .update(users)
          .set({ updatedAt: new Date() })
          .where(eq(users.email, email));
      }
    } catch {
      // Log but don't fail — logout should be best-effort
    }

    // Return a LogoutResponse
    const baseUrl = getBaseUrl();
    const responseId = generateId();
    const logoutResponse = [
      `<samlp:LogoutResponse`,
      `  xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"`,
      `  ID="_${escapeXml(responseId)}"`,
      `  Version="2.0"`,
      `  IssueInstant="${escapeXml(new Date().toISOString())}">`,
      `  <saml:Issuer xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion">${escapeXml(baseUrl)}/v1/sso/metadata</saml:Issuer>`,
      `  <samlp:Status>`,
      `    <samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/>`,
      `  </samlp:Status>`,
      `</samlp:LogoutResponse>`,
    ].join("\n");

    return c.text(logoutResponse, 200, {
      "Content-Type": "application/xml",
    });
  }

  // SP-initiated SLO response: we get back a SAMLResponse confirming logout
  if (input.SAMLResponse) {
    // IdP confirmed logout — clear session on our side
    return c.json({
      data: {
        message: "Logout confirmed by identity provider",
        loggedOut: true,
      },
    });
  }

  return c.json(
    {
      error: {
        type: "validation_error",
        message: "Either SAMLRequest or SAMLResponse is required",
        code: "missing_saml_payload",
      },
    },
    400,
  );
});

// ─── POST /v1/sso/logout — SP-initiated SLO (starts logout flow) ────────────

const SsoLogoutSchema = z.object({
  accountId: z.string().min(1),
  email: z.string().email(),
  sessionIndex: z.string().min(1),
});

sso.post("/logout", validateBody(SsoLogoutSchema), async (c) => {
  const input = getValidatedBody<z.infer<typeof SsoLogoutSchema>>(c);
  const config = ssoConfigs.get(input.accountId);

  if (!config || !config.enabled || !config.sloUrl) {
    // No SLO configured — just acknowledge the logout
    return c.json({
      data: {
        loggedOut: true,
        message: "Session cleared (no IdP SLO configured)",
      },
    });
  }

  const requestId = generateId();
  const logoutRequest = buildLogoutRequest(requestId, input.email, input.sessionIndex, input.accountId);
  const encodedRequest = btoa(logoutRequest);

  const redirectUrl = new URL(config.sloUrl);
  redirectUrl.searchParams.set("SAMLRequest", encodedRequest);

  return c.json({
    data: {
      redirectUrl: redirectUrl.toString(),
      requestId,
    },
  });
});

// ─── GET /v1/sso/config — Get SSO configuration ────────��────────────────────

sso.get("/config", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json(
      {
        error: {
          type: "authentication_error",
          message: "Admin authentication required",
          code: "unauthenticated",
        },
      },
      401,
    );
  }

  const token = authHeader.slice(7);
  const payload = await verifyToken(token);
  if (!payload) {
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

  const accountId = payload["sub"] as string;
  const config = ssoConfigs.get(accountId);

  return c.json({
    data: config
      ? {
          entityId: config.entityId,
          ssoUrl: config.ssoUrl,
          sloUrl: config.sloUrl,
          certificateConfigured: config.certificate.length > 0,
          enabled: config.enabled,
        }
      : null,
  });
});

// ─── PUT /v1/sso/config — Update SSO configuration ──────────────────────────

sso.put("/config", validateBody(SsoConfigSchema), async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json(
      {
        error: {
          type: "authentication_error",
          message: "Admin authentication required",
          code: "unauthenticated",
        },
      },
      401,
    );
  }

  const token = authHeader.slice(7);
  const payload = await verifyToken(token);
  if (!payload) {
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

  // Verify admin/owner role
  const role = payload["role"] as string;
  if (role !== "owner" && role !== "admin") {
    return c.json(
      {
        error: {
          type: "authorization_error",
          message: "Only account owners and admins can configure SSO",
          code: "insufficient_permissions",
        },
      },
      403,
    );
  }

  const accountId = payload["sub"] as string;
  const input = getValidatedBody<z.infer<typeof SsoConfigSchema>>(c);

  ssoConfigs.set(accountId, {
    entityId: input.entityId,
    ssoUrl: input.ssoUrl,
    sloUrl: input.sloUrl,
    certificate: input.certificate,
    enabled: input.enabled,
  });

  return c.json({
    data: {
      message: "SSO configuration updated",
      entityId: input.entityId,
      ssoUrl: input.ssoUrl,
      sloUrl: input.sloUrl,
      enabled: input.enabled,
    },
  });
});

// ─── GET /v1/sso/verify — Verify an SSO token (for admin app) ───────────────

sso.get("/verify", async (c) => {
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
  const payload = await verifyToken(token);
  if (!payload) {
    return c.json(
      {
        error: {
          type: "authentication_error",
          message: "Invalid or expired SSO token",
          code: "invalid_token",
        },
      },
      401,
    );
  }

  return c.json({
    data: {
      valid: true,
      userId: payload["userId"],
      email: payload["email"],
      role: payload["role"],
      accountId: payload["sub"],
      ssoIssuer: payload["ssoIssuer"] ?? null,
    },
  });
});

export { sso };
