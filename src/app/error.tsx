"use client";

import * as React from "react";
import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/feedback/empty-state";
import { AlertTriangle } from "lucide-react";

/**
 * Top-level error boundary (Next.js 13+ App Router).
 *
 * The framework calls this when a server component throws. We surface
 * a "Try again" button (resets the error boundary) plus escape hatches
 * to /signin (always reachable, even when /app is the broken page) and
 * /app (the user's normal destination). The full error is logged
 * server-side by Next.js already; we don't expose the message to the
 * user. The reference id is the Next.js error digest — distinct from
 * the support ref the form action in /signin mints, so a user might
 * quote either. Including both is overkill; we render the digest here
 * and the form-action ref on /signin.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-12">
      <EmptyState
        icon={<AlertTriangle className="h-10 w-10" aria-hidden="true" />}
        title="Something went wrong"
        description="We hit an unexpected error rendering this page. Please try again — if the problem keeps happening, share the reference below with support."
        action={
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button onClick={reset} variant="default">
              Try again
            </Button>
            <Button asChild variant="secondary">
              <Link href="/signin">Back to sign in</Link>
            </Button>
            <Button asChild variant="ghost">
              <Link href="/app">Go to My Work</Link>
            </Button>
          </div>
        }
      />
      {error.digest ? (
        <p data-testid="error-digest" className="text-label text-fg-muted mt-4 text-center">
          Reference:{" "}
          <code className="bg-surface-subtle rounded px-1.5 py-0.5 font-mono">{error.digest}</code>
        </p>
      ) : null}
    </div>
  );
}
