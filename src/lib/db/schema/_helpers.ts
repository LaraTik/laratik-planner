import { sql } from "drizzle-orm";
import { customType, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Shared column patterns from STUDIOFLOW_MASTER_PROMPT.md §8.
 * Every mutable business table has created_at + updated_at. Where relevant,
 * archived_at + archived_by. Timestamps in UTC, displayed in workspace tz.
 *
 * This file holds PURE helpers only — no table imports — to avoid circular
 * dependency problems. Each table file imports what it needs and references
 * `users` / `agencies` / `workspaces` directly.
 */

export const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .default(sql`now()`),
};

export const archivedAt = () => timestamp("archived_at", { withTimezone: true, mode: "date" });

/**
 * citext — case-insensitive text. Used for invitation emails. The Postgres
 * `citext` extension must be enabled in a migration before this type is used.
 */
export const citext = customType<{ data: string }>({
  dataType() {
    return "citext";
  },
});

/**
 * JSONB with default empty object. The `$type<Record<string, unknown>>()`
 * keeps the inferred TypeScript shape honest without forcing a per-call
 * generic; callers that need a narrower shape should `.$type<MyShape>()`.
 */
export const jsonb = (name: string) =>
  text(name)
    .$type<Record<string, unknown>>()
    .notNull()
    .default(sql`'{}'::jsonb`);

/**
 * `now()` in UTC, as a `date` (Drizzle's preferred type for time fields).
 * Use this for default timestamps instead of relying on the column default
 * so the value is set at the JS layer too (helps with optimistic
 * concurrency and audit logs that read back the inserted value).
 */
export const nowDate = () => new Date();

/**
 * Helper to declare a partial unique index for "active rows only" — used
 * for names that must be unique among non-archived rows
 * (e.g. content_pillars.name per workspace, content_templates.name).
 *
 * Usage in a pgTable config:
 *   (t) => ({
 *     activeNameUnique: uniqueIndex("ck_pillars_active_name").on(t.workspaceId, t.name).where(sql`archived_at IS NULL`),
 *   })
 *
 * We don't return a helper from this — just use the standard Drizzle
 * `uniqueIndex(...).on(...).where(...)` chain directly. Kept here as a
 * reference comment.
 */

/** `uuid_generate_v4()`-equivalent via `gen_random_uuid()` (pgcrypto). */
export const genRandomUuid = () => sql`gen_random_uuid()`;

/** Re-export a convenience for the canonical "id" column. */
export const idColumn = () => uuid("id").primaryKey().default(genRandomUuid());
