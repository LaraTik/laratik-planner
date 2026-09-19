import { boolean, check, pgTable, smallint, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * `workflow_scenario` — read-only catalog of the pre-defined content-
 * workflow spines a workspace can pick from.
 *
 * Shipped by migration 0048. Application code reads it as a lookup
 * table; only the migration is expected to write to it. Each row
 * describes the ordered rail stages the scenario includes plus the
 * scenario's contract on `workspace_settings.approvalMode` (the
 * scenario can force 'simple' / 'internal_then_client', or leave it
 * to the workspace's own setting).
 *
 * The runtime engine (`src/lib/content/workflow.ts`) filters its
 * transition rules at this boundary — see `effectiveTransitions()` and
 * `getActiveScenario()` there.
 *
 * Schema invariants (enforced in the migration):
 *  - Exactly one row has `is_default = true`.
 *  - `stages` has at least 2 entries (one source + one sink).
 *  - `approval_mode`, when set, is one of 'single' / 'two_gate'.
 */

export const workflowScenario = pgTable(
  "workflow_scenario",
  {
    id: text("id").primaryKey(),
    nameKey: text("name_key").notNull(),
    blurbKey: text("blurb_key").notNull(),
    stages: text("stages").array().notNull(),
    approvalMode: text("approval_mode"),
    publishingSetupRequired: boolean("publishing_setup_required").notNull(),
    displayOrder: smallint("display_order").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    check(
      "workflow_scenario_approval_mode_valid",
      sql`${t.approvalMode} IS NULL OR ${t.approvalMode} IN ('single','two_gate')`,
    ),
    check("workflow_scenario_stages_nonempty", sql`cardinality(${t.stages}) >= 2`),
  ],
);
