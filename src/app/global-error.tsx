"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

/**
 * Root-layout failure boundary required by Next.js and Sentry. This
 * page ONLY renders when the root layout itself throws — the regular
 * `/app/error.tsx` handles every other unhandled error in the
 * (app) tree. The Try-again button resets the boundary; the sign-in
 * link is the always-reachable escape hatch when the app shell is
 * itself broken.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 px-6 text-center">
          <h1 className="text-2xl font-semibold">StudioFlow could not load</h1>
          <p>Please try again. If the problem continues, share the reference below with support.</p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={reset}
              className="min-h-11 cursor-pointer rounded-lg bg-[#3525cd] px-5 py-2 font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              Try again
            </button>
            <a
              href="/signin"
              className="min-h-11 rounded-lg border border-current/30 px-5 py-2 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              Back to sign in
            </a>
          </div>
          {error.digest ? (
            <p data-testid="global-error-digest" className="font-mono text-sm">
              Reference: {error.digest}
            </p>
          ) : null}
        </main>
      </body>
    </html>
  );
}
