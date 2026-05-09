/**
 * Flywheel signals — append-only timeline of every measurable AI event.
 *
 * Aggregated by `@alecrae/flywheel` into FlywheelSnapshot for /admin/flywheel
 * and UserFlywheelStats for /your-ai. Cold storage after 365 days per
 * `.ai-flywheel/config.json` retention policy.
 */

import {
  pgTable,
  text,
  timestamp,
  jsonb,
  index,
  uuid,
} from "drizzle-orm/pg-core";
import { relations, type InferSelectModel, type InferInsertModel } from "drizzle-orm";
import { accounts, users } from "./users.js";

export const flywheelSignals = pgTable(
  "flywheel_signals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    category: text("category").notNull(),
    event: text("event").notNull(),
    payload: jsonb("payload").notNull(),
    capturedAt: timestamp("captured_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    byAccountTime: index("flywheel_signals_account_time_idx").on(
      t.accountId,
      t.capturedAt,
    ),
    byUserTime: index("flywheel_signals_user_time_idx").on(t.userId, t.capturedAt),
    byCategoryTime: index("flywheel_signals_category_time_idx").on(
      t.category,
      t.capturedAt,
    ),
  }),
);

export const flywheelSignalsRelations = relations(flywheelSignals, ({ one }) => ({
  account: one(accounts, {
    fields: [flywheelSignals.accountId],
    references: [accounts.id],
  }),
  user: one(users, {
    fields: [flywheelSignals.userId],
    references: [users.id],
  }),
}));

export type FlywheelSignal = InferSelectModel<typeof flywheelSignals>;
export type NewFlywheelSignal = InferInsertModel<typeof flywheelSignals>;
