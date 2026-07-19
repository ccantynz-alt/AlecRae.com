/**
 * Google Workspace Import — domain-wide migration onto AlecRae.
 *
 * GET  /v1/import/workspace/start     — admin authorizes (Directory scope)
 * GET  /v1/import/workspace/callback  — store admin token, redirect to web
 * GET  /v1/import/workspace/users     — list the domain's Workspace users
 * POST /v1/import/workspace/provision — bulk-create native mailboxes from users
 *
 * The admin OAuth grant is stored in connected_accounts with status
 * 'workspace_admin' (email = admin, sync_cursor = domain) to distinguish it from
 * a normal single-mailbox Gmail connection. Per-user MAIL migration (Phase 2)
 * reuses the existing /v1/import pipeline.
 */

import { Hono } from "hono";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import crypto from "node:crypto";
import { requireScope } from "../middleware/auth.js";
import { validateBody, getValidatedBody } from "../middleware/validator.js";
import {
  getDatabase,
  connectedAccounts,
  mailboxes as mailboxesTable,
  domains as domainsTable,
} from "@alecrae/db";
import { signState, verifyState } from "../lib/oauth-state.js";
import { encryptSecret, encryptSecretOrNull, decryptSecret } from "../lib/token-crypto.js";
import {
  isWorkspaceImportConfigured,
  getWorkspaceAuthUrl,
  exchangeWorkspaceCode,
  listWorkspaceUsers,
} from "../lib/google-workspace.js";

const workspaceImport = new Hono();

const WEB_URL = process.env["WEB_URL"] ?? "https://mail.alecrae.com";
const WORKSPACE_ADMIN_STATUS = "workspace_admin";

