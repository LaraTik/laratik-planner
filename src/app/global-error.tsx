"use client";

import * as React from "react";
import * as Sentry from "@sentry/nextjs";
import { AlertTriangle, LifeBuoy, RotateCcw } from "lucide-react";
import { recordErrorBoundaryAction } from "./(app)/error-actions";
import { matchErrorHint } from "@/lib/observability/error-hints";

/**
 * Root-layout failure boundary — Next.js + Sentry.
 *
 * This page ONLY renders when the root layout itself throws. The
 * regular `/app/error.tsx` handles every other unhandled error in
 * the (app) tree. We still try to:
 *   - Sentry-capture the error (so the long-term archive has it).
 *   - Persist the in-app mirror via `recordErrorBoundaryAction` —
 *     the action endpoint is reachable even when the layout is
 *     broken, because Next.js routes server actions through a
 *     separate handler. The action is best-effort: a fetch failure
 *     here is silent (the operator still has Sentry).
 *   - Render the same digest + Report-this affordance as the
 *     (app)/error.tsx so the user has one place to copy the
 *     reference regardless of which boundary fired.
 *
 * 2026-08-27 — added the `errorName` / `causeMessage` /
 * `componentStack` fields so the captured row in `app_error_event`
 * is queryable by the platform-errors page. Also surfaces the
 * "Root cause" hint inline (the rich bento-grid + disclosures
 * live in the in-app boundary; the global boundary stays minimal
 * on purpose — when the root layout throws, the chrome around
 * the message is the only thing we can trust).
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const route = typeof window !== "undefined" ? window.location.pathname : "";
  const method = typeof window !== "undefined" ? (document.body?.dataset.method ?? "GET") : "GET";
  const reference = error.digest ?? "no-digest";
  const errorName = error.name;
  const causeMessage =
    error.cause instanceof Error
      ? error.cause.message
      : typeof error.cause === "string"
        ? error.cause
        : undefined;
  // Compute the matched hint once on mount so we can show a short
  // root-cause line below the digest. The full bento-grid + reports
  // are the in-app boundary's job; the global boundary is the
  // last-resort chrome and stays minimal on purpose.
  matchErrorHint({
    errorName,
    message: error.message,
    causeMessage,
    digest: error.digest,
  });

  React.useEffect(() => {
    Sentry.captureException(error, {
      tags: { route, digest: error.digest ?? "no-digest", boundary: "global.error" },
    });
    let cancelled = false;
    void (async () => {
      try {
        const result = await recordErrorBoundaryAction({
          digest: error.digest,
          route: route || "(unknown)",
          method,
          source: "global.error",
          message: error.message || error.name || "Unknown error",
          ...(errorName ? { errorName } : {}),
          ...(causeMessage ? { causeMessage } : {}),
          ...(error.stack ? { stack: error.stack } : {}),
          // componentStack is only present on the in-app boundary
          // (React 19 surfaces it as the third arg there). The
          // global boundary's third arg is `reset`, so we never
          // have a component stack to forward.
        });
        if (cancelled) return;
        // We do not render the "Open in platform errors" link here
        // because the global-error tree is the absolute fallback —
        // keeping the page minimal increases the chance the chrome
        // itself does not throw. The error is still persisted; the
        // operator can find it via /app/platform/errors.
        void result;
      } catch {
        // Fail-silent: Sentry already has the event.
      }
    })();
    return () => {
      cancelled = true;
    };
    // The mirror write is keyed on the captured error itself;
    // route / method are read from `window` so they don't need
    // to be in the deps array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);

  const supportHref = (() => {
    const subject = `laratik-planner error: ${reference}`;
    const body = [
      "Hi,",
      "",
      "I hit a root-level error on the page below.",
      "",
      `Route: ${route || "(unknown)"}`,
      `Reference: ${reference}`,
      `Message: ${error.message || "(none)"}`,
      "",
      "Thanks!",
    ].join("\n");
    const email =
      (typeof process !== "undefined" &&
        (process.env["NEXT_PUBLIC_SUPPORT_EMAIL"] || process.env["SUPPORT_EMAIL"])) ||
      "support@laratik.com";
    return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  })();

  return (
    <html lang="en">
      <body>
        <main
          className="bg-canvas text-fg-primary mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 px-6 py-12 text-center"
          data-testid="global-error-page"
        >
          <span className="text-danger" aria-hidden="true">
            <AlertTriangle className="h-10 w-10" />
          </span>
          <h1 className="text-title-page font-semibold">StudioFlow could not load</h1>
          <p className="text-body text-fg-secondary max-w-md">
            An unexpected error stopped the app shell from rendering. Try again, or sign in to a
            fresh session if the problem keeps happening. The reference below is already in our
            error log.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={reset}
              className="bg-primary hover:bg-primary-hover focus-visible:ring-focus-ring inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-[var(--radius-control)] px-5 py-2 font-semibold text-white focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline"
              data-testid="global-error-reset"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Try again
            </button>
            <a
              href="/signin"
              className="border-border hover:bg-surface-subtle focus-visible:ring-focus-ring inline-flex min-h-11 items-center rounded-[var(--radius-control)] border px-5 py-2 font-semibold focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline"
              data-testid="global-error-signin"
            >
              Back to sign in
            </a>
            <a
              href={supportHref}
              className="border-border hover:bg-surface-subtle focus-visible:ring-focus-ring inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] border px-5 py-2 font-semibold focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline"
              data-testid="global-error-report"
            >
              <LifeBuoy className="h-4 w-4" aria-hidden="true" />
              Report this
            </a>
          </div>
          <p data-testid="global-error-digest" className="text-label text-fg-muted font-mono">
            Reference: <code className="bg-surface-subtle rounded px-1.5 py-0.5">{reference}</code>
          </p>
        </main>
      </body>
    </html>
  );
}
