"use client";

import * as React from "react";
import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import {
  AlertTriangle,
  Check,
  ClipboardList,
  Copy,
  ExternalLink,
  LifeBuoy,
  RotateCcw,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/feedback/empty-state";
import { recordErrorBoundaryAction } from "./error-actions";
import { cn } from "@/lib/utils";

/**
 * Error boundary for the authenticated app shell.
 *
 * Two responsibilities, in order:
 *
 *   1. **Tell the user what happened and what to do next.** The page
 *      shows the Next.js error digest, the route, and a one-click
 *      "Copy reference" so support can locate the failure in
 *      Sentry / `/app/platform/errors` without the user having to
 *      type a 10-digit id off the screen. Recovery actions
 *      (Try again, Back to My Work, Sign out) are right there.
 *
 *   2. **Persist the event to the in-app mirror.** On mount we fire
 *      `recordErrorBoundaryAction`, which writes the row to
 *      `app_error_event` and resolves the matching row id so the
 *      "Open in platform errors" deep-link can target the exact
 *      row. The link is only shown when the actor is a platform
 *      admin (the server action returns the boolean; we do not
 *      need a separate permission round-trip).
 *
 * The action is fire-and-forget; the page renders fully without
 * waiting for it. A failed capture does not block the user — the
 * structured log + Sentry already captured the event.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [copied, setCopied] = React.useState<"digest" | "url" | null>(null);
  const [platformLink, setPlatformLink] = React.useState<{
    href: string;
    label: string;
  } | null>(null);

  const route = typeof window !== "undefined" ? window.location.pathname : "";
  const method = "GET";
  const reference = error.digest ?? "no-digest";

  // Sentry + mirror capture on mount / digest change.
  React.useEffect(() => {
    Sentry.captureException(error);
    let cancelled = false;
    void (async () => {
      try {
        const result = await recordErrorBoundaryAction({
          digest: error.digest,
          route: route || "(unknown)",
          method,
          source: "app.error",
          message: error.message || error.name || "Unknown error",
          stack: error.stack,
        });
        if (cancelled) return;
        if (result.canViewPlatformErrors) {
          const href = result.matchedId
            ? `/app/platform/errors?focus=${encodeURIComponent(result.matchedId)}`
            : "/app/platform/errors";
          setPlatformLink({ href, label: "Open in platform errors" });
        }
      } catch {
        // Fail-silent on the capture path. The structured log + Sentry
        // already have the event; the mirror is best-effort.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [error, route, method]);

  const copyToClipboard = React.useCallback(async (text: string, which: "digest" | "url") => {
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback for environments without async clipboard (e.g. some test runners).
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(which);
      window.setTimeout(() => setCopied((cur) => (cur === which ? null : cur)), 2000);
    } catch {
      // The user can still read the text and copy it manually.
    }
  }, []);

  const supportHref = buildSupportHref({
    route,
    reference,
    errorMessage: error.message,
  });

  return (
    <div
      className="mx-auto w-full max-w-3xl space-y-4 px-4 py-8 sm:py-12"
      data-testid="app-error-page"
    >
      <Card padding="lg" data-testid="app-error-summary">
        <div className="flex items-start gap-3">
          <span className="text-danger mt-0.5" aria-hidden="true">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <CardTitle>We hit a snag</CardTitle>
            <CardDescription>
              An unexpected error stopped this page from rendering. We&apos;ve logged the event; the
              buttons below help you recover or report it.
            </CardDescription>
          </div>
        </div>
      </Card>

      <Card padding="none" data-testid="app-error-details">
        <dl className="divide-border text-body divide-y">
          <DetailRow label="Reference">
            <div className="flex items-center gap-2">
              <code
                data-testid="app-error-digest"
                className="text-fg-primary bg-surface-subtle rounded px-1.5 py-0.5 font-mono"
              >
                {reference}
              </code>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void copyToClipboard(reference, "digest")}
                aria-label={copied === "digest" ? "Reference copied" : "Copy reference"}
                data-testid="app-error-copy-digest"
              >
                {copied === "digest" ? (
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {copied === "digest" ? "Copied" : "Copy"}
              </Button>
            </div>
          </DetailRow>
          <DetailRow label="Route">
            <code
              data-testid="app-error-route"
              className="text-fg-primary bg-surface-subtle rounded px-1.5 py-0.5 font-mono"
            >
              {route || "(unknown)"}
            </code>
          </DetailRow>
          {error.message ? (
            <DetailRow label="Message">
              <p data-testid="app-error-message" className="text-fg-secondary break-words">
                {error.message}
              </p>
            </DetailRow>
          ) : null}
        </dl>
      </Card>

      <div className="flex flex-wrap items-center gap-2" data-testid="app-error-actions">
        <Button onClick={reset} variant="default">
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Try again
        </Button>
        <Button asChild variant="secondary">
          <Link href="/app">Back to My Work</Link>
        </Button>
        <Button asChild variant="ghost">
          <Link href="/api/auth/signout">Sign out</Link>
        </Button>
        <a
          href={supportHref}
          className={cn(buttonVariants({ variant: "outline" }))}
          data-testid="app-error-report"
        >
          <LifeBuoy className="h-4 w-4" aria-hidden="true" />
          Report this
        </a>
        {platformLink ? (
          <Button asChild variant="outline" data-testid="app-error-platform-link">
            <Link href={platformLink.href}>
              <ClipboardList className="h-4 w-4" aria-hidden="true" />
              {platformLink.label}
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </Button>
        ) : null}
      </div>

      <EmptyState
        icon={<AlertTriangle className="h-6 w-6" />}
        title="Need to share this with support?"
        description={`Quote the reference above so we can find the matching event in our error log. The page also records a request id; the support team can correlate the two if you share both.`}
      />
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-[10rem_1fr] sm:items-center sm:gap-4">
      <dt className="text-label text-fg-secondary font-semibold tracking-wide uppercase">
        {label}
      </dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

function buildSupportHref({
  route,
  reference,
  errorMessage,
}: {
  route: string;
  reference: string;
  errorMessage: string;
}): string {
  const subject = `laratik-planner error: ${reference}`;
  const body = [
    "Hi,",
    "",
    "I hit an error on the page below. The reference is already in our error log; this email is so the team has the human context.",
    "",
    `Route: ${route || "(unknown)"}`,
    `Reference: ${reference}`,
    `Message: ${errorMessage || "(none)"}`,
    "",
    "Steps I took right before the error:",
    "1. ",
    "2. ",
    "",
    "What I expected to happen:",
    "",
    "Thanks!",
  ].join("\n");
  // SUPPORT_EMAIL is server-side only; the default fallback is
  // hard-coded in env.ts so the page never 500s on a missing env.
  // Client components can't read serverEnv directly, so the
  // address is read from a NEXT_PUBLIC_ mirror at runtime — if
  // it is absent the mailto falls back to a generic address.
  const email =
    (typeof process !== "undefined" &&
      (process.env["NEXT_PUBLIC_SUPPORT_EMAIL"] || process.env["SUPPORT_EMAIL"])) ||
    "support@laratik.com";
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
