/**
 * Organizations + Team Management + Audit Log + SSO Config Routes
 *
 * All endpoints here operate on the ACTIVE workspace (`auth.accountId`, from
 * the current token) — see apps/api/src/lib/workspace-membership.ts for how
 * membership/role is resolved once an identity belongs to more than one
 * workspace. Creating additional workspaces is `/v1/workspaces`; switching
 * between them is `POST /v1/auth/switch-workspace`.
 *
 * POST   /                           — Create an organization (branding profile)
 * GET    /                           — Get organization(s) for the active workspace
 * PUT    /                           — Update organization
 *
 * GET    /members                    — List all members of the active workspace
 * PUT    /members/:userId/role       — Change a member's role in this workspace
 * DELETE /members/:userId            — Remove a member's access to this workspace
 *
 * POST   /invitations                — Invite user by email
 * GET    /invitations                — List pending invitations
 * DELETE /invitations/:invitationId  — Revoke invitation
 * POST   /invitations/:token/accept  — Accept invitation (token IS the auth)
 *
 * GET    /audit-log                  — List audit log entries (cursor-based)
 *
 * GET    /sso                        — Get SSO config for account
 * PUT    /sso                        — Update SSO config
 */

import { Hono } from "hono";
import { z } from "zod";
import { eq, and, desc, lt } from "drizzle-orm";
import { requireScope } from "../middleware/auth.js";
import {
  validateBody,
  validateQuery,
  getValidatedBody,
  getValidatedQuery,
} from "../middleware/validator.js";
import {
  getDatabase,
  organizations,
  teamInvitations,
  auditLogs,
  ssoConfigs,
  users,
  workspaceMembers,
} from "@alecrae/db";
import {
  upsertWorkspaceMembership,
  getWorkspaceRole,
  removeWorkspaceMembership,
} from "../lib/workspace-membership.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function generateToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function logAudit(
  db: ReturnType<typeof getDatabase>,
  params: {
    accountId: string;
    userId: string;
    action: string;
    resourceType: string;
    resourceId?: string | undefined;
    metadata?: Record<string, unknown> | undefined;
    ipAddress?: string | undefined;
    userAgent?: string | undefined;
  },
): Promise<void> {
  await db.insert(auditLogs).values({
    id: generateId(),
    accountId: params.accountId,
    userId: params.userId,
    action: params.action,
    resourceType: params.resourceType,
    resourceId: params.resourceId ?? null,
    metadata: params.metadata ?? {},
    ipAddress: params.ipAddress ?? null,
    userAgent: params.userAgent ?? null,
  });
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

const CreateOrganizationSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(128).regex(/^[a-z0-9-]+$/),
  domain: z.string().nullable().optional(),
  logoUrl: z.string().url().nullable().optional(),
  settings: z
    .object({
      ssoRequired: z.boolean().optional(),
      allowedEmailDomains: z.array(z.string()).optional(),
      defaultUserRole: z.string().optional(),
      maxUsers: z.number().int().positive().nullable().optional(),
    })
    .optional(),
});

const UpdateOrganizationSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  slug: z.string().min(1).max(128).regex(/^[a-z0-9-]+$/).optional(),
  domain: z.string().nullable().optional(),
  logoUrl: z.string().url().nullable().optional(),
  settings: z
    .object({
      ssoRequired: z.boolean().optional(),
      allowedEmailDomains: z.array(z.string()).optional(),
      defaultUserRole: z.string().optional(),
      maxUsers: z.number().int().positive().nullable().optional(),
    })
    .optional(),
});

const UpdateMemberRoleSchema = z.object({
  role: z.enum(["admin", "member", "viewer"]),
});

const InviteMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "member", "viewer"]).default("member"),
});

const ListInvitationsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(["pending", "accepted", "expired", "revoked"]).optional(),
});

const ListAuditLogQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
  action: z.string().optional(),
  resourceType: z.string().optional(),
});

const UpdateSsoConfigSchema = z.object({
  entityId: z.string().min(1),
  ssoUrl: z.string().url().min(1),
  sloUrl: z.string().url().min(1),
  certificate: z.string().min(1),
  enabled: z.boolean(),
  allowedDomains: z.array(z.string()).optional(),
  enforced: z.boolean().optional(),
});

// ─── Router ───────────────────────────────────────────────────────────────────

const organizationsRouter = new Hono();

// ─── Organization CRUD ────────────────────────────────────────────────────────

