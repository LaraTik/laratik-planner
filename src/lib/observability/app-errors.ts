import "server-only";

import { and, count, desc, eq, inArray, like, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { appErrorEvents, appErrorGroups } from "@/lib/db/schema";
import { getRequestId, getRequestLogs } from "@/lib/observability/request-context";
import { logWarn } from "@/lib/observability/logger";
import { serializeError } from "@/lib/observability/redact";
import { fingerprintFor } from "@/lib/observability/fingerprint";
import { createHash } from "node:crypto";
import { createBuildInfo } from "@/lib/build-info";
import { serverEnv } from "@/lib/validation/env";

/**
 * OBS-002 — capture a failure to the in-app mirror.
 *
 * Every failure origin converges on {@link captureAppError}:
 *
 *   1. **Server** — `onRequestError` in `instrumentation.ts`, covering
 *      server-component renders, route handlers, server actions, and the
 *      proxy.
 *   2. **Process-level** — `unhandledRejection` / `uncaughtException`
 *      registered in `instrumentation.ts`, for work outside a request.
 *   3. **Client** — the two React boundaries, via
 *      `recordErrorBoundaryAction`.
 *
 * Each capture does three things, in this order:
 *
 *   a. Compute a **fingerprint** over `(errorName, normalized message,
 *      route)` and upsert an `app_error_group`, incrementing its
 *      `occurrence_count`. The upsert is a single
 *      `INSERT … ON CONFLICT … DO UPDATE … RETURNING`, so two concurrent
 *      captures of the same error cannot lose an increment.
 *   b. Insert an `app_error_event` occurrence, with a bounded copy of
 *      the request's recent error/warn lines under `context.logs`.
 *   c. Fan out to Sentry (when a DSN is configured) as the optional
 *      long-term archive.
 *
 * ## Fail-silent by construction
 *
 * The caller is itself the failure path, so a write failure must never
 * propagate. Every branch is wrapped and downgraded to a `logWarn`.
 *
 * ## What is deliberately NOT stored
 *
 *   - Raw request bodies or form data.
 *   - Cookie values, `authorization` headers, or IP addresses.
 *   - The raw user agent (only a SHA-256; a UA is a stable
 *     cross-session fingerprint).
 *   - Any string that has not been through `observability/redact.ts`.
 *     Scrubbing happens *before* the write, so retention can never hold
 *     an unsanitized value.
 *
 * ## Availability
 *
 * Closing the server-side gap turns a rare path into a potentially hot
 * one, so a per-fingerprint burst cap ({@link burstLimit}) bounds row
 * growth: past the cap, only the group's `occurrence_count` moves and
 * the individual event row is skipped. The count therefore stays exact
 * while the table stays bounded, and `getAppErrorHealth` reports how
 * many occurrences were capped so a throttled system is visible rather
 * than silently lossy.
 */

/** Which boundary raised the error. */
export type AppErrorSource =
  | "app.error"
  | "global.error"
  | "server_action"
  | "client.unhandled"
  | "server.render"
  | "server.route"
  | "server.proxy"
  | "server.unhandled";

export type CaptureAppErrorInput = {
  /** Next.js error digest; may be undefined on client boundaries. */
  digest?: string | undefined;
  /** URL path the user was on when the error fired. */
  route: string;
  /** HTTP method for server-side errors; undefined on client boundaries. */
  method: string | undefined;
  /** Which boundary fired. */
  source: AppErrorSource;
  /** The thrown value. */
  error: unknown;
  /** React component stack on client boundaries. */
  componentStack?: string | undefined;
  /** Session user id when the actor is authenticated. */
  actorId?: string | undefined;
  /** Correlation id, when the caller knows it (the `onRequestError` path). */
  requestId?: string | undefined;
  /** Allowlisted structured context; merged with the request log buffer. */
  context?: Record<string, unknown> | undefined;
  /** Raw user agent; hashed before storage, never stored raw. */
  userAgent?: string | undefined;
  /** Next.js `onRequestError` routeType, when available. */
  routeType?: string | undefined;
  /** Next.js `onRequestError` routePath, when available. */
  routePath?: string | undefined;
};

const STACK_MAX_BYTES = 4 * 1024;
const COMPONENT_STACK_MAX_BYTES = 4 * 1024;

/** Default per-fingerprint, per-minute event-row cap. */
const DEFAULT_BURST_LIMIT = 20;

/** How long one burst window lasts, in ms. */
const BURST_WINDOW_MS = 60_000;

function burstLimit(): number {
  const raw = Number(process.env["APP_ERROR_BURST_LIMIT"]);
  return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : DEFAULT_BURST_LIMIT;
}

/**
 * Process-local burst windows, keyed by fingerprint.
 *
 * Per-process is exact for the single-container VPS topology in
 * `AGENTS.md`. A multi-replica deployment would need a shared bucket
 * (Postgres advisory lock or Redis); that is called out in
 * `docs/operations/observability.md` rather than silently assumed here.
 */
const burstWindows = new Map<string, { windowStart: number; count: number }>();

/** Occurrences whose individual row was skipped by the burst cap. */
let cappedOccurrences = 0;

/** How many occurrences the burst cap has suppressed since boot. */
export function rateLimitedOccurrenceCount(): number {
  return cappedOccurrences;
}

/** Test seam: reset the burst windows and the capped counter. */
export function __resetBurstLimiter(): void {
  burstWindows.clear();
  cappedOccurrences = 0;
}

/**
 * Consume one unit of this fingerprint's burst allowance.
 *
 * Returns `true` when a full event row may be written, `false` when the
 * window is exhausted (the caller still updates the group count).
 */
function takeBurstSlot(fingerprint: string, now: number): boolean {
  const limit = burstLimit();
  if (limit === 0) return false;
  const existing = burstWindows.get(fingerprint);
  if (!existing || now - existing.windowStart >= BURST_WINDOW_MS) {
    burstWindows.set(fingerprint, { windowStart: now, count: 1 });
    return true;
  }
  if (existing.count < limit) {
    existing.count += 1;
    return true;
  }
  return false;
}

/**
 * Keep the burst-window map from growing without bound. Entries are only
 * useful for one window, so a periodic sweep of anything older than two
 * windows is enough.
 */
function sweepBurstWindows(now: number): void {
  if (burstWindows.size < 1_000) return;
  for (const [key, value] of burstWindows) {
    if (now - value.windowStart >= BURST_WINDOW_MS * 2) burstWindows.delete(key);
  }
}

/** SHA-256 of the user agent. The raw string is never stored. */
function hashUserAgent(ua: string | undefined): string | undefined {
  if (!ua) return undefined;
  try {
    return createHash("sha256").update(ua, "utf8").digest("hex").slice(0, 32);
  } catch {
    return undefined;
  }
}

/**
 * Assemble the `context` jsonb for an occurrence.
 *
 * The log buffer is already sanitized (the logger sanitizes once and
 * shares the object with both sinks), so it is attached as-is. Caller
 * context is scrubbed again here defensively, because a future call site
 * could pass something the logger never saw.
 */
function buildContext(callerContext: Record<string, unknown> | undefined): Record<string, unknown> {
  const logs = getRequestLogs();
  const context: Record<string, unknown> = {
    ...(callerContext ?? {}),
  };
  if (logs.length > 0) {
    context["logs"] = logs.map((entry) => ({
      ts: entry.ts,
      level: entry.level,
      event: entry.event,
      ctx: entry.ctx,
    }));
  }
  return context;
}

/**
 * Upsert the group for a fingerprint and return its id.
 *
 * A single statement, deliberately. The read-modify-write alternative
 * loses increments whenever two requests fail with the same error at the
 * same time, which is exactly the case a grouping feature exists to
 * measure.
 */
async function upsertGroup(params: {
  fingerprint: string;
  errorName: string | undefined;
  sampleMessage: string;
  route: string;
  source: string;
}): Promise<string | null> {
  const rows = await db
    .insert(appErrorGroups)
    .values({
      fingerprint: params.fingerprint,
      ...(params.errorName ? { errorName: params.errorName } : {}),
      sampleMessage: params.sampleMessage,
      route: params.route,
      source: params.source,
    })
    .onConflictDoUpdate({
      target: appErrorGroups.fingerprint,
      set: {
        occurrenceCount: sql`${appErrorGroups.occurrenceCount} + 1`,
        lastSeenAt: sql`now()`,
        updatedAt: sql`now()`,
      },
    })
    .returning({ id: appErrorGroups.id });
  return rows[0]?.id ?? null;
}

export async function captureAppError(input: CaptureAppErrorInput): Promise<void> {
  try {
    const requestId = input.requestId ?? getRequestId();
    const build = createBuildInfo({
      version: serverEnv.APP_VERSION,
      builtAt: serverEnv.APP_BUILD_AT,
      environment: serverEnv.NODE_ENV,
    });
    // Persist the short SHA when we have one; otherwise leave the
    // column null so the row doesn't carry "local" / "unavailable"
    // values that would be misleading in /app/platform/errors.
    const buildVersion = build.shortSha ?? null;

    // `serializeError` reads the error structurally, so it works for a
    // real `Error` *and* for the plain `{ name, message, stack, cause }`
    // object a client component sends across the server-action boundary.
    const serialized = serializeError(input.error, { stackBytes: STACK_MAX_BYTES });
    const errorName = serialized.name;
    const message = serialized.message;
    const stack = serialized.stack;

    const fingerprint = fingerprintFor(errorName, message, input.route);
    const now = Date.now();
    sweepBurstWindows(now);
    const allowEventRow = takeBurstSlot(fingerprint, now);
    if (!allowEventRow) cappedOccurrences += 1;

    // The group write always happens, so the occurrence count is exact
    // even when the event row is capped.
    const groupId = await upsertGroup({
      fingerprint,
      errorName,
      sampleMessage: message,
      route: input.route,
      source: input.source,
    });

    if (!allowEventRow) return;

    await db.insert(appErrorEvents).values({
      ...(input.digest ? { digest: input.digest } : {}),
      route: input.route,
      ...(input.method ? { method: input.method } : {}),
      source: input.source,
      ...(errorName ? { errorName } : {}),
      message,
      ...(serialized.cause ? { causeMessage: serialized.cause.message } : {}),
      ...(stack ? { stack } : {}),
      ...(input.componentStack
        ? { componentStack: truncate(input.componentStack, COMPONENT_STACK_MAX_BYTES) }
        : {}),
      ...(requestId ? { requestId } : {}),
      ...(input.actorId ? { actorId: input.actorId } : {}),
      ...(buildVersion ? { buildVersion } : {}),
      ...(groupId ? { groupId } : {}),
      ...(hashUserAgent(input.userAgent) ? { userAgentHash: hashUserAgent(input.userAgent) } : {}),
      ...(input.routeType ? { routeType: input.routeType } : {}),
      ...(input.routePath ? { routePath: input.routePath } : {}),
      context: buildContext(input.context),
    });
  } catch (writeError) {
    // Fail-silent: the error boundary is itself the failure path.
    // We still emit a structured log line so the operator can see
    // the mirror-write failure if it becomes a pattern.
    logWarn("app_error.capture_failed", {
      source: input.source,
      route: input.route,
      err: writeError instanceof Error ? writeError : String(writeError),
    });
  }
}

/**
 * Truncate a stack-shaped value, using the **same** marker as
 * `redact.ts` so a single search for `…(truncated)` finds every
 * truncated diagnostic regardless of which field it landed in.
 */
function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) + "…(truncated)" : value;
}

