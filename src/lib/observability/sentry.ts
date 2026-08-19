import "server-only";

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
 */

let initialized = false;

type SentryLike = {
  captureException: (e: unknown, ctx?: Record<string, unknown>) => void;
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
  // (it's ~100 KB and pulls in @sentry/core).
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Sentry = require("@sentry/nextjs") as typeof import("@sentry/nextjs");
    const release = process.env["SENTRY_RELEASE"];
    Sentry.init({
      dsn,
      tracesSampleRate: Number(process.env["SENTRY_TRACES_SAMPLE_RATE"] ?? 0.1),
      environment: process.env["SENTRY_ENVIRONMENT"] ?? process.env["NODE_ENV"],
      ...(release ? { release } : {}),
    });
    cached = {
      captureException: (e, ctx) =>
        ctx ? Sentry.captureException(e, { extra: ctx }) : Sentry.captureException(e),
      captureMessage: (msg, level) => Sentry.captureMessage(msg, level),
      setUser: (user) => Sentry.setUser(user),
    };
    return cached;
  } catch (err) {
    // Sentry package not installed or init failed — fall back to no-op
    console.warn("[sentry] init failed:", err);
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
  loadSentry()?.captureException(err, context);
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
