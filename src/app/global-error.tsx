"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

/** Root-layout failure boundary required by Next.js and Sentry. */
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
          <button
            type="button"
            onClick={reset}
            className="min-h-11 cursor-pointer rounded-lg bg-[#3525cd] px-5 py-2 font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Try again
          </button>
          {error.digest ? <p>Reference: {error.digest}</p> : null}
        </main>
      </body>
    </html>
  );
}
