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
 * The store is intentionally narrow (just the request id for now).
 * If/when we add `userId`, `traceId`, etc. they go here so the
 * log/Sentry wrappers don't need to know.
 */
type RequestContext = { requestId?: string };

const storage = new AsyncLocalStorage<RequestContext>();

/** Bind the given context for the duration of the callback. */
export function runWithRequestContext<T>(ctx: RequestContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

/** Read the current request id, if any. */
export function getRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}