// POST / — Create organization
organizationsRouter.post(
  "/",
  requireScope("account:manage"),
  validateBody(CreateOrganizationSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof CreateOrganizationSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();
    const accountId = auth.accountId;
    const userId = auth.userId ?? auth.accountId;

    const id = generateId();
    const now = new Date();

    // Check slug uniqueness
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
            message: "An organization with this slug already exists",
            code: "slug_taken",
          },
        },
        409,
      );
    }

    await db.insert(organizations).values({
      id,
      name: input.name,
      slug: input.slug,
      ownerAccountId: accountId,
      domain: input.domain ?? null,
      logoUrl: input.logoUrl ?? null,
      settings: input.settings
        ? {
            ssoRequired: input.settings.ssoRequired ?? false,
            allowedEmailDomains: input.settings.allowedEmailDomains ?? [],
            defaultUserRole: input.settings.defaultUserRole ?? "member",
            maxUsers: input.settings.maxUsers ?? null,
          }
        : {
            ssoRequired: false,
            allowedEmailDomains: [],
            defaultUserRole: "member",
            maxUsers: null,
          },
      createdAt: now,
      updatedAt: now,
    });

    await logAudit(db, {
      accountId,
      userId,
      action: "organization.created",
      resourceType: "organization",
      resourceId: id,
      metadata: { name: input.name, slug: input.slug },
      ipAddress: c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? undefined,
      userAgent: c.req.header("user-agent") ?? undefined,
    });

    return c.json(
      {
        data: {
          id,
          name: input.name,
          slug: input.slug,
          ownerAccountId: accountId,
          domain: input.domain ?? null,
          logoUrl: input.logoUrl ?? null,
          settings: input.settings ?? {
            ssoRequired: false,
            allowedEmailDomains: [],
            defaultUserRole: "member",
            maxUsers: null,
          },
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        },
      },
      201,
    );
  },
);

// GET / — Get organization for current account
organizationsRouter.get(
  "/",
  requireScope("account:read"),
  async (c) => {
    const auth = c.get("auth");
    const db = getDatabase();

    const orgs = await db
      .select()
      .from(organizations)
      .where(eq(organizations.ownerAccountId, auth.accountId))
      .orderBy(desc(organizations.createdAt));

    return c.json({
      data: orgs.map((org) => ({
        id: org.id,
        name: org.name,
        slug: org.slug,
        ownerAccountId: org.ownerAccountId,
        domain: org.domain,
        logoUrl: org.logoUrl,
        settings: org.settings,
        createdAt: org.createdAt.toISOString(),
        updatedAt: org.updatedAt.toISOString(),
      })),
    });
  },
);