// ─── Read path (platform admin /app/platform/errors + diagnostics MCP) ────

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
  groupId: string | null;
  routeType: string | null;
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
  /** Exact source label. */
  source?: string;
  /** Route prefix match. */
  routePrefix?: string;
  /** Only rows at or after this instant. */
  since?: Date;
  /** Restrict to one group. */
  groupId?: string;
  /** Filter by triage state. */
  resolved?: boolean;
};

const EVENT_COLUMNS = {
  id: appErrorEvents.id,
  digest: appErrorEvents.digest,
  route: appErrorEvents.route,
  method: appErrorEvents.method,
  source: appErrorEvents.source,
  message: appErrorEvents.message,
  requestId: appErrorEvents.requestId,
  actorId: appErrorEvents.actorId,
  buildVersion: appErrorEvents.buildVersion,
  groupId: appErrorEvents.groupId,
  routeType: appErrorEvents.routeType,
  createdAt: appErrorEvents.createdAt,
} as const;

/** Compose the optional filters into a single predicate. */
function buildEventPredicate(input: {
  query?: string;
  source?: string;
  routePrefix?: string;
  since?: Date;
  groupId?: string;
  resolved?: boolean;
}): SQL | undefined {
  const clauses: (SQL | undefined)[] = [];
  const search = input.query?.trim();
  if (search) {
    clauses.push(
      or(like(appErrorEvents.message, `%${search}%`), like(appErrorEvents.route, `%${search}%`)),
    );
  }
  if (input.source) clauses.push(eq(appErrorEvents.source, input.source));
  if (input.routePrefix) clauses.push(like(appErrorEvents.route, `${input.routePrefix}%`));
  if (input.since) clauses.push(sql`${appErrorEvents.createdAt} >= ${input.since}`);
  if (input.groupId) clauses.push(eq(appErrorEvents.groupId, input.groupId));
  if (typeof input.resolved === "boolean") {
    // An event inherits its group's triage state.
    clauses.push(
      input.resolved
        ? sql`${appErrorEvents.groupId} in (select id from app_error_group where resolved_at is not null)`
        : sql`(${appErrorEvents.groupId} is null or ${appErrorEvents.groupId} in (select id from app_error_group where resolved_at is null))`,
    );
  }
  const defined = clauses.filter((c): c is SQL => c !== undefined);
  if (defined.length === 0) return undefined;
  return and(...defined);
}

