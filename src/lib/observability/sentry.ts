import { getRequestId } from "@/lib/observability/request-context";
import { logError } from "@/lib/observability/logger";

/**
 * Sentry observability wrapper (Goal 13 — master prompt §21).
 *
 * The @sentry/nextjs package is in the dependency tree but the init is
 * gated entirely on `SENTRY_DSN` being set. In dev / CI / staging without
 * a DSN, every function below is a no-op so the app works without any
 * Sentry account.
 *
 * To enable Sentry:
 *   1. Create a project at sentry.io (or self-hosted)
 *   2. Set SENTRY_DSN in /opt/laratik-planner/.env
 *   3. Set SENTRY_AUTH_TOKEN + SENTRY_ORG + SENTRY_PROJECT for source-map upload
 *      (only at build time — see the Dockerfile)
 *   4. Restart the container; the wrapper initializes on first import.
 *
 * Why this wrapper exists alongside `@sentry/nextjs`:
 *   - Centralised `captureError(scope, err, ctx)` that fans out to
 *     BOTH the structured log stream (always) AND Sentry (when
 *     configured), so the OBS-001 logger + Sentry never drift.
 *   - Adds a stable `scope` tag to every Sentry event so the
 *     on-call view can group by audit / auth / social surface.
 *   - Re-uses the `requestId` from `AsyncLocalStorage` so a
 *     Sentry event links to the structured log line.
 *
 * The SDK is initialised by `instrumentation.ts` →
 * `sentry.{server,edge}.config.ts` before any user request runs;
 * this module does NOT call `Sentry.init` (a second init in the
 * same process is a known footgun — silent no-op + warning). The
 * `error.tsx` files import `@sentry/nextjs` directly because they
 * are client components running in the browser, where the wrapper
 * is server-only by design (the DSN is the server-side secret).
 */

let initialized = false;

type SentryLike = {
  captureException: (
    e: unknown,
    ctx?: { tags?: Record<string, string>; extra?: Record<string, unknown> },
  ) => void;
  captureMessage: (msg: string, level?: "info" | "warning" | "error") => void;
  setUser: (user: { id: string; email?: string; username?: string } | null) => void;
};

let cached: SentryLike | null = null;

function loadSentry(): SentryLike | null {
  if (cached) return cached;
  if (initialized) return cached;
  initialized = true;

  const dsn = process.env["SENTRY_DSN"];
  if (!dsn) {
    return (cached = noopSentry);
  }

  // Dynamic import so dev / CI without Sentry never loads the SDK
  // (it's ~100 KB and pulls in @sentry/core). The SDK is
  // initialised by `instrumentation.ts` → `sentry.{server,edge}.config.ts`
  // before any user request runs, so we just wrap the methods here
  // and do NOT call `Sentry.init` again — a second `Sentry.init` in
  // the same process is a known footgun (no-op + warning).
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Sentry = require("@sentry/nextjs") as typeof import("@sentry/nextjs");
    cached = {
      captureException: (e, ctx) => {
        if (!ctx) return Sentry.captureException(e);
        // Forward both tags and extra to the SDK. The SDK's
        // `captureException` second arg is a `captureContext`; any
        // keys it doesn't recognise (like `tags` / `extra`) are
        // attached to the event as tag / extra payloads.
        return Sentry.captureException(e, ctx);
      },
      captureMessage: (msg, level) => Sentry.captureMessage(msg, level),
      setUser: (user) => Sentry.setUser(user),
    };
    return cached;
  } catch {
    // Sentry package not installed — fall back to no-op
    return (cached = noopSentry);
  }
}

const noopSentry: SentryLike = {
  captureException: () => {},
  captureMessage: () => {},
  setUser: () => {},
};

/** Capture an exception. No-op if Sentry isn't configured. */
export function captureException(err: unknown, context?: Record<string, unknown>): void {
  // Back-compat: legacy callers pass a flat context map; treat it
  // as the `extra` payload. The richer `captureError` wrapper
  // builds the `{ tags, extra }` shape directly.
  loadSentry()?.captureException(err, context ? { extra: context } : undefined);
}

/** Capture a message at a given level. */
export function captureMessage(msg: string, level: "info" | "warning" | "error" = "info"): void {
  loadSentry()?.captureMessage(msg, level);
}

/** Tag the current request with the user. */
export function setUser(user: { id: string; email?: string; username?: string } | null): void {
  loadSentry()?.setUser(user);
}

/** True if Sentry is configured and active. */
export function isEnabled(): boolean {
  return !!process.env["SENTRY_DSN"];
}

/**
 * Capture a server-side error in BOTH the structured log stream
 * (always — so a Sentry-less dev / CI / staging still gets a
 * recoverable signal) AND Sentry (when configured).
 *
 * This is the single fan-out call-site for production error
 * reporting. Use it instead of `console.error('[scope] ...', err)`
 * so:
 *   - Errors flow to Sentry under a stable `scope` tag (searchable
 *     and alertable; not the case for free-form console messages).
 *   - Errors are sanitized + JSON-structured by `logError` instead
 *     of being printed as `[object Object]`-shaped stderr lines.
 *   - The current request id (from `AsyncLocalStorage`) is attached
 *     as a Sentry tag so a Sentry event links to the structured log
 *     line for the same request.
 *
 * @param scope  Short tag (e.g. `'auth.signin'`, `'social.audit'`).
 *               Becomes a Sentry tag `scope` AND the log `event`.
 * @param err    The thrown value or error to report.
 * @param ctx    Optional context map. Goes into both Sentry `extra`
 *               and the JSON log line. Sensitive keys are
 *               redacted by the logger.
 */
export function captureError(scope: string, err: unknown, ctx: Record<string, unknown> = {}): void {
  const requestId = getRequestId();
  const ctxWithRequest = requestId ? { ...ctx, requestId } : ctx;

  // Always emit a structured log line. Sentry-less environments
  // (dev, CI, staging without a DSN) still surface the error
  // through this channel — the brief's "Sentry never sees these
  // errors" gap is closed by fanning out here, not by skipping the
  // log line.
  logError(scope, { ...ctxWithRequest, err });

  // Forward to Sentry. The `scope` tag is the primary search key
  // for the on-call operator.
  const sentry = loadSentry();
  if (!sentry) return;
  const tags: Record<string, string> = { scope };
  if (requestId) tags["requestId"] = requestId;
  // Use a require-shaped path: @sentry/nextjs's captureException
  // signature is (e, hint?). Our wrapper accepts a SentryLike with
  // an `extra`-shaped second arg, so we adapt tags + extra into
  // that shape — the SDK treats anything other than the documented
  // hint keys as "extra" payload.
  sentry.captureException(err, {
    tags,
    extra: ctxWithRequest,
  });
}