// PUT / — Update organization
organizationsRouter.put(
  "/",
  requireScope("account:manage"),
  validateBody(UpdateOrganizationSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof UpdateOrganizationSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();
    const accountId = auth.accountId;
    const userId = auth.userId ?? auth.accountId;

    // Find the organization owned by this account
    const [existing] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.ownerAccountId, accountId))
      .limit(1);

    if (!existing) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: "No organization found for this account",
            code: "organization_not_found",
          },
        },
        404,
      );
    }

    // Check slug uniqueness if changing
    if (input.slug !== undefined && input.slug !== existing.slug) {
      const [slugConflict] = await db
        .select({ id: organizations.id })
        .from(organizations)
        .where(eq(organizations.slug, input.slug))
        .limit(1);

      if (slugConflict) {
        return c.json(
          {
            error: {
              type: "conflict",
              message: "An organization with this slug already exists",
              code: "slug_taken",
            },
          },
          409,
        );
      }
    }

    const now = new Date();
    const updateData: Record<string, unknown> = { updatedAt: now };
    if (input.name !== undefined) updateData["name"] = input.name;
    if (input.slug !== undefined) updateData["slug"] = input.slug;
    if (input.domain !== undefined) updateData["domain"] = input.domain;
    if (input.logoUrl !== undefined) updateData["logoUrl"] = input.logoUrl;
    if (input.settings !== undefined) {
      const existingSettings = (existing.settings ?? {}) as Record<string, unknown>;
      updateData["settings"] = {
        ssoRequired: input.settings.ssoRequired ?? existingSettings["ssoRequired"] ?? false,
        allowedEmailDomains: input.settings.allowedEmailDomains ?? existingSettings["allowedEmailDomains"] ?? [],
        defaultUserRole: input.settings.defaultUserRole ?? existingSettings["defaultUserRole"] ?? "member",
        maxUsers: input.settings.maxUsers !== undefined ? input.settings.maxUsers : (existingSettings["maxUsers"] ?? null),
      };
    }

    const [updated] = await db
      .update(organizations)
      .set(updateData)
      .where(eq(organizations.id, existing.id))
      .returning();

    if (!updated) {
      return c.json(
        {
          error: {
            type: "internal",
            message: "Failed to update organization",
            code: "update_failed",
          },
        },
        500,
      );
    }

    await logAudit(db, {
      accountId,
      userId,
      action: "organization.updated",
      resourceType: "organization",
      resourceId: existing.id,
      metadata: updateData,
      ipAddress: c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? undefined,
      userAgent: c.req.header("user-agent") ?? undefined,
    });

    return c.json({
      data: {
        id: updated.id,
        name: updated.name,
        slug: updated.slug,
        ownerAccountId: updated.ownerAccountId,
        domain: updated.domain,
        logoUrl: updated.logoUrl,
        settings: updated.settings,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  },
);

// ─── Team Member Management ───────────────────────────────────────────────────

// GET /members — List every member of the ACTIVE workspace
organizationsRouter.get(
  "/members",
  requireScope("account:read"),
  async (c) => {
    const auth = c.get("auth");
    const db = getDatabase();

    const members = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: workspaceMembers.role,
        avatarUrl: users.avatarUrl,
        emailVerified: users.emailVerified,
        lastLoginAt: users.lastLoginAt,
        createdAt: workspaceMembers.createdAt,
      })
      .from(workspaceMembers)
      .innerJoin(users, eq(workspaceMembers.userId, users.id))
      .where(eq(workspaceMembers.accountId, auth.accountId))
      .orderBy(desc(workspaceMembers.createdAt));

    return c.json({
      data: members.map((m) => ({
        id: m.id,
        email: m.email,
        name: m.name,
        role: m.role,
        avatarUrl: m.avatarUrl,
        emailVerified: m.emailVerified,
        lastLoginAt: m.lastLoginAt ? m.lastLoginAt.toISOString() : null,
        createdAt: m.createdAt.toISOString(),
      })),
    });
  },
);

// PUT /members/:userId/role — Change a member's role in the ACTIVE workspace
organizationsRouter.put(
  "/members/:userId/role",
  requireScope("account:manage"),
  validateBody(UpdateMemberRoleSchema),
  async (c) => {
    const targetUserId = c.req.param("userId");
    const input = getValidatedBody<z.infer<typeof UpdateMemberRoleSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();
    const accountId = auth.accountId;
    const userId = auth.userId ?? auth.accountId;

    const targetRole = await getWorkspaceRole(targetUserId, accountId);

    if (!targetRole) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: "User not found in this workspace",
            code: "user_not_found",
          },
        },
        404,
      );
    }

    // Cannot change the owner's role
    if (targetRole === "owner") {
      return c.json(
        {
          error: {
            type: "forbidden",
            message: "Cannot change the role of the account owner",
            code: "cannot_change_owner_role",
          },
        },
        403,
      );
    }

    const now = new Date();

    await upsertWorkspaceMembership({
      userId: targetUserId,
      accountId,
      role: input.role,
    });

    await logAudit(db, {
      accountId,
      userId,
      action: "member.role_changed",
      resourceType: "user",
      resourceId: targetUserId,
      metadata: { previousRole: targetRole, newRole: input.role },
      ipAddress: c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? undefined,
      userAgent: c.req.header("user-agent") ?? undefined,
    });

    return c.json({
      data: {
        userId: targetUserId,
        role: input.role,
        updatedAt: now.toISOString(),
      },
    });
  },
);

// DELETE /members/:userId — Remove a member's access to the ACTIVE workspace.
// This revokes their `workspace_members` row for THIS account only — their
// identity and any other workspace they belong to are untouched.
organizationsRouter.delete(
  "/members/:userId",
  requireScope("account:manage"),
  async (c) => {
    const targetUserId = c.req.param("userId");
    const auth = c.get("auth");
    const db = getDatabase();
    const accountId = auth.accountId;
    const userId = auth.userId ?? auth.accountId;

    const targetRole = await getWorkspaceRole(targetUserId, accountId);

    if (!targetRole) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: "User not found in this workspace",
            code: "user_not_found",
          },
        },
        404,
      );
    }

    // Cannot remove the owner
    if (targetRole === "owner") {
      return c.json(
        {
          error: {
            type: "forbidden",
            message: "Cannot remove the account owner",
            code: "cannot_remove_owner",
          },
        },
        403,
      );
    }

    const [targetUser] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, targetUserId))
      .limit(1);

    await removeWorkspaceMembership(targetUserId, accountId);

    await logAudit(db, {
      accountId,
      userId,
      action: "member.removed",
      resourceType: "user",
      resourceId: targetUserId,
      metadata: { email: targetUser?.email, role: targetRole },
      ipAddress: c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? undefined,
      userAgent: c.req.header("user-agent") ?? undefined,
    });

    return c.json({
      data: {
        deleted: true,
        userId: targetUserId,
      },
    });
  },
);

