/**
 * Connect Route — OAuth Account Linking (Gmail, Outlook, IMAP)
 *
 * GET  /v1/connect/gmail          — Start Gmail OAuth flow
 * GET  /v1/connect/outlook        — Start Outlook OAuth flow
 * GET  /v1/connect/callback/gmail — Gmail OAuth callback
 * GET  /v1/connect/callback/outlook — Outlook OAuth callback
 * POST /v1/connect/imap           — Connect generic IMAP account
 * GET  /v1/connect/accounts       — List connected accounts
 * DELETE /v1/connect/accounts/:id — Disconnect an account
 * POST /v1/connect/accounts/:id/sync — Trigger manual sync
 */

import { Hono } from "hono";
import { z } from "zod";
import { createHmac, timingSafeEqual } from "node:crypto";
import { requireScope } from "../middleware/auth.js";
import { validateBody, getValidatedBody } from "../middleware/validator.js";
import {
  getGoogleAuthUrl,
  exchangeGoogleCode,
  getMicrosoftAuthUrl,
  exchangeMicrosoftCode,
  syncAccount,
  type EmailAccount,
} from "../sync/engine.js";

// In-memory account store (production: DB table)
const accountStore = new Map<string, EmailAccount[]>();

function generateId(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

// ─── OAuth state signing (HMAC-SHA256) ────────────────────────────────────────
//
// The OAuth `state` parameter carries the initiating user's accountId across
// the Google/Microsoft redirect. Without a signature the callback has no way
// to prove the state wasn't forged by an attacker — a crafted URL could bind
// the attacker's tokens to the victim's accountId (account takeover).
//
// We therefore sign the base64url(JSON) payload with HMAC-SHA256 using
// OAUTH_STATE_SECRET and verify it in the callback before trusting `userId`.

function getOauthStateSecret(): string {
  const secret = process.env["OAUTH_STATE_SECRET"];
  if (!secret) {
    // Fail loudly instead of silently using a dev default — an unsigned
    // state in production is an account-takeover vector.
    throw new Error("OAUTH_STATE_SECRET is not set");
  }
  return secret;
}

function toBase64Url(input: Buffer): string {
  return input.toString("base64url");
}

function signOauthState(payload: Record<string, unknown>): string {
  const payloadB64 = toBase64Url(Buffer.from(JSON.stringify(payload)));
  const sig = createHmac("sha256", getOauthStateSecret())
    .update(payloadB64)
    .digest();
  return `${payloadB64}.${toBase64Url(sig)}`;
}

interface VerifiedState {
  userId: string;
  provider?: string;
  ts?: number;
}

function verifyOauthState(signed: string): VerifiedState | null {
  const dot = signed.indexOf(".");
  if (dot <= 0 || dot === signed.length - 1) return null;
  const payloadB64 = signed.slice(0, dot);
  const sigB64 = signed.slice(dot + 1);

  const expectedSig = createHmac("sha256", getOauthStateSecret())
    .update(payloadB64)
    .digest();
  let providedSig: Buffer;
  try {
    providedSig = Buffer.from(sigB64, "base64url");
  } catch {
    return null;
  }
  if (providedSig.length !== expectedSig.length) return null;
  if (!timingSafeEqual(providedSig, expectedSig)) return null;

  try {
    const json = Buffer.from(payloadB64, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as {
      userId?: unknown;
      provider?: unknown;
      ts?: unknown;
    };
    if (typeof parsed.userId !== "string" || parsed.userId.length === 0) {
      return null;
    }
    const result: VerifiedState = { userId: parsed.userId };
    if (typeof parsed.provider === "string") result.provider = parsed.provider;
    if (typeof parsed.ts === "number") result.ts = parsed.ts;
    return result;
  } catch {
    return null;
  }
}

const ImapConnectSchema = z.object({
  email: z.string().email(),
  displayName: z.string().optional(),
  imapHost: z.string(),
  imapPort: z.number().int().default(993),
  imapUsername: z.string(),
  imapPassword: z.string(),
  imapTls: z.boolean().default(true),
  smtpHost: z.string(),
  smtpPort: z.number().int().default(587),
  smtpUsername: z.string(),
  smtpPassword: z.string(),
  smtpTls: z.boolean().default(true),
});

const connect = new Hono();

// GET /v1/connect/gmail — Start Gmail OAuth
connect.get(
  "/gmail",
  requireScope("accounts:write"),
  (c) => {
    const auth = c.get("auth");
    const state = signOauthState({
      userId: auth.accountId,
      provider: "gmail",
      ts: Date.now(),
    });

    return c.redirect(getGoogleAuthUrl(state));
  },
);

// GET /v1/connect/outlook — Start Outlook OAuth
connect.get(
  "/outlook",
  requireScope("accounts:write"),
  (c) => {
    const auth = c.get("auth");
    const state = signOauthState({
      userId: auth.accountId,
      provider: "outlook",
      ts: Date.now(),
    });

    return c.redirect(getMicrosoftAuthUrl(state));
  },
);

// GET /v1/connect/callback/gmail — Gmail OAuth callback
connect.get(
  "/callback/gmail",
  async (c) => {
    const code = c.req.query("code");
    const stateParam = c.req.query("state");

    if (!code || !stateParam) {
      return c.json({ error: { message: "Missing code or state" } }, 400);
    }

    const state = verifyOauthState(stateParam);
    if (!state) {
      return c.json({ error: { message: "invalid oauth state" } }, 400);
    }

    try {
      const tokens = await exchangeGoogleCode(code);

      const account: EmailAccount = {
        id: generateId(),
        userId: state.userId,
        provider: "gmail",
        email: tokens.email,
        displayName: tokens.name,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
        status: "active",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const existing = accountStore.get(state.userId) ?? [];
      accountStore.set(state.userId, [...existing, account]);

      // Trigger initial sync in background
      syncAccount(account).catch((err) => {
        console.error(`[connect] Initial Gmail sync failed for ${account.email}:`, err);
      });

      // Redirect to web app
      const webUrl = process.env["WEB_URL"] ?? "https://mail.alecrae.com";
      return c.redirect(`${webUrl}/settings/accounts?connected=gmail&email=${encodeURIComponent(tokens.email)}`);
    } catch (err) {
      return c.json({ error: { message: `Gmail auth failed: ${err}` } }, 500);
    }
  },
);

// GET /v1/connect/callback/outlook — Outlook OAuth callback
connect.get(
  "/callback/outlook",
  async (c) => {
    const code = c.req.query("code");
    const stateParam = c.req.query("state");

    if (!code || !stateParam) {
      return c.json({ error: { message: "Missing code or state" } }, 400);
    }

    const state = verifyOauthState(stateParam);
    if (!state) {
      return c.json({ error: { message: "invalid oauth state" } }, 400);
    }

    try {
      const tokens = await exchangeMicrosoftCode(code);

      const account: EmailAccount = {
        id: generateId(),
        userId: state.userId,
        provider: "outlook",
        email: tokens.email,
        displayName: tokens.name,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
        status: "active",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const existing = accountStore.get(state.userId) ?? [];
      accountStore.set(state.userId, [...existing, account]);

      syncAccount(account).catch((err) => {
        console.error(`[connect] Initial Outlook sync failed for ${account.email}:`, err);
      });

      const webUrl = process.env["WEB_URL"] ?? "https://mail.alecrae.com";
      return c.redirect(`${webUrl}/settings/accounts?connected=outlook&email=${encodeURIComponent(tokens.email)}`);
    } catch (err) {
      return c.json({ error: { message: `Outlook auth failed: ${err}` } }, 500);
    }
  },
);

// POST /v1/connect/imap — Connect generic IMAP account
connect.post(
  "/imap",
  requireScope("accounts:write"),
  validateBody(ImapConnectSchema),
  (c) => {
    const input = getValidatedBody<z.infer<typeof ImapConnectSchema>>(c);
    const auth = c.get("auth");

    const account: EmailAccount = {
      id: generateId(),
      userId: auth.accountId,
      provider: "imap",
      email: input.email,
      displayName: input.displayName ?? input.email,
      imapHost: input.imapHost,
      imapPort: input.imapPort,
      imapUsername: input.imapUsername,
      imapPassword: input.imapPassword,
      imapTls: input.imapTls,
      smtpHost: input.smtpHost,
      smtpPort: input.smtpPort,
      smtpUsername: input.smtpUsername,
      smtpPassword: input.smtpPassword,
      smtpTls: input.smtpTls,
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const existing = accountStore.get(auth.accountId) ?? [];
    accountStore.set(auth.accountId, [...existing, account]);

    return c.json({
      data: {
        id: account.id,
        provider: "imap",
        email: account.email,
        status: "active",
        message: "IMAP account connected. Sync will begin shortly.",
      },
    }, 201);
  },
);

// GET /v1/connect/accounts — List connected accounts
connect.get(
  "/accounts",
  requireScope("accounts:read"),
  (c) => {
    const auth = c.get("auth");
    const accounts = (accountStore.get(auth.accountId) ?? []).map((a) => ({
      id: a.id,
      provider: a.provider,
      email: a.email,
      displayName: a.displayName,
      status: a.status,
      lastSyncAt: a.lastSyncAt?.toISOString() ?? null,
      createdAt: a.createdAt.toISOString(),
    }));

    return c.json({ data: accounts });
  },
);

// DELETE /v1/connect/accounts/:id — Disconnect an account
connect.delete(
  "/accounts/:id",
  requireScope("accounts:write"),
  (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth");

    const accounts = accountStore.get(auth.accountId) ?? [];
    const filtered = accounts.filter((a) => a.id !== id);

    if (filtered.length === accounts.length) {
      return c.json({ error: { message: "Account not found" } }, 404);
    }

    accountStore.set(auth.accountId, filtered);
    return c.json({ data: { deleted: true, id } });
  },
);

// POST /v1/connect/accounts/:id/sync — Trigger manual sync
connect.post(
  "/accounts/:id/sync",
  requireScope("accounts:write"),
  async (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth");

    const accounts = accountStore.get(auth.accountId) ?? [];
    const account = accounts.find((a) => a.id === id);

    if (!account) {
      return c.json({ error: { message: "Account not found" } }, 404);
    }

    const result = await syncAccount(account);

    return c.json({
      data: {
        accountId: id,
        ...result,
      },
    });
  },
);

export { connect };
