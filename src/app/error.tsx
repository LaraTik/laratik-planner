"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/feedback/empty-state";
import { AlertTriangle } from "lucide-react";

/**
 * Top-level error boundary (Next.js 13+ App Router).
 *
 * The framework calls this when a server component throws. We surface
 * a "Try again" button (resets the error boundary) plus a link back
 * to the dashboard. The full error is logged server-side by Next.js
 * already; we don't expose the message to the user.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    // Keep the console output for devs in dev; in prod, this is the
    // canonical place to ship the error to Sentry once the wrapper is
    // wired (Goal 13).
    console.error("[app/error.tsx]", error);
  }, [error]);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-12">
      <EmptyState
        icon={<AlertTriangle className="h-10 w-10" aria-hidden="true" />}
        title="Something went wrong"
        description="We hit an unexpected error rendering this page. Please try again — if the problem keeps happening, drop us a note."
        action={
          <div className="flex items-center gap-2">
            <Button onClick={reset} variant="default">
              Try again
            </Button>
            <Button asChild variant="secondary">
              <Link href="/app">Back to My Work</Link>
            </Button>
          </div>
        }
      />
      {error.digest ? (
        <p className="text-label text-fg-muted mt-4 text-center">
          Reference: <code className="bg-surface-subtle rounded px-1.5 py-0.5">{error.digest}</code>
        </p>
      ) : null}
    </div>
  );
}