// ─── Team Invitations ─────────────────────────────────────────────────────────

// POST /invitations — Invite user by email
organizationsRouter.post(
  "/invitations",
  requireScope("account:manage"),
  validateBody(InviteMemberSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof InviteMemberSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();
    const accountId = auth.accountId;
    const userId = auth.userId ?? auth.accountId;

    // Check if there's already a pending invitation for this email
    const [existingInvite] = await db
      .select({ id: teamInvitations.id })
      .from(teamInvitations)
      .where(
        and(
          eq(teamInvitations.accountId, accountId),
          eq(teamInvitations.email, input.email),
          eq(teamInvitations.status, "pending"),
        ),
      )
      .limit(1);

    if (existingInvite) {
      return c.json(
        {
          error: {
            type: "conflict",
            message: "A pending invitation already exists for this email",
            code: "invitation_exists",
          },
        },
        409,
      );
    }

    // Check if user is already a member of this workspace
    const [existingUser] = await db
      .select({ id: users.id })
      .from(users)
      .innerJoin(
        workspaceMembers,
        and(
          eq(workspaceMembers.userId, users.id),
          eq(workspaceMembers.accountId, accountId),
        ),
      )
      .where(eq(users.email, input.email))
      .limit(1);

    if (existingUser) {
      return c.json(
        {
          error: {
            type: "conflict",
            message: "This email is already a member of this account",
            code: "already_member",
          },
        },
        409,
      );
    }

    const id = generateId();
    const token = generateToken();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await db.insert(teamInvitations).values({
      id,
      accountId,
      invitedBy: userId,
      email: input.email,
      role: input.role,
      token,
      status: "pending",
      expiresAt,
      createdAt: now,
    });

    await logAudit(db, {
      accountId,
      userId,
      action: "invitation.created",
      resourceType: "team_invitation",
      resourceId: id,
      metadata: { email: input.email, role: input.role },
      ipAddress: c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? undefined,
      userAgent: c.req.header("user-agent") ?? undefined,
    });

    return c.json(
      {
        data: {
          id,
          accountId,
          email: input.email,
          role: input.role,
          token,
          status: "pending",
          expiresAt: expiresAt.toISOString(),
          createdAt: now.toISOString(),
        },
      },
      201,
    );
  },
);

// GET /invitations — List pending invitations
organizationsRouter.get(
  "/invitations",
  requireScope("account:read"),
  validateQuery(ListInvitationsQuery),
  async (c) => {
    const query = getValidatedQuery<z.infer<typeof ListInvitationsQuery>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const conditions = [eq(teamInvitations.accountId, auth.accountId)];
    if (query.status) {
      conditions.push(eq(teamInvitations.status, query.status));
    }

    const rows = await db
      .select()
      .from(teamInvitations)
      .where(and(...conditions))
      .orderBy(desc(teamInvitations.createdAt))
      .limit(query.limit);

    return c.json({
      data: rows.map((row) => ({
        id: row.id,
        accountId: row.accountId,
        invitedBy: row.invitedBy,
        email: row.email,
        role: row.role,
        status: row.status,
        expiresAt: row.expiresAt.toISOString(),
        acceptedAt: row.acceptedAt ? row.acceptedAt.toISOString() : null,
        createdAt: row.createdAt.toISOString(),
      })),
    });
  },
);

