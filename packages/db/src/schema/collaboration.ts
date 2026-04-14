import {
  pgTable,
  pgEnum,
  text,
  timestamp,
  integer,
  boolean,
  index,
  uniqueIndex,
  customType,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { accounts, users } from "./users.js";

// ---------------------------------------------------------------------------
// Custom types
// ---------------------------------------------------------------------------

/**
 * Postgres `bytea` column type for storing raw Y.Doc binary state.
 */
const bytea = customType<{ data: Uint8Array; default: false }>({
  dataType() {
    return "bytea";
  },
});

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const collabSessionStatusEnum = pgEnum("collab_session_status", [
  "active",
  "closed",
  "archived",
]);

export const collabInviteStatusEnum = pgEnum("collab_invite_status", [
  "pending",
  "accepted",
  "declined",
  "revoked",
]);

export const collabRoleEnum = pgEnum("collab_role", [
  "owner",
  "editor",
  "viewer",
]);

// ---------------------------------------------------------------------------
// Collaboration Sessions
// ---------------------------------------------------------------------------

export const collaborationSessions = pgTable(
  "collaboration_sessions",
  {
    id: text("id").primaryKey(),
    /** The draft email this session is for. */
    draftId: text("draft_id").notNull(),
    /** Account that owns this draft. */
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    /** User who created the collaborative session. */
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Human-readable title for the draft session. */
    title: text("title").notNull().default("Untitled Draft"),
    /** Current session status. */
    status: collabSessionStatusEnum("status").notNull().default("active"),
    /** Current Yjs document version (monotonic). */
    currentVersion: integer("current_version").notNull().default(0),
    /** Latest persisted Yjs document state snapshot. */
    latestSnapshot: bytea("latest_snapshot"),
    /** Maximum number of collaborators allowed. */
    maxCollaborators: integer("max_collaborators").notNull().default(10),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (table) => [
    index("collab_sessions_draft_id_idx").on(table.draftId),
    index("collab_sessions_account_id_idx").on(table.accountId),
    index("collab_sessions_created_by_idx").on(table.createdBy),
    index("collab_sessions_status_idx").on(table.status),
  ],
);

// ---------------------------------------------------------------------------
// Collaboration Invites
// ---------------------------------------------------------------------------

export const collaborationInvites = pgTable(
  "collaboration_invites",
  {
    id: text("id").primaryKey(),
    /** The session this invite belongs to. */
    sessionId: text("session_id")
      .notNull()
      .references(() => collaborationSessions.id, { onDelete: "cascade" }),
    /** User who sent the invite. */
    invitedBy: text("invited_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Email of the invitee (can be external). */
    inviteeEmail: text("invitee_email").notNull(),
    /** User ID if the invitee is an existing user. */
    inviteeUserId: text("invitee_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    /** Role granted to the invitee. */
    role: collabRoleEnum("role").notNull().default("editor"),
    /** Invite status. */
    status: collabInviteStatusEnum("status").notNull().default("pending"),
    /** When the invite expires (default 7 days from creation). */
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("collab_invites_session_id_idx").on(table.sessionId),
    index("collab_invites_invitee_email_idx").on(table.inviteeEmail),
    uniqueIndex("collab_invites_session_email_unique").on(
      table.sessionId,
      table.inviteeEmail,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Collaboration Participants (accepted invites / active collaborators)
// ---------------------------------------------------------------------------

export const collaborationParticipants = pgTable(
  "collaboration_participants",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => collaborationSessions.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: collabRoleEnum("role").notNull().default("editor"),
    /** Whether the participant is currently connected. */
    isOnline: boolean("is_online").notNull().default(false),
    /** Cursor color assigned to this participant. */
    cursorColor: text("cursor_color").notNull().default("#3b82f6"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("collab_participants_session_id_idx").on(table.sessionId),
    index("collab_participants_user_id_idx").on(table.userId),
    uniqueIndex("collab_participants_session_user_unique").on(
      table.sessionId,
      table.userId,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Collaboration Version History
// ---------------------------------------------------------------------------

export const collaborationHistory = pgTable(
  "collaboration_history",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => collaborationSessions.id, { onDelete: "cascade" }),
    /** Version number (monotonic). */
    version: integer("version").notNull(),
    /** User who made the edit. */
    editedBy: text("edited_by").references(() => users.id, {
      onDelete: "set null",
    }),
    /** Yjs update binary diff (NOT the full state, just the delta). */
    ydocUpdate: bytea("ydoc_update").notNull(),
    /** Byte size of the update for analytics. */
    updateSize: integer("update_size").notNull().default(0),
    /** Human-readable summary (optional — populated by AI). */
    summary: text("summary"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("collab_history_session_id_idx").on(table.sessionId),
    index("collab_history_session_version_idx").on(
      table.sessionId,
      table.version,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const collaborationSessionsRelations = relations(
  collaborationSessions,
  ({ one, many }) => ({
    account: one(accounts, {
      fields: [collaborationSessions.accountId],
      references: [accounts.id],
    }),
    creator: one(users, {
      fields: [collaborationSessions.createdBy],
      references: [users.id],
    }),
    invites: many(collaborationInvites),
    participants: many(collaborationParticipants),
    history: many(collaborationHistory),
  }),
);

export const collaborationInvitesRelations = relations(
  collaborationInvites,
  ({ one }) => ({
    session: one(collaborationSessions, {
      fields: [collaborationInvites.sessionId],
      references: [collaborationSessions.id],
    }),
    inviter: one(users, {
      fields: [collaborationInvites.invitedBy],
      references: [users.id],
      relationName: "inviter",
    }),
  }),
);

export const collaborationParticipantsRelations = relations(
  collaborationParticipants,
  ({ one }) => ({
    session: one(collaborationSessions, {
      fields: [collaborationParticipants.sessionId],
      references: [collaborationSessions.id],
    }),
    user: one(users, {
      fields: [collaborationParticipants.userId],
      references: [users.id],
    }),
  }),
);

export const collaborationHistoryRelations = relations(
  collaborationHistory,
  ({ one }) => ({
    session: one(collaborationSessions, {
      fields: [collaborationHistory.sessionId],
      references: [collaborationSessions.id],
    }),
    editor: one(users, {
      fields: [collaborationHistory.editedBy],
      references: [users.id],
    }),
  }),
);

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type CollaborationSession = typeof collaborationSessions.$inferSelect;
export type NewCollaborationSession = typeof collaborationSessions.$inferInsert;

export type CollaborationInvite = typeof collaborationInvites.$inferSelect;
export type NewCollaborationInvite = typeof collaborationInvites.$inferInsert;

export type CollaborationParticipant =
  typeof collaborationParticipants.$inferSelect;
export type NewCollaborationParticipant =
  typeof collaborationParticipants.$inferInsert;

export type CollaborationHistoryEntry = typeof collaborationHistory.$inferSelect;
export type NewCollaborationHistoryEntry =
  typeof collaborationHistory.$inferInsert;