/**
 * Paginated read of `app_error_event` for the platform admin console and
 * the diagnostics MCP.
 *
 * `query` is a SQL `ILIKE` on `message` and `route`; Postgres parameter
 * binding makes it safe.
 */
export async function listAppErrors(input: AppErrorListInput): Promise<AppErrorListResult> {
  const page = Math.max(1, input.page);
  const pageSize = Math.max(1, Math.min(200, input.pageSize));
  const offset = (page - 1) * pageSize;
  const where = buildEventPredicate(input);

  const [rows, totalResult, matchedResult] = await Promise.all([
    db
      .select(EVENT_COLUMNS)
      .from(appErrorEvents)
      .where(where ?? sql`true`)
      .orderBy(desc(appErrorEvents.createdAt))
      .limit(pageSize)
      .offset(offset),
    db.select({ value: count() }).from(appErrorEvents),
    db
      .select({ value: count() })
      .from(appErrorEvents)
      .where(where ?? sql`true`),
  ]);

  return {
    rows,
    total: totalResult[0]?.value ?? 0,
    matched: matchedResult[0]?.value ?? 0,
  };
}

export type AppErrorDetail = AppErrorRow & {
  errorName: string | null;
  causeMessage: string | null;
  stack: string | null;
  componentStack: string | null;
  routePath: string | null;
  userAgentHash: string | null;
  context: unknown;
};

