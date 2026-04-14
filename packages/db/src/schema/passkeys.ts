import {
  pgTable,
  text,
  timestamp,
  integer,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users.js";

// ---------------------------------------------------------------------------
// Passkeys (WebAuthn Credentials)
// ---------------------------------------------------------------------------

export const passkeys = pgTable(
  "passkeys",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    credentialId: text("credential_id").notNull().unique(),
    publicKey: text("public_key").notNull(),
    counter: integer("counter").notNull().default(0),
    deviceType: text("device_type").notNull().default("single_device"),
    backedUp: integer("backed_up").notNull().default(0),
    transports: text("transports"),
    aaguid: text("aaguid"),
    friendlyName: text("friendly_name"),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("passkeys_user_id_idx").on(table.userId),
    index("passkeys_credential_id_idx").on(table.credentialId),
  ],
);

// ---------------------------------------------------------------------------
// Passkey Challenges (temporary, for registration & authentication)
// ---------------------------------------------------------------------------

export const passkeyChallenges = pgTable(
  "passkey_challenges",
  {
    id: text("id").primaryKey(),
    challenge: text("challenge").notNull(),
    userId: text("user_id"),
    type: text("type").notNull(), // "registration" | "authentication"
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("passkey_challenges_challenge_idx").on(table.challenge),
  ],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const passkeysRelations = relations(passkeys, ({ one }) => ({
  user: one(users, {
    fields: [passkeys.userId],
    references: [users.id],
  }),
}));

export const passkeyChallengesRelations = relations(passkeyChallenges, ({ one }) => ({
  user: one(users, {
    fields: [passkeyChallenges.userId],
    references: [users.id],
  }),
}));
