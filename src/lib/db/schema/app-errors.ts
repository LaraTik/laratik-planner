import { sql } from "drizzle-orm";
import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./identity";

/**
 * Goal 13 / OBS-002 — In-app mirror of error events.
 *
 * Sentry is the long-term archive and the alert source. The `app_error_event`
 * table is a **lightweight, in-app mirror** of the same events so a platform
 * administrator can see the recent failure shape from the app shell
 * (`/app/platform/errors`) without leaving the product to open Sentry. The
 * table is intentionally narrow:
 *
 *   - One row per captured error (server or client boundary).
 *   - The `digest` is the Next.js error digest (stable across reloads); a
 *     NULL digest means the error was raised client-side without a server
 *     digest, which is rare on app-router error boundaries.
 *   - `route` is the URL path the user was on; `method` is the HTTP verb
 *     (server-side rows only — client rows have `method = null`).
 *   - `message` is the sanitized error message; the raw error is
 *     truncated to 4 KB to keep the row size bounded. The full payload
 *     is still in Sentry.
 *   - `actor_id` is set when the session is resolvable server-side; it
 *     is NULL for unauthenticated visitors hitting the sign-in or
 *     marketing pages.
 *   - `request_id` is the per-request id from `AsyncLocalStorage` so a
 *     Sentry event links back to the same row in this table.
 *
 * This is NOT a replacement for Sentry. There is no retention policy here
 * beyond the index (a 30-day prune is added in a follow-up); the table is
 * a debugging aid, not an audit log. `security_audit_event` remains the
 * authorization-action source of truth; this table is the rendering-failure
 * source of truth.
 */
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
    /** "server" | "client" | "unknown" — which boundary raised the error. */
    source: text("source").notNull(),
    /** Error class name (e.g. "PostgresError", "TypeError", "ZodError"). */
    errorName: text("error_name"),
    /** Sanitized error message; full message lives in Sentry. */
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
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    index("app_error_event_created_at_idx").on(sql`${t.createdAt} DESC`),
    index("app_error_event_digest_idx").on(t.digest),
    index("app_error_event_route_idx").on(t.route),
    index("app_error_event_actor_id_idx").on(t.actorId, sql`${t.createdAt} DESC`),
  ],
);