// DELETE /invitations/:invitationId — Revoke invitation
organizationsRouter.delete(
  "/invitations/:invitationId",
  requireScope("account:manage"),
  async (c) => {
    const invitationId = c.req.param("invitationId");
    const auth = c.get("auth");
    const db = getDatabase();
    const accountId = auth.accountId;
    const userId = auth.userId ?? auth.accountId;

    const [existing] = await db
      .select({ id: teamInvitations.id, status: teamInvitations.status })
      .from(teamInvitations)
      .where(
        and(
          eq(teamInvitations.id, invitationId),
          eq(teamInvitations.accountId, accountId),
        ),
      )
      .limit(1);

    if (!existing) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: "Invitation not found",
            code: "invitation_not_found",
          },
        },
        404,
      );
    }

    if (existing.status !== "pending") {
      return c.json(
        {
          error: {
            type: "conflict",
            message: `Cannot revoke an invitation with status "${existing.status}"`,
            code: "invitation_not_pending",
          },
        },
        409,
      );
    }

    await db
      .update(teamInvitations)
      .set({ status: "revoked" })
      .where(eq(teamInvitations.id, invitationId));

    await logAudit(db, {
      accountId,
      userId,
      action: "invitation.revoked",
      resourceType: "team_invitation",
      resourceId: invitationId,
      ipAddress: c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? undefined,
      userAgent: c.req.header("user-agent") ?? undefined,
    });

    return c.json({
      data: {
        revoked: true,
        id: invitationId,
      },
    });
  },
);

// POST /invitations/:token/accept — Accept invitation (no auth required — token IS the auth)
organizationsRouter.post("/invitations/:token/accept", async (c) => {
  const token = c.req.param("token");
  const db = getDatabase();

  const [invitation] = await db
    .select()
    .from(teamInvitations)
    .where(
      and(
        eq(teamInvitations.token, token),
        eq(teamInvitations.status, "pending"),
      ),
    )
    .limit(1);

  if (!invitation) {
    return c.json(
      {
        error: {
          type: "not_found",
          message: "Invalid or expired invitation token",
          code: "invitation_not_found",
        },
      },
      404,
    );
  }

  // Check expiry
  if (new Date() > invitation.expiresAt) {
    await db
      .update(teamInvitations)
      .set({ status: "expired" })
      .where(eq(teamInvitations.id, invitation.id));

    return c.json(
      {
        error: {
          type: "expired",
          message: "This invitation has expired",
          code: "invitation_expired",
        },
      },
      410,
    );
  }

  // Check if an identity already exists with this email
  const [existingUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, invitation.email))
    .limit(1);

  const now = new Date();
  let newUserId: string;
  const memberPermissions = {
    sendEmail: true,
    readEmail: true,
    manageDomains: false,
    manageApiKeys: false,
    manageWebhooks: false,
    viewAnalytics: true,
    manageAccount: false,
    manageTeamMembers: false,
  };

  if (existingUser) {
    // Identity already exists — grant them membership in THIS workspace
    // without touching their home account or any other workspace they
    // already belong to (an identity can belong to more than one).
    newUserId = existingUser.id;
  } else {
    // Create a brand-new identity, home-scoped to this invitation's account
    // (their "home" workspace default — see workspace-membership.ts).
    newUserId = generateId();
    const emailName = invitation.email.split("@")[0] ?? "User";

    await db.insert(users).values({
      id: newUserId,
      accountId: invitation.accountId,
      email: invitation.email,
      name: emailName,
      passwordHash: null,
      role: invitation.role ?? "member",
      emailVerified: true, // Invitation acceptance verifies the email
      permissions: memberPermissions,
      createdAt: now,
      updatedAt: now,
    });
  }

  await upsertWorkspaceMembership({
    userId: newUserId,
    accountId: invitation.accountId,
    role: invitation.role ?? "member",
    permissions: memberPermissions,
  });

  // Mark invitation as accepted
  await db
    .update(teamInvitations)
    .set({ status: "accepted", acceptedAt: now })
    .where(eq(teamInvitations.id, invitation.id));

  await logAudit(db, {
    accountId: invitation.accountId,
    userId: newUserId,
    action: "invitation.accepted",
    resourceType: "team_invitation",
    resourceId: invitation.id,
    metadata: { email: invitation.email, role: invitation.role },
    ipAddress: c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? undefined,
    userAgent: c.req.header("user-agent") ?? undefined,
  });

  return c.json({
    data: {
      accepted: true,
      accountId: invitation.accountId,
      userId: newUserId,
      email: invitation.email,
      role: invitation.role,
    },
  });
});

// ─── Audit Log ────────────────────────────────────────────────────────────────

