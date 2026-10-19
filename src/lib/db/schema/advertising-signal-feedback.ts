import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { idColumn, timestamps } from "./_helpers";
import { agencies, users } from "./identity";
import { advertisingAccounts } from "./advertising";
import { workspaces } from "./workspaces";

/**
 * User decisions on evidence-backed advertising signals.
 *
 * Feedback is scoped to the workspace, account, period, and actor so a
 * personal dismissal never hides a signal from another workspace member.
 * The security audit event records the state transition without storing
 * provider payloads or report data.
 */
export const advertisingSignalFeedback = pgTable(
  "advertising_signal_feedback",
  {
    id: idColumn(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => advertisingAccounts.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    signalKey: text("signal_key").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    periodSince: date("period_since").notNull(),
    periodUntil: date("period_until").notNull(),
    state: text("state").notNull().default("open"),
    reason: text("reason"),
    snoozedUntil: timestamp("snoozed_until", { withTimezone: true, mode: "date" }),
    generatedAt: timestamp("generated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .default(sql`now()`),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("advertising_signal_feedback_identity_uniq").on(
      t.workspaceId,
      t.accountId,
      t.userId,
      t.signalKey,
      t.entityType,
      t.entityId,
      t.periodSince,
      t.periodUntil,
    ),
    index("advertising_signal_feedback_workspace_period_idx").on(
      t.workspaceId,
      t.accountId,
      t.periodSince,
      t.periodUntil,
    ),
    check(
      "advertising_signal_feedback_entity_type_valid",
      sql`${t.entityType} IN ('campaign', 'budget', 'creative', 'audience')`,
    ),
    check(
      "advertising_signal_feedback_state_valid",
      sql`${t.state} IN ('open', 'reviewed', 'dismissed', 'snoozed')`,
    ),
    check("advertising_signal_feedback_period_valid", sql`${t.periodUntil} >= ${t.periodSince}`),
  ],
);

export type AdvertisingSignalFeedback = typeof advertisingSignalFeedback.$inferSelect;
export type NewAdvertisingSignalFeedback = typeof advertisingSignalFeedback.$inferInsert;
