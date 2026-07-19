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
import { requireScope } from "../middleware/auth.js";
import { validateBody, getValidatedBody } from "../middleware/validator.js";
import {
  getGoogleAuthUrl,
  exchangeGoogleCode,
  getMicrosoftAuthUrl,
  exchangeMicrosoftCode,
  type EmailAccount,
} from "../sync/engine.js";
import { getDatabase, connectedAccounts } from "@alecrae/db";
import { eq, and } from "drizzle-orm";
import { signState, verifyState } from "../lib/oauth-state.js";
import { syncAndPersist } from "../lib/mailbox-sync-worker.js";

/** Fire off the initial sync in the background and persist whatever it finds
 *  (or fails on) — never left as a bare `.catch(console.error)` that discards
 *  the sync's cursor/refreshed-token/error state. */
function kickOffInitialSync(accountId: string, providerLabel: string, email: string): void {
  const db = getDatabase();
  db.select()
    .from(connectedAccounts)
    .where(eq(connectedAccounts.id, accountId))
    .limit(1)
    .then(async ([row]) => {
      if (!row) return;
      await syncAndPersist(row);
    })
    .catch((err) => {
      console.error(`[connect] Initial ${providerLabel} sync failed for ${email}:`, err);
    });
}

function generateId(): string {
  return crypto.randomUUID().replace(/-/g, "");
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

// GET /v1/connect/gmail — Returns the Google OAuth consent URL.
//
// Returns JSON (not a redirect) so the web client can call it with an
// authenticated fetch and then navigate. A top-level browser redirect to this
// endpoint can't carry a Bearer header, so the previous redirect form always
// 401'd. The signed `state` carries the user identity through to the public
// callback, so no AlecRae token is ever placed in a URL. Scope is the
// satisfiable `account:manage` (the old `accounts:write` was never granted to
// any token, so the route always 403'd).
connect.get(
  "/gmail",
  requireScope("account:manage"),
  async (c) => {
    const auth = c.get("auth");
    const state = await signState({
      userId: auth.accountId,
      provider: "gmail",
    });

    return c.json({ data: { url: getGoogleAuthUrl(state) } });
  },
);

// GET /v1/connect/outlook — Returns the Microsoft OAuth consent URL (see /gmail).
connect.get(
  "/outlook",
  requireScope("account:manage"),
  async (c) => {
    const auth = c.get("auth");
    const state = await signState({
      userId: auth.accountId,
      provider: "outlook",
    });

    return c.json({ data: { url: getMicrosoftAuthUrl(state) } });
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

    const stateResult = await verifyState(stateParam);
    if (!stateResult.ok) {
      return c.json({ error: { message: "Invalid or expired OAuth state" } }, 400);
    }
    if (stateResult.payload.provider !== "gmail") {
      return c.json({ error: { message: "OAuth state provider mismatch" } }, 400);
    }
    const state = stateResult.payload;

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

      const db = getDatabase();
      const now = new Date();
      await db.insert(connectedAccounts).values({
        id: account.id,
        accountId: state.userId,
        provider: "gmail",
        email: tokens.email,
        displayName: tokens.name ?? null,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
        status: "active",
        createdAt: now,
        updatedAt: now,
      });

      kickOffInitialSync(account.id, "Gmail", account.email);

      const webUrl = process.env["WEB_URL"] ?? "https://mail.alecrae.com";
      return c.redirect(`${webUrl}/onboarding?connected=gmail&email=${encodeURIComponent(tokens.email)}`);
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

    const stateResult = await verifyState(stateParam);
    if (!stateResult.ok) {
      return c.json({ error: { message: "Invalid or expired OAuth state" } }, 400);
    }
    if (stateResult.payload.provider !== "outlook") {
      return c.json({ error: { message: "OAuth state provider mismatch" } }, 400);
    }
    const state = stateResult.payload;

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

      const db = getDatabase();
      const now = new Date();
      await db.insert(connectedAccounts).values({
        id: account.id,
        accountId: state.userId,
        provider: "outlook",
        email: tokens.email,
        displayName: tokens.name ?? null,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
        status: "active",
        createdAt: now,
        updatedAt: now,
      });

      kickOffInitialSync(account.id, "Outlook", account.email);

      const webUrl = process.env["WEB_URL"] ?? "https://mail.alecrae.com";
      return c.redirect(`${webUrl}/onboarding?connected=outlook&email=${encodeURIComponent(tokens.email)}`);
    } catch (err) {
      return c.json({ error: { message: `Outlook auth failed: ${err}` } }, 500);
    }
  },
);

// POST /v1/connect/imap — Connect generic IMAP account
connect.post(
  "/imap",
  requireScope("account:manage"),
  validateBody(ImapConnectSchema),
  async (c) => {
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

    const db = getDatabase();
    const now = new Date();
    await db.insert(connectedAccounts).values({
      id: account.id,
      accountId: auth.accountId,
      provider: "imap",
      email: input.email,
      displayName: input.displayName ?? input.email,
      imapHost: input.imapHost,
      imapPort: String(input.imapPort),
      imapUsername: input.imapUsername,
      imapPassword: input.imapPassword,
      smtpHost: input.smtpHost,
      smtpPort: String(input.smtpPort),
      smtpUsername: input.smtpUsername,
      smtpPassword: input.smtpPassword,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

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
  requireScope("account:read"),
  async (c) => {
    const auth = c.get("auth");
    const db = getDatabase();

    const rows = await db
      .select({
        id: connectedAccounts.id,
        provider: connectedAccounts.provider,
        email: connectedAccounts.email,
        displayName: connectedAccounts.displayName,
        status: connectedAccounts.status,
        lastSyncAt: connectedAccounts.lastSyncAt,
        lastError: connectedAccounts.lastError,
        createdAt: connectedAccounts.createdAt,
      })
      .from(connectedAccounts)
      .where(eq(connectedAccounts.accountId, auth.accountId));

    return c.json({
      data: rows.map((a) => ({
        ...a,
        lastSyncAt: a.lastSyncAt?.toISOString() ?? null,
        createdAt: a.createdAt.toISOString(),
      })),
    });
  },
);

// DELETE /v1/connect/accounts/:id — Disconnect an account
connect.delete(
  "/accounts/:id",
  requireScope("account:manage"),
  async (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth");
    const db = getDatabase();

    const [existing] = await db
      .select({ id: connectedAccounts.id })
      .from(connectedAccounts)
      .where(and(eq(connectedAccounts.id, id), eq(connectedAccounts.accountId, auth.accountId)))
      .limit(1);

    if (!existing) {
      return c.json({ error: { message: "Account not found" } }, 404);
    }

    await db.delete(connectedAccounts)
      .where(and(eq(connectedAccounts.id, id), eq(connectedAccounts.accountId, auth.accountId)));

    return c.json({ data: { deleted: true, id } });
  },
);

// POST /v1/connect/accounts/:id/sync — Trigger manual sync
connect.post(
  "/accounts/:id/sync",
  requireScope("account:manage"),
  async (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth");
    const db = getDatabase();

    const [row] = await db
      .select()
      .from(connectedAccounts)
      .where(and(eq(connectedAccounts.id, id), eq(connectedAccounts.accountId, auth.accountId)))
      .limit(1);

    if (!row) {
      return c.json({ error: { message: "Account not found" } }, 404);
    }

    const result = await syncAndPersist(row);

    return c.json({
      data: {
        accountId: id,
        ...result,
      },
    });
  },
);

export { connect };