function genId(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

// GET /start — begin admin OAuth (Directory read scope)
workspaceImport.get("/start", requireScope("domains:manage"), async (c) => {
  if (!isWorkspaceImportConfigured()) {
    return c.redirect(`${WEB_URL}/onboarding?error=workspace_unavailable`);
  }
  try {
    // Carry the accountId through the signed state (CSRF). The callback is
    // unauthenticated (Google redirect) so this is how it knows whose account
    // the grant belongs to.
    const auth = c.get("auth");
    const state = await signState({ userId: auth.accountId, provider: "gmail" });
    return c.redirect(getWorkspaceAuthUrl(state));
  } catch (err) {
    console.error("[workspace-import] failed to start:", err);
    return c.redirect(`${WEB_URL}/onboarding?error=workspace_unavailable`);
  }
});

// GET /callback — exchange code, persist admin grant, redirect to web
workspaceImport.get("/callback", async (c) => {
  const code = c.req.query("code");
  const stateParam = c.req.query("state");
  if (!code || !stateParam) {
    return c.redirect(`${WEB_URL}/onboarding?error=workspace_failed`);
  }

  try {
    const stateResult = await verifyState(stateParam);
    if (!stateResult.ok) {
      return c.redirect(`${WEB_URL}/onboarding?error=workspace_state_invalid`);
    }
    const accountId = stateResult.payload.userId; // carried accountId

    const tokens = await exchangeWorkspaceCode(code);
    const db = getDatabase();
    const expiresAt = new Date(Date.now() + tokens.expiresInSeconds * 1000);

    // Replace any prior admin grant for this account.
    await db
      .delete(connectedAccounts)
      .where(
        and(
          eq(connectedAccounts.accountId, accountId),
          eq(connectedAccounts.status, WORKSPACE_ADMIN_STATUS),
        ),
      );

    await db.insert(connectedAccounts).values({
      id: genId(),
      accountId,
      provider: "gmail",
      email: tokens.adminEmail,
      displayName: `Workspace admin (${tokens.domain})`,
      accessToken: encryptSecret(tokens.accessToken),
      refreshToken: encryptSecretOrNull(tokens.refreshToken),
      tokenExpiresAt: expiresAt,
      syncCursor: tokens.domain, // store the domain for later lookups
      status: WORKSPACE_ADMIN_STATUS,
    });

    return c.redirect(
      `${WEB_URL}/onboarding?workspace=connected&domain=${encodeURIComponent(tokens.domain)}`,
    );
  } catch (err) {
    console.error("[workspace-import] callback failed:", err);
    return c.redirect(`${WEB_URL}/onboarding?error=workspace_failed`);
  }
});

// Helper: find the most recent Workspace admin grant for the account.
async function getAdminGrant(
  accountId: string,
): Promise<{ accessToken: string; domain: string } | null> {
  const db = getDatabase();
  const [row] = await db
    .select({
      accessToken: connectedAccounts.accessToken,
      domain: connectedAccounts.syncCursor,
    })
    .from(connectedAccounts)
    .where(
      and(
        eq(connectedAccounts.accountId, accountId),
        eq(connectedAccounts.status, WORKSPACE_ADMIN_STATUS),
      ),
    )
    .orderBy(desc(connectedAccounts.createdAt))
    .limit(1);

  if (!row?.accessToken || !row.domain) return null;
  return { accessToken: decryptSecret(row.accessToken), domain: row.domain };
}

// GET /users — list the connected Workspace domain's users
workspaceImport.get("/users", requireScope("domains:manage"), async (c) => {
  const auth = c.get("auth");
  const grant = await getAdminGrant(auth.accountId);
  if (!grant) {
    return c.json(
      {
        error: {
          type: "validation_error",
          message:
            "No Google Workspace admin is connected. Start at GET /v1/import/workspace/start.",
          code: "workspace_not_connected",
        },
      },
      400,
    );
  }

  try {
    const users = await listWorkspaceUsers(grant.accessToken, grant.domain);
    return c.json({ domain: grant.domain, count: users.length, users });
  } catch (err) {
    // Most likely an expired access token — prompt a reconnect.
    console.error("[workspace-import] users.list failed:", err);
    return c.json(
      {
        error: {
          type: "authentication_error",
          message:
            "Could not read the Workspace directory (the admin grant may have expired). Reconnect at GET /v1/import/workspace/start.",
          code: "workspace_directory_failed",
        },
      },
      401,
    );
  }
});

const ProvisionSchema = z.object({
  domain: z.string().min(1).transform((s) => s.toLowerCase()),
  users: z
    .array(
      z.object({
        email: z.string().email().transform((s) => s.toLowerCase()),
        displayName: z.string().max(200).optional(),
      }),
    )
    .min(1)
    .max(1000),
});

// POST /provision — bulk-create native mailboxes from selected Workspace users
workspaceImport.post(
  "/provision",
  requireScope("domains:manage"),
  validateBody(ProvisionSchema),
  async (c) => {
    const auth = c.get("auth");
    const input = getValidatedBody<z.infer<typeof ProvisionSchema>>(c);
    const db = getDatabase();

    // The domain must be registered + verified + active for this account.
    const [domainRecord] = await db
      .select({
        id: domainsTable.id,
        verificationStatus: domainsTable.verificationStatus,
        isActive: domainsTable.isActive,
      })
      .from(domainsTable)
      .where(
        and(
          eq(domainsTable.domain, input.domain),
          eq(domainsTable.accountId, auth.accountId),
        ),
      )
      .limit(1);

    if (!domainRecord) {
      return c.json(
        {
          error: {
            type: "validation_error",
            message: `Domain "${input.domain}" is not registered for this account. Add it via POST /v1/domains first.`,
            code: "domain_not_found",
          },
        },
        400,
      );
    }
    if (domainRecord.verificationStatus !== "verified" || !domainRecord.isActive) {
      return c.json(
        {
          error: {
            type: "conflict_error",
            message: `Domain "${input.domain}" is not verified/active yet. Verify it via POST /v1/domains/${domainRecord.id}/verify first.`,
            code: "domain_not_verified",
          },
        },
        409,
      );
    }

    const created: string[] = [];
    const skipped: string[] = [];

    for (const u of input.users) {
      // Only provision addresses ON the target domain.
      if (!u.email.endsWith(`@${input.domain}`)) {
        skipped.push(u.email);
        continue;
      }
      const localPart = u.email.slice(0, u.email.indexOf("@"));

      const [existing] = await db
        .select({ id: mailboxesTable.id })
        .from(mailboxesTable)
        .where(eq(mailboxesTable.address, u.email))
        .limit(1);
      if (existing) {
        skipped.push(u.email);
        continue;
      }

      await db.insert(mailboxesTable).values({
        id: genId(),
        accountId: auth.accountId,
        domainId: domainRecord.id,
        localPart,
        address: u.email,
        displayName: u.displayName ?? null,
        isActive: true,
      });
      created.push(u.email);
    }

    return c.json({
      domain: input.domain,
      created: created.length,
      skipped: skipped.length,
      createdAddresses: created,
      skippedAddresses: skipped,
    });
  },
);

export { workspaceImport };
