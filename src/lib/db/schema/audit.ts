import { sql } from "drizzle-orm";
import { bigserial, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { jsonb, timestamps } from "./_helpers";
import { users } from "./identity";
import { workspaces } from "./workspaces";

/**
 * STUDIOFLOW_MASTER_PROMPT.md §8 — Security audit + rate limits.
 *
 * "Never store passwords, tokens, raw authorization headers, full API
 * keys, or client file contents in audit metadata." — Enforced at the
 * service layer that writes these events; the schema doesn't have a
 * column for the bad data in the first place.
 */

export const securityAuditEvents = pgTable(
  "security_audit_event",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id"),
    outcome: text("outcome").notNull(), // 'success' | 'denied' | 'failed'
    requestId: text("request_id"),
    ipHash: text("ip_hash"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    index("security_audit_actor_idx").on(t.actorId, sql`${t.createdAt} DESC`),
    index("security_audit_action_idx").on(t.action, sql`${t.createdAt} DESC`),
  ],
);

/**
 * "Use a security-definer database function to atomically enforce fixed-window
 * limits for bootstrap, invitation acceptance, password-reset requests, upload
 * signing, and AI generation. Index scope, subject_hash, occurred_at and prune
 * old rows."
 */
export const rateLimitEvents = pgTable(
  "rate_limit_event",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    scope: text("scope").notNull(),
    subjectHash: text("subject_hash").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "date" })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    index("rate_limit_scope_subject_time_idx").on(t.scope, t.subjectHash, t.occurredAt),
  ],
);
