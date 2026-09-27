import * as Sentry from "@sentry/nextjs";

/**
 * Next.js instrumentation entry point.
 *
 * Two responsibilities beyond booting the Sentry SDK:
 *
 *  1. {@link onRequestError} — the single funnel for every server-side
 *     failure (renders, route handlers, server actions, the proxy).
 *     Previously this was `Sentry.captureRequestError`, which is a
 *     **no-op without a `SENTRY_DSN`**. Since the DSN is an open
 *     owner-supplied item, that left all 84 route handlers, every server
 *     action, and every server render with no durable record anywhere.
 *     It now writes to the in-app mirror first and still forwards to
 *     Sentry, so the mirror is the primary signal and Sentry the
 *     optional archive.
 *
 *  2. Process-level handlers for `unhandledRejection` and
 *     `uncaughtException` — work that happens outside any request scope
 *     (cron ticks, scripts, a stray `void`ed promise) never reaches
 *     `onRequestError` at all.
 *
 * `uncaughtException` now **exits the process** where it previously did
 * not. That is deliberate: an uncaught exception means undefined state,
 * and continuing risks serving corrupted responses. Docker's restart
 * policy brings the container back. See `PORT_NOTES.md`.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
    await registerProcessErrorHandlers();
  }
  if (process.env.NEXT_RUNTIME === "edge") await import("./sentry.edge.config");
}

let processHandlersRegistered = false;

/**
 * Register the process-level error handlers exactly once.
 *
 * `register()` can run more than once across a dev-server HMR cycle or a
 * bundled re-entry, and `process.on` would otherwise stack duplicate
 * listeners — which would write duplicate rows for the same crash.
 */
async function registerProcessErrorHandlers(): Promise<void> {
  if (processHandlersRegistered) return;
  processHandlersRegistered = true;

  // Imported lazily: this module is evaluated by the edge runtime too, and
  // the observability helpers are Node-only.
  const { captureAppError } = await import("@/lib/observability/app-errors");
  const { handleUncaughtException, handleUnhandledRejection } =
    await import("@/lib/observability/on-request-error");

  process.on("unhandledRejection", (reason) => {
    void handleUnhandledRejection(reason, captureAppError);
  });

  process.on("uncaughtException", (error) => {
    handleUncaughtException(error, captureAppError, (code: number) => process.exit(code));
  });
}

/**
 * Capture a server error to the in-app mirror, then forward it to Sentry.
 *
 * Typed loosely rather than with `Instrumentation.onRequestError` so the
 * handler can be unit-tested directly; the shape matches the framework
 * contract in `node_modules/next/dist/docs/.../instrumentation.md`.
 */
export const onRequestError = async (
  error: unknown,
  request: { path: string; method: string; headers: Record<string, string | string[]> },
  context: {
    routerKind?: "App Router" | "Pages Router";
    routePath?: string;
    routeType?: "render" | "route" | "action" | "proxy";
    renderSource?:
      "react-server-components" | "react-server-components-payload" | "server-rendering";
    revalidateReason?: "on-demand" | "stale" | undefined;
    renderType?: "dynamic" | "dynamic-resume" | undefined;
  },
): Promise<void> => {
  const { handleRequestError } = await import("@/lib/observability/on-request-error");
  const { captureAppError } = await import("@/lib/observability/app-errors");
  await handleRequestError(error, request, context, {
    capture: captureAppError,
    forwardToSentry: (err: unknown, req: unknown, ctx: unknown) =>
      (Sentry.captureRequestError as unknown as (...args: unknown[]) => unknown)(err, req, ctx),
  });
};
