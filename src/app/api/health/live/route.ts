import { NextResponse } from "next/server";

/**
 * GET /api/health/live
 *
 * Liveness probe. Returns 200 as long as the Node.js process is up and the
 * Next.js request handler can run. Does NOT check the database, the schema,
 * or any external dependency.
 *
 * Why a separate endpoint:
 *   - Docker `HEALTHCHECK` uses this URL. A transient DB hiccup should not
 *     cause `autoheal` to restart the container (that just churns the
 *     process and makes the outage worse). Only a real process-level crash
 *     should restart the container.
 *   - The CI smoke loop uses this URL for the same reason — a failed DB
 *     query should not be reported as "the app did not start".
 *   - Readiness (DB + schema check) lives at /api/health/ready, used by
 *     Traefik's `loadbalancer.server.url` and the deploy gate.
 *
 * Response is intentionally minimal and cacheable for 1s so the Docker
 * HEALTHCHECK (interval=30s) is cheap.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  return NextResponse.json(
    { status: "ok" },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}
