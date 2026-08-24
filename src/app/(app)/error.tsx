"use client";

import * as React from "react";
import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/feedback/empty-state";
import { AlertTriangle } from "lucide-react";

/**
 * Error boundary for the authenticated app shell.
 * Keep the chrome visible (sidebar/topbar) so the user has a way out
 * even if a single page errors.
 */
export default function AppError({
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
        title="We hit an error rendering this page"
        description="Try again, or head back to My Work. The error has been logged."
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