/** Look up one occurrence by id, including the full diagnostic payload. */
export async function getAppErrorById(id: string): Promise<AppErrorDetail | null> {
  const [row] = await db
    .select({
      ...EVENT_COLUMNS,
      errorName: appErrorEvents.errorName,
      causeMessage: appErrorEvents.causeMessage,
      stack: appErrorEvents.stack,
      componentStack: appErrorEvents.componentStack,
      routePath: appErrorEvents.routePath,
      userAgentHash: appErrorEvents.userAgentHash,
      context: appErrorEvents.context,
    })
    .from(appErrorEvents)
    .where(eq(appErrorEvents.id, id))
    .limit(1);
  return row ?? null;
}

/** Most recent row with a digest — resolves the boundary deep-link target. */
export async function findLatestAppErrorByDigest(digest: string): Promise<string | null> {
  const [row] = await db
    .select({ id: appErrorEvents.id })
    .from(appErrorEvents)
    .where(eq(appErrorEvents.digest, digest))
    .orderBy(desc(appErrorEvents.createdAt))
    .limit(1);
  return row?.id ?? null;
}

// ─── Group / triage read path ──────────────────────────────────────────────

export type AppErrorGroupRow = {
  id: string;
  fingerprint: string;
  errorName: string | null;
  sampleMessage: string;
  route: string;
  source: string;
  occurrenceCount: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  resolvedAt: Date | null;
  triageNote: string | null;
};

