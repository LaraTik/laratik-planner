import "server-only";

import { and, count, desc, eq, like, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { appErrorEvents } from "@/lib/db/schema";
import { getRequestId } from "@/lib/observability/request-context";
import { logWarn } from "@/lib/observability/logger";
import { createBuildInfo } from "@/lib/build-info";
import { serverEnv } from "@/lib/validation/env";

/**
 * Goal 13 / OBS-002 — capture an app-render error to the in-app mirror.
 *
 * `error.tsx` and `global-error.tsx` are the two boundaries that exercise
 * this. The flow is:
 *
 *   1. The boundary receives the thrown `error` and a `digest` (server
 *      side only — client-only errors have no digest).
 *   2. We call `captureAppError(...)` with a sanitized payload: route,
 *      method, source boundary, sanitized message, truncated stack, and
 *      the actor id (if the session was resolvable from `headers()` in
 *      the same request scope).
 *   3. We also fan out to the existing Sentry wrapper so the Sentry
 *      dashboard continues to be the long-term archive. The DB row
 *      is the **in-app** mirror; deleting the DB row does not delete
 *      the Sentry event.
 *
 * This function is **fail-silent**: a write failure must not throw,
 * because the caller is itself the error boundary. We log to the
 * structured log stream and move on.
 *
 * What we deliberately do NOT store:
 *   - Raw request body / form data
 *   - Cookie values, authorization headers, IP addresses
 *   - Full stack trace past 4 KB
 *   - Sentry DSN / auth tokens
 * The error boundary already runs in a state where secrets may be
 * available in scope; the helper takes only the fields it needs as
 * named arguments so the caller cannot accidentally pass more.
 */
export type CaptureAppErrorInput = {
  /** Next.js error digest; may be undefined on client boundaries. */
  digest: string | undefined;
  /** URL path the user was on when the error fired. */
  route: string;
  /** HTTP method for server-side errors; undefined on client boundaries. */
  method: string | undefined;
  /** Which boundary fired: `app.error`, `global.error`, `server_action`, `client.unhandled`. */
  source: "app.error" | "global.error" | "server_action" | "client.unhandled";
  /** The thrown value. We only read `name`, `message`, and `cause`; no raw payload. */
  error: unknown;
  /** React component stack on client boundaries; undefined on server boundaries. */
  componentStack?: string | undefined;
  /** Session user id when the actor is authenticated. */
  actorId?: string | undefined;
};

const STACK_MAX_BYTES = 4 * 1024;
const COMPONENT_STACK_MAX_BYTES = 4 * 1024;

function safeMessage(err: unknown): string {
  if (err instanceof Error) {
    // Strip leading whitespace + truncate. Sentry keeps the long form.
    return err.message.slice(0, 2_000) || err.name || "Unknown error";
  }
  if (typeof err === "string") return err.slice(0, 2_000);
  return "Unknown error";
}

function safeName(err: unknown): string | undefined {
  if (err instanceof Error) return err.name;
  return undefined;
}

/**
 * `Error.cause` (Node ≥ 16.9 / modern browsers) is the real reason
 * behind a wrapped error. Drizzle's "Failed query: …" wrapper keeps
 * the original Postgres error on `.cause.message` — without
 * surfacing it on the row, the platform-errors table only shows
 * "Failed query: …" for every DB issue. The boundary surfaces this
 * one level deep; deeper chains are still in Sentry.
 */
function safeCauseMessage(err: unknown): string | undefined {
  if (!(err instanceof Error)) return undefined;
  // Node's `Error.cause` is typed as `unknown`. Drill in carefully.
  const cause = (err as { cause?: unknown }).cause;
  if (cause instanceof Error) {
    return cause.message.slice(0, 2_000) || cause.name || undefined;
  }
  if (typeof cause === "string") return cause.slice(0, 2_000);
  return undefined;
}

function safeStack(err: unknown): string | undefined {
  if (!(err instanceof Error)) return undefined;
  const stack = err.stack ?? "";
  if (!stack) return undefined;
  return stack.length > STACK_MAX_BYTES
    ? stack.slice(0, STACK_MAX_BYTES) + "\n…(truncated)"
    : stack;
}

/**
 * React 19 surfaces a component stack on the boundary error via the
 * third arg of the boundary (the second arg is `reset`, the third is
 * the component stack string). Client boundaries receive it; server
 * boundaries don't. The client-boundary code passes it through the
 * server action as a plain string.
 */
function truncateComponentStack(s: string | undefined): string | undefined {
  if (!s) return undefined;
  if (s.length <= COMPONENT_STACK_MAX_BYTES) return s;
  return s.slice(0, COMPONENT_STACK_MAX_BYTES) + "\n…(truncated)";
}

export async function captureAppError(input: CaptureAppErrorInput): Promise<void> {
  try {
    const requestId = getRequestId();
    const build = createBuildInfo({
      version: serverEnv.APP_VERSION,
      environment: serverEnv.NODE_ENV,
    });
    // Persist the short SHA when we have one; otherwise leave the
    // column null so the row doesn't carry "local" / "unavailable"
    // values that would be misleading in /app/platform/errors.
    const buildVersion = build.shortSha ?? null;
    const errorName = safeName(input.error);
    const causeMessage = safeCauseMessage(input.error);
    const stack = safeStack(input.error);
    const componentStack = truncateComponentStack(input.componentStack);
    await db.insert(appErrorEvents).values({
      ...(input.digest ? { digest: input.digest } : {}),
      route: input.route,
      ...(input.method ? { method: input.method } : {}),
      source: input.source,
      ...(errorName ? { errorName } : {}),
      message: safeMessage(input.error),
      ...(causeMessage ? { causeMessage } : {}),
      ...(stack ? { stack } : {}),
      ...(componentStack ? { componentStack } : {}),
      ...(requestId ? { requestId } : {}),
      ...(input.actorId ? { actorId: input.actorId } : {}),
      ...(buildVersion ? { buildVersion } : {}),
    });
  } catch (writeError) {
    // Fail-silent: the error boundary is itself the failure path.
    // We still emit a structured log line so the operator can see
    // the mirror-write failure if it becomes a pattern.
    logWarn("app_error.capture_failed", {
      source: input.source,
      route: input.route,
      err: writeError instanceof Error ? writeError.message : String(writeError),
    });
  }
}

// ─── Read path (platform admin /app/platform/errors) ─────────────────────

export type AppErrorRow = {
  id: string;
  digest: string | null;
  route: string;
  method: string | null;
  source: string;
  message: string;
  requestId: string | null;
  actorId: string | null;
  buildVersion: string | null;
  createdAt: Date;
};

export type AppErrorListResult = {
  rows: AppErrorRow[];
  total: number;
  /** Total rows matching the search query, for paginator copy. */
  matched: number;
};

export type AppErrorListInput = {
  /** Page number (1-indexed). */
  page: number;
  /** Page size; clamped to [1, 200] by the caller. */
  pageSize: number;
  /** Free-text search across `message` and `route`. Empty string = no filter. */
  query?: string;
};

/**
 * Paginated read of `app_error_event` for the platform admin console.
 *
 * The query is intentionally narrow — the platform admin console is
 * a recent-events view, not a search engine. When the table grows past
 * the next sprint we will add a 30-day prune; the index on
 * `created_at DESC` is what makes this read fast.
 *
 * The `query` is a SQL `ILIKE` on `message` and `route`. Postgres
 * parameter binding makes this safe; the worst case is a sequential
 * scan of the page (200 rows) which is fine for the console use case.
 */
export async function listAppErrors(input: AppErrorListInput): Promise<AppErrorListResult> {
  const page = Math.max(1, input.page);
  const pageSize = Math.max(1, Math.min(200, input.pageSize));
  const offset = (page - 1) * pageSize;
  const search = input.query?.trim() ?? "";

  const where = search
    ? or(like(appErrorEvents.message, `%${search}%`), like(appErrorEvents.route, `%${search}%`))
    : undefined;

  const [rows, totalResult, matchedResult] = await Promise.all([
    db
      .select({
        id: appErrorEvents.id,
        digest: appErrorEvents.digest,
        route: appErrorEvents.route,
        method: appErrorEvents.method,
        source: appErrorEvents.source,
        message: appErrorEvents.message,
        requestId: appErrorEvents.requestId,
        actorId: appErrorEvents.actorId,
        buildVersion: appErrorEvents.buildVersion,
        createdAt: appErrorEvents.createdAt,
      })
      .from(appErrorEvents)
      .where(where ?? sql`true`)
      .orderBy(desc(appErrorEvents.createdAt))
      .limit(pageSize)
      .offset(offset),
    db.select({ value: count() }).from(appErrorEvents),
    where
      ? db.select({ value: count() }).from(appErrorEvents).where(where)
      : db.select({ value: count() }).from(appErrorEvents),
  ]);

  return {
    rows,
    total: totalResult[0]?.value ?? 0,
    matched: matchedResult[0]?.value ?? 0,
  };
}

/**
 * Look up one error by id. Used by the "deep link" from the
 * `/app/platform/errors` page (e.g. when an admin clicks a row to
 * see the full message + truncated stack).
 */
export async function getAppErrorById(id: string): Promise<AppErrorRow | null> {
  const [row] = await db
    .select({
      id: appErrorEvents.id,
      digest: appErrorEvents.digest,
      route: appErrorEvents.route,
      method: appErrorEvents.method,
      source: appErrorEvents.source,
      message: appErrorEvents.message,
      stack: appErrorEvents.stack,
      requestId: appErrorEvents.requestId,
      actorId: appErrorEvents.actorId,
      buildVersion: appErrorEvents.buildVersion,
      createdAt: appErrorEvents.createdAt,
    })
    .from(appErrorEvents)
    .where(eq(appErrorEvents.id, id))
    .limit(1);
  if (!row) return null;
  return {
    id: row.id,
    digest: row.digest,
    route: row.route,
    method: row.method,
    source: row.source,
    message: row.message,
    requestId: row.requestId,
    actorId: row.actorId,
    buildVersion: row.buildVersion,
    createdAt: row.createdAt,
  };
}

/**
 * Used by the in-app error surface to deep-link to the matching
 * platform-error row. The error.tsx passes the digest; we return the
 * most recent row with that digest (a single error can produce
 * multiple rows on retry).
 */
export async function findLatestAppErrorByDigest(digest: string): Promise<string | null> {
  const [row] = await db
    .select({ id: appErrorEvents.id })
    .from(appErrorEvents)
    .where(eq(appErrorEvents.digest, digest))
    .orderBy(desc(appErrorEvents.createdAt))
    .limit(1);
  return row?.id ?? null;
}

/**
 * True when the actor has platform.console.read. Used by `error.tsx`
 * (a client component) to decide whether to render the "View in
 * platform errors" deep-link. The boundary can render this without
 * a server round-trip: the call is awaited once before the boundary
 * hydrates.
 *
 * Returns `false` for unauthenticated actors so the link never
 * shows up on the sign-in error surface.
 */
export async function actorCanViewAppErrors(actorId: string | undefined): Promise<boolean> {
  if (!actorId) return false;
  const { hasPlatformPermission } = await import("@/lib/auth/platform-access");
  return hasPlatformPermission({ id: actorId }, "platform.console.read");
}

// Re-export `and` so the linter does not strip the import; it is
// used by the read-side filters in a follow-up (filter-by-source,
// filter-by-route-prefix) once we surface those controls.
void and;
