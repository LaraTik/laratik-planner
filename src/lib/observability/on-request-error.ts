import "server-only";

import { captureAppError, type AppErrorSource } from "@/lib/observability/app-errors";
import { getRequestId } from "@/lib/observability/request-context";
import { logError, logWarn } from "@/lib/observability/logger";

/**
 * Next.js `onRequestError` — the single funnel for every **server**-side
 * failure (OBS-002).
 *
 * ## Why this exists
 *
 * `instrumentation.ts` previously exported
 * `Sentry.captureRequestError` directly. With no `SENTRY_DSN` configured
 * that is a **complete no-op**, so all 84 route handlers, every server
 * action, and every server-component render produced no durable record
 * anywhere: the container stdout line was the only trace, and Docker's
 * `json-file` driver at `10m × 5` discards it within hours.
 *
 * `onRequestError` is the framework's designated hook for exactly this,
 * and it hands us the failure *plus* the context needed to act on it:
 * the resource path, the HTTP method, and — critically — `routeType`,
 * which distinguishes a server-component render from a route handler, a
 * server action, or the proxy.
 *
 * ## Latency
 *
 * Next.js **awaits** this hook before finishing the response, so every
 * millisecond here lands on an already-failing request. The capture is
 * therefore wrapped in a {@link CAPTURE_BUDGET_MS} race: past the budget
 * the write is abandoned (the row is lost, the request is not prolonged)
 * and a `logWarn` records the timeout.
 *
 * ## Never throws
 *
 * This hook *is* the failure path. A throw here can turn a 500 into a
 * hang or a second, more confusing error. Every step is guarded, and the
 * Sentry fan-out is attempted independently of the database write so one
 * failing does not disable the other.
 */

/** Worst-case time we will spend persisting one error. */
const CAPTURE_BUDGET_MS = 2_000;

/** Mirrors the shape Next.js passes to `onRequestError`. */
export type OnRequestErrorRequest = {
  path: string;
  method: string;
  headers: Record<string, string | string[]>;
};

export type OnRequestErrorContext = {
  routerKind?: "App Router" | "Pages Router";
  routePath?: string;
  routeType?: "render" | "route" | "action" | "proxy";
  renderSource?: "react-server-components" | "react-server-components-payload" | "server-rendering";
  revalidateReason?: "on-demand" | "stale" | undefined;
  renderType?: "dynamic" | "dynamic-resume" | undefined;
};

/**
 * Map Next.js `routeType` onto the `source` taxonomy the console and the
 * diagnostics MCP read. The column is what answers "was this a render,
 * a route handler, or an action?" without cross-referencing the route.
 */
export function sourceForRouteType(routeType: OnRequestErrorContext["routeType"]): AppErrorSource {
  switch (routeType) {
    case "render":
      return "server.render";
    case "route":
      return "server.route";
    case "action":
      return "server_action";
    case "proxy":
      return "server.proxy";
    default:
      return "server.route";
  }
}

/** Read a header from the `string | string[]` shape Next.js supplies. */
function headerValue(
  headers: Record<string, string | string[]> | undefined,
  name: string,
): string | undefined {
  if (!headers) return undefined;
  const direct = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(direct)) return direct[0];
  return direct;
}

/**
 * Build the persisted `context` from an **allowlist**.
 *
 * Allowlist, not denylist, on purpose: `cookie` and `authorization` are
 * never named here, so a future Next.js version that adds a header to
 * this object cannot start leaking one. The header *names* are recorded
 * (useful — "was this a browser request or a cron bearer call?") but
 * never a header *value*, apart from the correlation id we already need.
 */
export function buildRequestContext(
  request: OnRequestErrorRequest,
  context: OnRequestErrorContext,
): Record<string, unknown> {
  const headers = request.headers ?? {};
  const headerNames = Object.keys(headers)
    .map((h) => h.toLowerCase())
    // Presence only. A value for any of these could carry a credential.
    .filter(
      (h) => h === "x-request-id" || h === "user-agent" || h === "referer" || h === "content-type",
    )
    .sort();

  return {
    routerKind: context.routerKind ?? null,
    routeType: context.routeType ?? null,
    routePath: context.routePath ?? null,
    renderSource: context.renderSource ?? null,
    revalidateReason: context.revalidateReason ?? null,
    renderType: context.renderType ?? null,
    method: request.method ?? null,
    path: request.path ?? null,
    headerNames,
  };
}

