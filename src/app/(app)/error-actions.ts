"use server";

import { headers } from "next/headers";
import { auth } from "@/lib/auth/config";
import {
  actorCanViewAppErrors,
  captureAppError,
  findLatestAppErrorByDigest,
} from "@/lib/observability/app-errors";

/**
 * Server actions for the (app) error boundary.
 *
 * The boundary itself is a client component (Next.js 16 requirement)
 * but it needs server-side work:
 *   1. Persist the error to the in-app mirror (`app_error_event`).
 *   2. Resolve the digest to the matching row id, so the "View in
 *      platform errors" deep-link can target the exact row instead of
 *      forcing the admin to search.
 *   3. Decide whether the current actor is allowed to see the
 *      platform-errors page.
 *
 * We coalesce all three into one server action so the client only
 * fires a single round-trip on mount. Each step has a defensive
 * fallback so a failure in one does not poison the others:
 *
 *   - `captureAppError` is fail-silent (it logs to the structured
 *     log on write failure and returns void).
 *   - `findLatestAppErrorByDigest` returns null on a DB miss / error.
 *   - `actorCanViewAppErrors` returns false for unauthenticated
 *     actors and on any internal failure.
 *
 * The `route` and `method` are read from the live request headers so
 * the row matches what the user actually saw (the client component
 * only has `window.location`, which can be stale after a redirect).
 */
export type RecordErrorBoundaryInput = {
  digest: string | undefined;
  route: string;
  method: string;
  source: "app.error" | "global.error" | "server_action";
  message: string;
  stack: string | undefined;
};

export type RecordErrorBoundaryResult = {
  /** True when the actor is a platform admin and can deep-link in. */
  canViewPlatformErrors: boolean;
  /** Resolved row id for the deep-link, or null. */
  matchedId: string | null;
  /** Echo of the recorded digest for client logging. */
  recordedDigest: string | null;
};

export async function recordErrorBoundaryAction(
  input: RecordErrorBoundaryInput,
): Promise<RecordErrorBoundaryResult> {
  const session = await auth();
  const actorId = session?.user?.id;

  // Live request route / method so the persisted row matches the
  // actual request, not window.location (which can lag one render
  // after a router push).
  const hdrs = await headers();
  const liveRoute = hdrs.get("x-pathname") ?? hdrs.get("x-invoke-path") ?? input.route;
  const liveMethod = hdrs.get("x-method") ?? input.method;

  // 1. Capture — fail-silent inside the helper.
  await captureAppError({
    digest: input.digest,
    route: liveRoute,
    method: liveMethod,
    source: input.source,
    // The client component only sent a sanitized summary; rebuild
    // an Error-shaped payload so the helper can extract a stack.
    error: { name: "AppRouterError", message: input.message, stack: input.stack },
    ...(actorId ? { actorId } : {}),
  });

  // 2 + 3 run in parallel — they don't depend on each other.
  const [matchedId, canViewPlatformErrors] = await Promise.all([
    input.digest ? findLatestAppErrorByDigest(input.digest) : Promise.resolve(null),
    actorCanViewAppErrors(actorId),
  ]);

  return {
    canViewPlatformErrors,
    matchedId,
    recordedDigest: input.digest ?? null,
  };
}