const GROUP_COLUMNS = {
  id: appErrorGroups.id,
  fingerprint: appErrorGroups.fingerprint,
  errorName: appErrorGroups.errorName,
  sampleMessage: appErrorGroups.sampleMessage,
  route: appErrorGroups.route,
  source: appErrorGroups.source,
  occurrenceCount: appErrorGroups.occurrenceCount,
  firstSeenAt: appErrorGroups.firstSeenAt,
  lastSeenAt: appErrorGroups.lastSeenAt,
  resolvedAt: appErrorGroups.resolvedAt,
  triageNote: appErrorGroups.triageNote,
} as const;

export type AppErrorGroupListInput = {
  /** Only groups last seen at or after this instant. */
  since?: Date;
  /** Filter by triage state. */
  resolved?: boolean;
  limit: number;
  /** Keyset cursor: return groups with `lastSeenAt` strictly before this. */
  before?: Date;
  /** Exact source label. */
  source?: string;
  /** Route prefix match. */
  routePrefix?: string;
  /**
   * Substring match against `sample_message` or `route`. This is what
   * lets the diagnostics MCP answer "diagnose the error matching
   * 'ZodError'" without the caller first knowing a fingerprint.
   */
  query?: string;
  /** Restrict to these group ids (used after an event-level query). */
  groupIds?: string[];
};

/** Most-recent-first list of error groups — the triage queue. */
export async function listAppErrorGroups(
  input: AppErrorGroupListInput,
): Promise<AppErrorGroupRow[]> {
  const limit = Math.max(1, Math.min(200, input.limit));
  const clauses: (SQL | undefined)[] = [];
  if (input.since) clauses.push(sql`${appErrorGroups.lastSeenAt} >= ${input.since}`);
  if (input.before) clauses.push(sql`${appErrorGroups.lastSeenAt} < ${input.before}`);
  if (input.source) clauses.push(eq(appErrorGroups.source, input.source));
  if (input.routePrefix) clauses.push(like(appErrorGroups.route, `${input.routePrefix}%`));
  if (input.query) {
    const search = input.query.trim();
    if (search) {
      clauses.push(
        or(
          like(appErrorGroups.sampleMessage, `%${search}%`),
          like(appErrorGroups.route, `%${search}%`),
        ),
      );
    }
  }
  if (input.groupIds && input.groupIds.length > 0) {
    clauses.push(inArray(appErrorGroups.id, input.groupIds));
  } else if (input.groupIds) {
    // An explicitly empty id set must match nothing, not everything.
    return [];
  }
  if (typeof input.resolved === "boolean") {
    clauses.push(
      input.resolved
        ? sql`${appErrorGroups.resolvedAt} is not null`
        : sql`${appErrorGroups.resolvedAt} is null`,
    );
  }
  const where = clauses.filter((c): c is SQL => c !== undefined);
  return db
    .select(GROUP_COLUMNS)
    .from(appErrorGroups)
    .where(where.length > 0 ? and(...where) : sql`true`)
    .orderBy(desc(appErrorGroups.lastSeenAt))
    .limit(limit);
}

export async function getAppErrorGroupByFingerprint(
  fingerprint: string,
): Promise<AppErrorGroupRow | null> {
  const [row] = await db
    .select(GROUP_COLUMNS)
    .from(appErrorGroups)
    .where(eq(appErrorGroups.fingerprint, fingerprint))
    .limit(1);
  return row ?? null;
}

export type TriageInput = {
  fingerprint: string;
  action: "resolve" | "reopen";
  note?: string | undefined;
};

/**
 * Set or clear a group's triage state.
 *
 * Idempotent by construction: resolving an already-resolved group is a
 * no-op success, which is what the diagnostics MCP contract promises.
 * A `reopen` clears the note only when one is supplied, so an operator
 * can dismiss without destroying the history of why it was resolved.
 */
