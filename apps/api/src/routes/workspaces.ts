/**
 * Workspaces — multi-workspace: one login, several separate businesses.
 *
 * GET  /v1/workspaces   — List every workspace (account) the caller belongs to
 * POST /v1/workspaces   — Create a new workspace, owned by the caller
 *
 * Switching the ACTIVE workspace is `POST /v1/auth/switch-workspace`
 * (apps/api/src/routes/auth.ts) — it mints a fresh token pair rather than
 * living here, since it's an auth concern, not a workspace CRUD concern.
 */

import { Hono } from "hono";
import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { requireScope } from "../middleware/auth.js";
import { validateBody, getValidatedBody } from "../middleware/validator.js";
import { getDatabase, accounts, organizations, users, workspaceMembers } from "@alecrae/db";
import { upsertWorkspaceMembership } from "../lib/workspace-membership.js";

const workspacesRouter = new Hono();

function generateId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const OWNER_PERMISSIONS = {
  sendEmail: true,
  readEmail: true,
  manageDomains: true,
  manageApiKeys: true,
  manageWebhooks: true,
  viewAnalytics: true,
  manageAccount: true,
  manageTeamMembers: true,
};

const CreateWorkspaceSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
});

const MISSING_USER_ID = {
  error: {
    type: "authentication_error" as const,
    message: "User ID required",
    code: "missing_user_id" as const,
  },
};

// GET / — list every workspace the caller belongs to
workspacesRouter.get("/", requireScope("account:read"), async (c) => {
  const auth = c.get("auth");
  if (!auth.userId) return c.json(MISSING_USER_ID, 401);

  const db = getDatabase();

  const rows = await db
    .select({
      accountId: workspaceMembers.accountId,
      role: workspaceMembers.role,
      accountName: accounts.name,
      planTier: accounts.planTier,
      orgName: organizations.name,
      orgSlug: organizations.slug,
      createdAt: workspaceMembers.createdAt,
    })
    .from(workspaceMembers)
    .innerJoin(accounts, eq(workspaceMembers.accountId, accounts.id))
    .leftJoin(organizations, eq(organizations.ownerAccountId, accounts.id))
    .where(eq(workspaceMembers.userId, auth.userId))
    .orderBy(desc(workspaceMembers.createdAt));

  return c.json({
    data: rows.map((r) => ({
      accountId: r.accountId,
      name: r.orgName ?? r.accountName,
      slug: r.orgSlug ?? null,
      role: r.role,
      planTier: r.planTier,
      active: r.accountId === auth.accountId,
      createdAt: r.createdAt.toISOString(),
    })),
  });
});

// POST / — create a new workspace (new account), the caller becomes its owner
workspacesRouter.post(
  "/",
  requireScope("account:manage"),
  validateBody(CreateWorkspaceSchema),
  async (c) => {
    const auth = c.get("auth");
    if (!auth.userId) return c.json(MISSING_USER_ID, 401);

    const input = getValidatedBody<z.infer<typeof CreateWorkspaceSchema>>(c);
    const db = getDatabase();

    const [caller] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, auth.userId))
      .limit(1);
    if (!caller) return c.json(MISSING_USER_ID, 401);

    // Validate the slug BEFORE writing anything, so a conflict never leaves
    // behind an orphaned account with no branding profile.
    if (input.slug) {
      const [existingSlug] = await db
        .select({ id: organizations.id })
        .from(organizations)
        .where(eq(organizations.slug, input.slug))
        .limit(1);
      if (existingSlug) {
        return c.json(
          {
            error: {
              type: "conflict",
              message: "A workspace with this slug already exists",
              code: "slug_taken",
            },
          },
          409,
        );
      }
    }

    const accountId = generateId();
    const now = new Date();

    await db.insert(accounts).values({
      id: accountId,
      name: input.name,
      planTier: "free",
      billingEmail: caller.email,
      emailsSentThisPeriod: 0,
    });

    await upsertWorkspaceMembership({
      userId: auth.userId,
      accountId,
      role: "owner",
      permissions: OWNER_PERMISSIONS,
    });

    let orgSlug: string | null = null;
    if (input.slug) {
      await db.insert(organizations).values({
        id: generateId(),
        name: input.name,
        slug: input.slug,
        ownerAccountId: accountId,
        domain: null,
        logoUrl: null,
        settings: {
          ssoRequired: false,
          allowedEmailDomains: [],
          defaultUserRole: "member",
          maxUsers: null,
        },
        createdAt: now,
        updatedAt: now,
      });
      orgSlug = input.slug;
    }

    return c.json(
      {
        data: {
          accountId,
          name: input.name,
          slug: orgSlug,
          role: "owner",
          planTier: "free",
          active: false,
          createdAt: now.toISOString(),
        },
      },
      201,
    );
  },
);

export { workspacesRouter };
