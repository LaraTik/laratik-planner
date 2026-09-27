import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./identity";

/**
 * Goal 13 / OBS-002 — In-app mirror of error events.
 *
 * Sentry is the optional long-term archive. The `app_error_event` table is
 * the **in-app source of truth for "what just broke"**: it has no SDK
 * dependency, so a Sentry outage or a missing DSN cannot take the
 * debugging surface down with it. A platform administrator reads it from
 * the app shell (`/app/platform/errors`) and, since the diagnostics MCP,
 * from an agent over `/api/mcp`.
 *
 * ## What gets written
 *
 * Every failure path converges on `captureAppError`:
 *
 *   - **Server** — `onRequestError` in `instrumentation.ts`, which covers
 *     server-component renders, route handlers, server actions, and the
 *     proxy. `route_type` records which.
 *   - **Process-level** — `unhandledRejection` / `uncaughtException`
 *     registered in `instrumentation.ts`, for work outside a request.
 *   - **Client** — the two React boundaries via
 *     `recordErrorBoundaryAction`, which ships a plain serializable
 *     object (a client component cannot hand a real `Error` across the
 *     server-action boundary).
 *
 * ## What is deliberately NOT stored
 *
 *   - Raw request bodies or form data.
 *   - Cookie values, `authorization` headers, or IP addresses.
 *   - The raw `user-agent` string — only `user_agent_hash`, because a UA
 *     is a stable cross-session fingerprint.
 *   - Any value that has not been through `observability/redact.ts`.
 *
 * Retention is enforced by `/api/cron/error-retention` (30 days for
 * events, 90 days for resolved groups); the previous "no prune" caveat
 * was removed with that job. `security_audit_event` remains the
 * authorization-action source of truth; this table is the
 * rendering-failure source of truth.
 */

/**
 * One row per *class* of failure, keyed by a stable fingerprint.
 *
 * This is what makes "this broke 47 times since the 14:02 deploy"
 * answerable, and it is the row an operator triages. Individual
 * occurrences stay in `app_error_event` and point here.
 *
 * `occurrence_count` is incremented with a single `INSERT … ON CONFLICT
 * DO UPDATE` (see `captureAppError`) rather than a read-modify-write, so
 * two concurrent captures of the same error cannot lose an increment.
 */
export const appErrorGroups = pgTable(
  "app_error_group",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** 12 hex chars — the unique conflict target of the group upsert. */
    fingerprint: text("fingerprint").notNull(),
    /** Error class name for this group. */
    errorName: text("error_name"),
    /** Most recent scrubbed message, for display in the console. */
    sampleMessage: text("sample_message").notNull(),
    /** Route where this group was most recently seen. */
    route: text("route").notNull(),
    /** Source label of the most recent occurrence. */
    source: text("source").notNull(),
    /** Total occurrences recorded for this fingerprint. */
    occurrenceCount: integer("occurrence_count").notNull().default(1),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true, mode: "date" })
      .notNull()
      .default(sql`now()`),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: "date" })
      .notNull()
      .default(sql`now()`),
    /** Set by triage; non-NULL means an operator acknowledged the group. */
    resolvedAt: timestamp("resolved_at", { withTimezone: true, mode: "date" }),
    /** Free-form triage note attached via the diagnostics MCP. */
    triageNote: text("triage_note"),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    uniqueIndex("app_error_group_fingerprint_key").on(t.fingerprint),
    index("app_error_group_last_seen_at_idx").on(sql`${t.lastSeenAt} DESC`),
    index("app_error_group_open_idx").on(t.resolvedAt, sql`${t.lastSeenAt} DESC`),
  ],
);

export const appErrorEvents = pgTable(
  "app_error_event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Next.js error digest; NULL when no server digest was assigned. */
    digest: text("digest"),
    /** URL path the user was on when the error fired. */
    route: text("route").notNull(),
    /** HTTP method (server rows only). NULL on client-boundary rows. */
    method: text("method"),
    /** Which boundary raised the error — see the `source` union in
     *  `app-errors.ts`: `app.error`, `global.error`, `server_action`,
     *  `client.unhandled`, `server.render`, `server.route`, `server.proxy`,
     *  `server.unhandled`. */
    source: text("source").notNull(),
    /** Error class name (e.g. "PostgresError", "TypeError", "ZodError"). */
    errorName: text("error_name"),
    /** Scrubbed error message (first 2 KB). */
    message: text("message").notNull(),
    /**
     * Chained cause message, one level deep.
     * For a `db.transaction(...)` failure the surface message is
     * usually a generic Drizzle wrapper ("Failed query: …") and the
     * real reason lives on `error.cause` (Postgres "record new has no
     * field updated_at" etc.). Surfacing it on the row makes the
     * `app/platform/errors` table queryable for the real reason.
     */
    causeMessage: text("cause_message"),
    /** Truncated stack trace (first 4 KB). */
    stack: text("stack"),
    /** React component stack on client boundaries, first 4 KB. */
    componentStack: text("component_stack"),
    /** `AsyncLocalStorage` request id when available. */
    requestId: text("request_id"),
    /** Session user id when the actor was authenticated. */
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    /** Build version / commit SHA (cheap correlation back to a deploy). */
    buildVersion: text("build_version"),
    /** The `app_error_group` this occurrence rolls up into. */
    groupId: uuid("group_id").references(() => appErrorGroups.id, { onDelete: "set null" }),
    /** SHA-256 of the user agent. The raw UA is a stable cross-session
     *  fingerprint and is never stored. */
    userAgentHash: text("user_agent_hash"),
    /**
     * Source-specific structured context, allowlisted per origin:
     * `routeType` / `routePath` / `renderSource` for server rows, and
     * the request's recent `error` / `warn` lines under `logs` (from the
     * `request-context` ring buffer). Never request bodies, cookies, or
     * authorization headers.
     */
    context: jsonb("context"),
    /**
     * Next.js `onRequestError` classification: `render` | `route` |
     * `action` | `proxy`. Distinguishes a server-component render
     * failure from a route-handler or server-action failure, which the
     * `source` column also records but at a coarser grain.
     */
    routeType: text("route_type"),
    /** The filesystem route file, e.g. `/app/w/[slug]/planning/[id]`. */
    routePath: text("route_path"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    index("app_error_event_created_at_idx").on(sql`${t.createdAt} DESC`),
    index("app_error_event_digest_idx").on(t.digest),
    index("app_error_event_route_idx").on(t.route),
    index("app_error_event_actor_id_idx").on(t.actorId, sql`${t.createdAt} DESC`),
    index("app_error_event_group_id_idx").on(t.groupId, sql`${t.createdAt} DESC`),
    index("app_error_event_source_idx").on(t.source, sql`${t.createdAt} DESC`),
  ],
);