/** Reject a promise that outlives the budget, without leaking a timer. */
async function withBudget<T>(work: Promise<T>, ms: number, label: string): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const budget = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      logWarn("app_error.capture_timeout", { label, budgetMs: ms });
      resolve(null);
    }, ms);
  });
  try {
    return await Promise.race([work, budget]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * The `onRequestError` implementation.
 *
 * Split from `instrumentation.ts` so it can be unit-tested without
 * booting a Next.js server. The Sentry fan-out is injected rather than
 * imported so tests can assert it is still called.
 */
export async function handleRequestError(
  error: unknown,
  request: OnRequestErrorRequest,
  context: OnRequestErrorContext,
  deps: {
    capture: typeof captureAppError;
    forwardToSentry: (error: unknown, request: unknown, context: unknown) => unknown;
  },
): Promise<void> {
  try {
    const digest =
      error && typeof error === "object" && "digest" in error
        ? String((error as { digest?: unknown }).digest)
        : undefined;

    // The proxy already put `x-request-id` on the inbound request, so
    // this is the same id the structured log lines for this request
    // carry. That is what makes a persisted row joinable to its logs.
    const requestId = headerValue(request.headers, "x-request-id") ?? getRequestId();

    await withBudget(
      deps.capture({
        ...(digest && digest !== "undefined" ? { digest } : {}),
        route: request.path || "(unknown)",
        method: request.method,
        source: sourceForRouteType(context.routeType),
        error,
        ...(requestId ? { requestId } : {}),
        context: buildRequestContext(request, context),
        ...(headerValue(request.headers, "user-agent")
          ? { userAgent: headerValue(request.headers, "user-agent") }
          : {}),
        ...(context.routeType ? { routeType: context.routeType } : {}),
        ...(context.routePath ? { routePath: context.routePath } : {}),
      }),
      CAPTURE_BUDGET_MS,
      "onRequestError",
    );
  } catch (captureFailure) {
    // A throw inside the capture path must not mask the original error.
    logWarn("app_error.on_request_error_failed", {
      route: request?.path,
      err: captureFailure instanceof Error ? captureFailure : String(captureFailure),
    });
  }

  // Independent of the database write: a capture failure must not stop
  // Sentry from receiving the event (and vice versa).
  try {
    await deps.forwardToSentry(error, request, context);
  } catch (sentryFailure) {
    logError("app_error.sentry_forward_failed", {
      route: request?.path,
      err: sentryFailure instanceof Error ? sentryFailure : String(sentryFailure),
    });
  }
}

/**
 * `unhandledRejection` handler.
 *
 * Node's default is to warn and keep running, and so is ours — a stray
 * `void`ed promise should not take the app down. The event is attributed
 * to `server.unhandled` with a synthetic route, because there is no
 * request to attribute it to when the ALS scope is empty.
 */
export async function handleUnhandledRejection(
  reason: unknown,
  capture: typeof captureAppError,
): Promise<void> {
  try {
    await withBudget(
      capture({
        digest: undefined,
        route: "(unhandled-rejection)",
        method: undefined,
        source: "server.unhandled",
        error: reason,
      }),
      CAPTURE_BUDGET_MS,
      "unhandledRejection",
    );
  } catch {
    // Last line of defence: nothing left to report to.
  }
}

/**
 * `uncaughtException` handler.
 *
 * Deliberately fatal. An uncaught exception means the process is in an
 * undefined state — continuing risks a corrupted request being served,
 * or a second crash inside the error handler. We take a **bounded,
 * non-awaited** capture so the record has a chance to land, then exit
 * non-zero and let Docker's restart policy bring the container back.
 *
 * The exit is the point. Swallowing this would be the dangerous choice.
 */
export function handleUncaughtException(
  error: unknown,
  capture: typeof captureAppError,
  exit: (code: number) => void,
): void {
  logError("app_error.uncaught_exception", {
    err: error,
    action: "capturing then exiting",
  });
  try {
    // Fire-and-forget on purpose: awaiting here would delay the exit by
    // up to the budget, during which the process is already broken.
    void capture({
      digest: undefined,
      route: "(uncaught-exception)",
      method: undefined,
      source: "server.unhandled",
      error,
    });
  } catch {
    // Nothing to do; we are exiting regardless.
  }
  exit(1);
}