// GET /audit-log — List audit log entries (cursor-based pagination)
organizationsRouter.get(
  "/audit-log",
  requireScope("account:read"),
  validateQuery(ListAuditLogQuery),
  async (c) => {
    const query = getValidatedQuery<z.infer<typeof ListAuditLogQuery>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const conditions = [eq(auditLogs.accountId, auth.accountId)];

    if (query.action) {
      conditions.push(eq(auditLogs.action, query.action));
    }

    if (query.resourceType) {
      conditions.push(eq(auditLogs.resourceType, query.resourceType));
    }

    if (query.cursor) {
      conditions.push(lt(auditLogs.createdAt, new Date(query.cursor)));
    }

    const rows = await db
      .select()
      .from(auditLogs)
      .where(and(...conditions))
      .orderBy(desc(auditLogs.createdAt))
      .limit(query.limit + 1);

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const nextCursor =
      hasMore && page.length > 0
        ? (page[page.length - 1]?.createdAt.toISOString() ?? null)
        : null;

    return c.json({
      data: page.map((row) => ({
        id: row.id,
        accountId: row.accountId,
        userId: row.userId,
        action: row.action,
        resourceType: row.resourceType,
        resourceId: row.resourceId,
        metadata: row.metadata,
        ipAddress: row.ipAddress,
        userAgent: row.userAgent,
        createdAt: row.createdAt.toISOString(),
      })),
      cursor: nextCursor,
      hasMore,
    });
  },
);

// ─── SSO Config ───────────────────────────────────────────────────────────────

// GET /sso — Get SSO config for account
organizationsRouter.get(
  "/sso",
  requireScope("account:read"),
  async (c) => {
    const auth = c.get("auth");
    const db = getDatabase();

    const [config] = await db
      .select()
      .from(ssoConfigs)
      .where(eq(ssoConfigs.accountId, auth.accountId))
      .limit(1);

    if (!config) {
      return c.json({
        data: null,
      });
    }

    return c.json({
      data: {
        id: config.id,
        accountId: config.accountId,
        entityId: config.entityId,
        ssoUrl: config.ssoUrl,
        sloUrl: config.sloUrl,
        certificateConfigured: config.certificate.length > 0,
        enabled: config.enabled,
        allowedDomains: config.allowedDomains,
        enforced: config.enforced,
        createdAt: config.createdAt.toISOString(),
        updatedAt: config.updatedAt.toISOString(),
      },
    });
  },
);

// PUT /sso — Update SSO config
organizationsRouter.put(
  "/sso",
  requireScope("account:manage"),
  validateBody(UpdateSsoConfigSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof UpdateSsoConfigSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();
    const accountId = auth.accountId;
    const userId = auth.userId ?? auth.accountId;
    const now = new Date();

    // Check if config already exists
    const [existing] = await db
      .select({ id: ssoConfigs.id })
      .from(ssoConfigs)
      .where(eq(ssoConfigs.accountId, accountId))
      .limit(1);

    if (existing) {
      await db
        .update(ssoConfigs)
        .set({
          entityId: input.entityId,
          ssoUrl: input.ssoUrl,
          sloUrl: input.sloUrl,
          certificate: input.certificate,
          enabled: input.enabled,
          allowedDomains: input.allowedDomains ?? [],
          enforced: input.enforced ?? false,
          updatedAt: now,
        })
        .where(eq(ssoConfigs.accountId, accountId));
    } else {
      const id = generateId();
      await db.insert(ssoConfigs).values({
        id,
        accountId,
        entityId: input.entityId,
        ssoUrl: input.ssoUrl,
        sloUrl: input.sloUrl,
        certificate: input.certificate,
        enabled: input.enabled,
        allowedDomains: input.allowedDomains ?? [],
        enforced: input.enforced ?? false,
        createdAt: now,
        updatedAt: now,
      });
    }

    await logAudit(db, {
      accountId,
      userId,
      action: "sso.config_updated",
      resourceType: "sso_config",
      metadata: {
        entityId: input.entityId,
        ssoUrl: input.ssoUrl,
        enabled: input.enabled,
        enforced: input.enforced ?? false,
      },
      ipAddress: c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? undefined,
      userAgent: c.req.header("user-agent") ?? undefined,
    });

    return c.json({
      data: {
        entityId: input.entityId,
        ssoUrl: input.ssoUrl,
        sloUrl: input.sloUrl,
        enabled: input.enabled,
        allowedDomains: input.allowedDomains ?? [],
        enforced: input.enforced ?? false,
        updatedAt: now.toISOString(),
      },
    });
  },
);

export { organizationsRouter };