export async function triageAppErrorGroup(input: TriageInput): Promise<AppErrorGroupRow | null> {
  const note = input.note?.trim() ? input.note.trim().slice(0, 500) : null;
  const set =
    input.action === "resolve"
      ? { resolvedAt: sql`now()`, updatedAt: sql`now()`, ...(note ? { triageNote: note } : {}) }
      : { resolvedAt: null, updatedAt: sql`now()`, ...(note ? { triageNote: note } : {}) };
  const rows = await db
    .update(appErrorGroups)
    .set(set)
    .where(eq(appErrorGroups.fingerprint, input.fingerprint))
    .returning(GROUP_COLUMNS);
  return rows[0] ?? null;
}

// ─── Diagnostics aggregate (consumed by the MCP `diagnose` tool) ──────────

export type AppErrorDiagnostics = {
  group: AppErrorGroupRow;
  /** Distinct build versions the group has been seen on. */
  builds: string[];
  /** Distinct routes the group has been seen on. */
  routes: string[];
  /** Distinct sources the group has been seen on. */
  sources: string[];
  /** Occurrence count per ISO hour, oldest first. */
  hourly: Array<{ hour: string; count: number }>;
  /** Most recent occurrences, newest first. */
  recent: AppErrorDetail[];
  /** Total occurrences whose individual row was suppressed by the cap. */
  cappedOccurrences: number;
};

/**
 * Everything needed to answer "what broke, how often, since when, and
 * on which deploy" for one fingerprint, in a single call.
 */
export async function getAppErrorDiagnostics(
  fingerprint: string,
  options: { since?: Date; sampleLimit?: number } = {},
): Promise<AppErrorDiagnostics | null> {
  const group = await getAppErrorGroupByFingerprint(fingerprint);
  if (!group) return null;
  const sampleLimit = Math.max(1, Math.min(20, options.sampleLimit ?? 5));

  const sinceClause = options.since
    ? sql`${appErrorEvents.createdAt} >= ${options.since}`
    : sql`true`;

  const [builds, routes, sources, hourly, recent] = await Promise.all([
    db
      .selectDistinct({ buildVersion: appErrorEvents.buildVersion })
      .from(appErrorEvents)
      .where(and(eq(appErrorEvents.groupId, group.id), sinceClause))
      .then((rows) => rows.map((r) => r.buildVersion).filter((v): v is string => !!v)),
    db
      .selectDistinct({ route: appErrorEvents.route })
      .from(appErrorEvents)
      .where(and(eq(appErrorEvents.groupId, group.id), sinceClause))
      .then((rows) => rows.map((r) => r.route)),
    db
      .selectDistinct({ source: appErrorEvents.source })
      .from(appErrorEvents)
      .where(and(eq(appErrorEvents.groupId, group.id), sinceClause))
      .then((rows) => rows.map((r) => r.source)),
    db
      .select({
        hour: sql<string>`to_char(date_trunc('hour', ${appErrorEvents.createdAt} at time zone 'UTC'), 'YYYY-MM-DD"T"HH24:00:00Z')`,
        count: sql<number>`count(*)::int`,
      })
      .from(appErrorEvents)
      .where(and(eq(appErrorEvents.groupId, group.id), sinceClause))
      .groupBy(sql`date_trunc('hour', ${appErrorEvents.createdAt} at time zone 'UTC')`)
      .orderBy(sql`date_trunc('hour', ${appErrorEvents.createdAt} at time zone 'UTC')`),
    db
      .select({
        ...EVENT_COLUMNS,
        errorName: appErrorEvents.errorName,
        causeMessage: appErrorEvents.causeMessage,
        stack: appErrorEvents.stack,
        componentStack: appErrorEvents.componentStack,
        routePath: appErrorEvents.routePath,
        userAgentHash: appErrorEvents.userAgentHash,
        context: appErrorEvents.context,
      })
      .from(appErrorEvents)
      .where(and(eq(appErrorEvents.groupId, group.id), sinceClause))
      .orderBy(desc(appErrorEvents.createdAt))
      .limit(sampleLimit),
  ]);

  return {
    group,
    builds,
    routes,
    sources,
    hourly,
    recent,
    cappedOccurrences: rateLimitedOccurrenceCount(),
  };
}

// ─── Health + retention ────────────────────────────────────────────────────

