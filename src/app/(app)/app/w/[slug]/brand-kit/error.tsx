"use client";

import * as React from "react";
import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/feedback/empty-state";
import { AlertTriangle } from "lucide-react";

/**
 * Per-route error boundary for /app/w/[slug]/brand-kit/*.
 *
 * Re-uses the (app) error UI (Try again, Back to My Work, sign out)
 * and adds a section-specific "Back to Brand Kit" link so a user
 * mid-edit on a logo or voice rule can return to the brand kit
 * summary without going all the way back to /app. Captures to
 * Sentry with the `section: brand-kit` tag so the on-call view can
 * group these errors by surface.
 */
export default function BrandKitError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const params = useParams<{ slug: string }>();
  const brandKitHref = params?.slug ? `/app/w/${params.slug}/brand-kit` : "/app";

  React.useEffect(() => {
    Sentry.captureException(error, { tags: { section: "brand-kit" } });
  }, [error]);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-12">
      <EmptyState
        icon={<AlertTriangle className="h-10 w-10" aria-hidden="true" />}
        title="We hit an error rendering Brand Kit"
        description="Try again, or head back to the Brand Kit summary. The error has been logged — share the reference below with support if it keeps happening."
        action={
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button onClick={reset} variant="default">
              Try again
            </Button>
            <Button asChild variant="secondary">
              <Link href={brandKitHref}>Back to Brand Kit</Link>
            </Button>
            <Button asChild variant="ghost">
              <Link href="/app">Back to My Work</Link>
            </Button>
          </div>
        }
      />
      {error.digest ? (
        <p
          data-testid="brand-kit-error-digest"
          className="text-label text-fg-muted mt-4 text-center"
        >
          Reference:{" "}
          <code className="bg-surface-subtle rounded px-1.5 py-0.5 font-mono">{error.digest}</code>
        </p>
      ) : null}
    </div>
  );
}
