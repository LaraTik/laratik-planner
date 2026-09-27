import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Per-request observability context.
 *
 * The Next.js proxy (`src/proxy.ts`) mints a `requestId` for every
 * incoming HTTP request and stores it in an `AsyncLocalStorage` so
 * downstream log lines and Sentry captures can attach the same id
 * without having to thread it through every helper signature.
 *
 * Why `AsyncLocalStorage`:
 *  - Survives async boundaries (await, Promise.all, db queries,
 *    fetch calls) without each call-site having to pass the id
 *    explicitly. Node's ALS propagates the store through any
 *    callback queued inside the active `run` scope.
 *  - Is a no-op when the proxy hasn't set a value (background jobs,
 *    crons, tests) — `getRequestId()` returns `undefined` in that
 *    case, and callers omit the tag instead of erroring.
 *
 * ## Log ring buffer
 *
 * The store also carries a bounded ring buffer of the request's recent
 * `error` / `warn` lines. When the request eventually fails,
 * `captureAppError` flushes the buffer into `app_error_event.context.logs`
 * so the persisted record shows what the request was *doing* at the
 * moment it broke, not just the final stack.
 *
 * This is the closest an HTTP-hosted app gets to a log tail: the lines
 * otherwise only reach Docker's `json-file` driver at `10m × 5`
 * (~50 MB) and are gone within hours. Cost is zero extra queries and
 * zero extra writes — the entries are the exact objects the logger
 * already emitted, and they are **already sanitized** when they land
 * here (`logger.ts` sanitizes once and hands the same object to both
 * the console and this buffer).
 *
 * The buffer is bounded at {@link REQUEST_LOG_BUFFER_LIMIT} entries with
 * oldest-first eviction, so a long-running streaming request cannot grow
 * it without limit.
 */

/** One buffered structured-log line. */
export type BufferedLogEntry = {
  ts: string;
  level: "error" | "warn";
  event: string;
  /** Already sanitized by `logger.ts` — safe to persist as-is. */
  ctx: unknown;
};

/** Maximum retained log entries per request. */
export const REQUEST_LOG_BUFFER_LIMIT = 50;

type RequestContext = {
  requestId?: string;
  logs?: BufferedLogEntry[];
};

const storage = new AsyncLocalStorage<RequestContext>();

/** Bind the given context for the duration of the callback. */
export function runWithRequestContext<T>(ctx: RequestContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

/** Read the current request id, if any. */
export function getRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}

/**
 * Append a sanitized log line to the current request's ring buffer.
 *
 * No-op when no request scope is active (cron ticks, scripts, tests) —
 * those code paths have no request to correlate against, and inventing
 * a store here would be wrong.
 *
 * Oldest-first eviction keeps the most recent {@link REQUEST_LOG_BUFFER_LIMIT}
 * entries, which are the ones adjacent to the failure.
 */
export function pushRequestLog(entry: BufferedLogEntry): void {
  const store = storage.getStore();
  if (!store) return;
  if (!store.logs) store.logs = [];
  store.logs.push(entry);
  if (store.logs.length > REQUEST_LOG_BUFFER_LIMIT) {
    store.logs.splice(0, store.logs.length - REQUEST_LOG_BUFFER_LIMIT);
  }
}

/**
 * Read the current request's buffered log lines.
 *
 * Non-destructive: a request that fails twice (or has two independent
 * errors) sees the same window in both captures, which is what you want
 * when reading the second one. Returns an empty array outside a request
 * scope rather than `undefined`, so callers can iterate unconditionally.
 */
export function getRequestLogs(): BufferedLogEntry[] {
  return storage.getStore()?.logs ?? [];
}
