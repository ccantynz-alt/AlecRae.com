import {
  pgTable,
  text,
  timestamp,
  boolean,
  jsonb,
  index,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { accounts, users } from "./users.js";

// ---------------------------------------------------------------------------
// AlecRae Chat — secure internal messaging
// ---------------------------------------------------------------------------

export const chatChannelTypeEnum = pgEnum("chat_channel_type", [
  "direct",
  "group",
  "thread",
]);

export const chatChannels = pgTable(
  "chat_channels",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    type: chatChannelTypeEnum("type").notNull().default("direct"),
    name: text("name"),
    topic: text("topic"),
    isArchived: boolean("is_archived").notNull().default(false),
    emailThreadId: text("email_thread_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("chat_channels_account_id_idx").on(table.accountId),
    index("chat_channels_email_thread_idx").on(table.emailThreadId),
  ],
);

export const chatMembers = pgTable(
  "chat_members",
  {
    id: text("id").primaryKey(),
    channelId: text("channel_id")
      .notNull()
      .references(() => chatChannels.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    lastReadAt: timestamp("last_read_at", { withTimezone: true }),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("chat_members_channel_idx").on(table.channelId),
    index("chat_members_user_idx").on(table.userId),
  ],
);

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: text("id").primaryKey(),
    channelId: text("channel_id")
      .notNull()
      .references(() => chatChannels.id, { onDelete: "cascade" }),
    senderId: text("sender_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    replyToId: text("reply_to_id"),
    attachments: jsonb("attachments").$type<string[]>().default([]),
    isEdited: boolean("is_edited").notNull().default(false),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("chat_messages_channel_idx").on(table.channelId),
    index("chat_messages_sender_idx").on(table.senderId),
    index("chat_messages_created_at_idx").on(table.createdAt),
  ],
);

export const chatChannelsRelations = relations(chatChannels, ({ one, many }) => ({
  account: one(accounts, {
    fields: [chatChannels.accountId],
    references: [accounts.id],
  }),
  members: many(chatMembers),
  messages: many(chatMessages),
}));

export const chatMembersRelations = relations(chatMembers, ({ one }) => ({
  channel: one(chatChannels, {
    fields: [chatMembers.channelId],
    references: [chatChannels.id],
  }),
  user: one(users, {
    fields: [chatMembers.userId],
    references: [users.id],
  }),
}));

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  channel: one(chatChannels, {
    fields: [chatMessages.channelId],
    references: [chatChannels.id],
  }),
  sender: one(users, {
    fields: [chatMessages.senderId],
    references: [users.id],
  }),
}));