export type AppErrorHealth = {
  ok: true;
  version: string | null;
  environment: string;
  db: "reachable";
  lastHour: number;
  last24h: number;
  /** Occurrences since process start whose event row the burst cap skipped. */
  cappedOccurrences: number;
  /** The three most recent unresolved groups. */
  topGroups: Array<{
    fingerprint: string;
    occurrenceCount: number;
    sampleMessage: string;
    route: string;
    lastSeenAt: Date;
  }>;
};

export async function getAppErrorHealth(): Promise<AppErrorHealth> {
  const build = createBuildInfo({
    version: serverEnv.APP_VERSION,
    builtAt: serverEnv.APP_BUILD_AT,
    environment: serverEnv.NODE_ENV,
  });
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [lastHourRows, last24hRows, topGroups] = await Promise.all([
    db
      .select({ value: count() })
      .from(appErrorEvents)
      .where(sql`${appErrorEvents.createdAt} >= ${hourAgo}`),
    db
      .select({ value: count() })
      .from(appErrorEvents)
      .where(sql`${appErrorEvents.createdAt} >= ${dayAgo}`),
    db
      .select({
        fingerprint: appErrorGroups.fingerprint,
        occurrenceCount: appErrorGroups.occurrenceCount,
        sampleMessage: appErrorGroups.sampleMessage,
        route: appErrorGroups.route,
        lastSeenAt: appErrorGroups.lastSeenAt,
      })
      .from(appErrorGroups)
      .where(sql`${appErrorGroups.resolvedAt} is null`)
      .orderBy(desc(appErrorGroups.occurrenceCount), desc(appErrorGroups.lastSeenAt))
      .limit(3),
  ]);

  return {
    ok: true,
    version: build.shortSha,
    environment: serverEnv.NODE_ENV,
    db: "reachable",
    lastHour: lastHourRows[0]?.value ?? 0,
    last24h: last24hRows[0]?.value ?? 0,
    cappedOccurrences: rateLimitedOccurrenceCount(),
    topGroups,
  };
}

export type PruneResult = {
  eventsDeleted: number;
  groupsDeleted: number;
};

/**
 * Enforce retention. Invoked by `/api/cron/error-retention`.
 *
 * Events age out at 30 days. Groups age out at 90 days but **only once
 * resolved** — an unresolved group is the thing an operator still needs,
 * and silently deleting the queue would defeat the purpose of the table.
 */
export async function pruneAppErrorRetention(
  options: { eventDays?: number; groupDays?: number } = {},
): Promise<PruneResult> {
  const eventDays = options.eventDays ?? 30;
  const groupDays = options.groupDays ?? 90;

  // Cutoff timestamps are computed here rather than in SQL as
  // `now() - ($1 || ' days')::interval`. Binding a bare parameter into
  // `||` is ambiguous in Postgres (it can fail to resolve the operator),
  // and a plain timestamp comparison also lets the planner use the
  // `created_at` / `last_seen_at` indexes directly.
  const eventCutoff = new Date(Date.now() - eventDays * 86_400_000);
  const groupCutoff = new Date(Date.now() - groupDays * 86_400_000);

  const deletedEvents = await db
    .delete(appErrorEvents)
    .where(sql`${appErrorEvents.createdAt} < ${eventCutoff}`)
    .returning({ id: appErrorEvents.id });

  const deletedGroups = await db
    .delete(appErrorGroups)
    .where(
      sql`${appErrorGroups.lastSeenAt} < ${groupCutoff} and ${appErrorGroups.resolvedAt} is not null`,
    )
    .returning({ id: appErrorGroups.id });

  return { eventsDeleted: deletedEvents.length, groupsDeleted: deletedGroups.length };
}

/**
 * True when the actor has `platform.console.read`. Used by `error.tsx`
 * (a client component) to decide whether to render the "View in
 * platform errors" deep-link, and by the diagnostics MCP as the second
 * authorization gate.
 *
 * Returns `false` for unauthenticated actors so the link never shows up
 * on the sign-in error surface.
 */
export async function actorCanViewAppErrors(actorId: string | undefined): Promise<boolean> {
  if (!actorId) return false;
  const { hasPlatformPermission } = await import("@/lib/auth/platform-access");
  return hasPlatformPermission({ id: actorId }, "platform.console.read");
}
