/**
 * Workspace membership helpers — `workspace_members` is the source of truth
 * for "which workspaces (accounts) can this identity (users row) reach, and
 * with what role in EACH one." `users.accountId` / `users.role` remain only
 * as the identity's home-workspace defaults, seeded at signup.
 *
 * Every place that creates or re-parents a `users` row into an account must
 * pair it with `upsertWorkspaceMembership` so role/permission lookups never
 * have to guess via a fallback.
 */

import { eq, and } from "drizzle-orm";
import { getDatabase, workspaceMembers } from "@alecrae/db";

type MemberPermissions = {
  sendEmail: boolean;
  readEmail: boolean;
  manageDomains: boolean;
  manageApiKeys: boolean;
  manageWebhooks: boolean;
  viewAnalytics: boolean;
  manageAccount: boolean;
  manageTeamMembers: boolean;
} | null;

function generateId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Create or update a (userId, accountId) workspace membership row. */
export async function upsertWorkspaceMembership(params: {
  userId: string;
  accountId: string;
  role: "owner" | "admin" | "member" | "viewer";
  permissions?: MemberPermissions;
}): Promise<void> {
  const db = getDatabase();
  await db
    .insert(workspaceMembers)
    .values({
      id: generateId(),
      userId: params.userId,
      accountId: params.accountId,
      role: params.role,
      permissions: params.permissions ?? null,
    })
    .onConflictDoUpdate({
      target: [workspaceMembers.userId, workspaceMembers.accountId],
      set: {
        role: params.role,
        ...(params.permissions !== undefined ? { permissions: params.permissions } : {}),
        updatedAt: new Date(),
      },
    });
}

/** Look up a user's role in one specific workspace, if a membership exists. */
export async function getWorkspaceRole(
  userId: string,
  accountId: string,
): Promise<string | null> {
  const db = getDatabase();
  const [row] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.userId, userId),
        eq(workspaceMembers.accountId, accountId),
      ),
    )
    .limit(1);
  return row?.role ?? null;
}

/** Remove a user's access to one specific workspace. */
export async function removeWorkspaceMembership(
  userId: string,
  accountId: string,
): Promise<void> {
  const db = getDatabase();
  await db
    .delete(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.userId, userId),
        eq(workspaceMembers.accountId, accountId),
      ),
    );
}
