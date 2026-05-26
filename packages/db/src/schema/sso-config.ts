// SSO/SAML configuration, audit logs, team invitations, and organizations
import {
  pgTable,
  pgEnum,
  text,
  timestamp,
  boolean,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { accounts, userRoleEnum } from "./users.js";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const invitationStatusEnum = pgEnum("invitation_status", [
  "pending",
  "accepted",
  "expired",
  "revoked",
]);

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface OrganizationSettings {
  ssoRequired: boolean;
  allowedEmailDomains: string[];
  defaultUserRole: string;
  maxUsers: number | null;
}

// ---------------------------------------------------------------------------
// SSO Configs — persists SAML IdP configuration per account
// ---------------------------------------------------------------------------

export const ssoConfigs = pgTable(
  "sso_configs",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" })
      .unique(),
    entityId: text("entity_id").notNull(),
    ssoUrl: text("sso_url").notNull(),
    sloUrl: text("slo_url").notNull(),
    certificate: text("certificate").notNull(),
    enabled: boolean("enabled").notNull().default(false),
    allowedDomains: jsonb("allowed_domains")
      .$type<string[]>()
      .default([]),
    enforced: boolean("enforced").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);

// ---------------------------------------------------------------------------
// Audit Logs — logs admin actions
// ---------------------------------------------------------------------------

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .default({}),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("audit_logs_account_id_idx").on(table.accountId),
    index("audit_logs_account_created_idx").on(table.accountId, table.createdAt),
    index("audit_logs_action_idx").on(table.action),
  ],
);

// ---------------------------------------------------------------------------
// Team Invitations — pending invites to join an account
// ---------------------------------------------------------------------------

export const teamInvitations = pgTable(
  "team_invitations",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    invitedBy: text("invited_by").notNull(),
    email: text("email").notNull(),
    role: userRoleEnum("role").default("member"),
    status: invitationStatusEnum("status").notNull().default("pending"),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("team_invitations_account_id_idx").on(table.accountId),
    index("team_invitations_email_idx").on(table.email),
    uniqueIndex("team_invitations_token_idx").on(table.token),
  ],
);

// ---------------------------------------------------------------------------
// Organizations — multi-tenant org hierarchy for business accounts
// ---------------------------------------------------------------------------

export const organizations = pgTable(
  "organizations",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    ownerAccountId: text("owner_account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    domain: text("domain"),
    logoUrl: text("logo_url"),
    settings: jsonb("settings")
      .$type<OrganizationSettings>()
      .default({
        ssoRequired: false,
        allowedEmailDomains: [],
        defaultUserRole: "member",
        maxUsers: null,
      }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("organizations_slug_idx").on(table.slug),
    index("organizations_owner_account_id_idx").on(table.ownerAccountId),
  ],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const ssoConfigsRelations = relations(ssoConfigs, ({ one }) => ({
  account: one(accounts, {
    fields: [ssoConfigs.accountId],
    references: [accounts.id],
  }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  account: one(accounts, {
    fields: [auditLogs.accountId],
    references: [accounts.id],
  }),
}));

export const teamInvitationsRelations = relations(teamInvitations, ({ one }) => ({
  account: one(accounts, {
    fields: [teamInvitations.accountId],
    references: [accounts.id],
  }),
}));

export const organizationsRelations = relations(organizations, ({ one }) => ({
  ownerAccount: one(accounts, {
    fields: [organizations.ownerAccountId],
    references: [accounts.id],
  }),
}));
