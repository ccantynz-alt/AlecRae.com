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
import { accounts } from "./users.js";

// ---------------------------------------------------------------------------
// Auto-Responder / Vacation Mode — AI-powered OOO with smart replies
// ---------------------------------------------------------------------------

export const autoResponderModeEnum = pgEnum("auto_responder_mode", [
  "off",
  "vacation",
  "busy",
  "custom",
]);

export interface AutoResponderSchedule {
  startDate: string;
  endDate?: string;
  timezone: string;
}

export interface AutoResponderRules {
  respondToContacts: boolean;
  respondToUnknown: boolean;
  excludeDomains?: string[];
  excludeLabels?: string[];
  maxResponsesPerSender?: number;
  aiSmartReply: boolean;
}

export const autoResponders = pgTable(
  "auto_responders",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    mode: autoResponderModeEnum("mode").notNull().default("off"),
    subject: text("subject").notNull().default("Out of Office"),
    htmlBody: text("html_body").notNull().default(""),
    textBody: text("text_body").notNull().default(""),
    isActive: boolean("is_active").notNull().default(false),
    schedule: jsonb("schedule").$type<AutoResponderSchedule>(),
    rules: jsonb("rules")
      .notNull()
      .$type<AutoResponderRules>()
      .default({
        respondToContacts: true,
        respondToUnknown: false,
        maxResponsesPerSender: 1,
        aiSmartReply: false,
      }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("auto_responders_account_id_idx").on(table.accountId),
    index("auto_responders_active_idx").on(table.isActive),
  ],
);

export const autoResponderLog = pgTable(
  "auto_responder_log",
  {
    id: text("id").primaryKey(),
    autoResponderId: text("auto_responder_id")
      .notNull()
      .references(() => autoResponders.id, { onDelete: "cascade" }),
    recipientEmail: text("recipient_email").notNull(),
    emailId: text("email_id").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("auto_responder_log_responder_idx").on(table.autoResponderId),
    index("auto_responder_log_recipient_idx").on(table.recipientEmail),
  ],
);

export const autoRespondersRelations = relations(autoResponders, ({ one, many }) => ({
  account: one(accounts, {
    fields: [autoResponders.accountId],
    references: [accounts.id],
  }),
  logs: many(autoResponderLog),
}));

export const autoResponderLogRelations = relations(autoResponderLog, ({ one }) => ({
  autoResponder: one(autoResponders, {
    fields: [autoResponderLog.autoResponderId],
    references: [autoResponders.id],
  }),
}));
