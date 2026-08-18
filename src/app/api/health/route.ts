import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/validation/env";
import { db } from "@/lib/db";

/**
 * GET /api/health
 *
 * Returns a non-sensitive JSON object with:
 *  - ok:        boolean (overall)
 *  - version:   package.json version
 *  - env:       "development" | "production" | "test"
 *  - db:        "up" | "down" | "disabled"
 *  - uptime:    seconds since process start
 *  - timestamp: ISO 8601 UTC
 *
 * NEVER include secrets, tokens, or full env vars. This endpoint is public
 * (Traefik will hit it for health checks) — anything here is observable.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const startedAt = Date.now();

async function checkDatabase(): Promise<"up" | "down" | "disabled"> {
  if (!serverEnv.DATABASE_URL) return "disabled";
  try {
    await db.execute("select 1");
    return "up";
  } catch {
    return "down";
  }
}

export async function GET() {
  const dbStatus = await checkDatabase();
  const ok = dbStatus === "up" || dbStatus === "disabled";

  return NextResponse.json(
    {
      ok,
      version: process.env.npm_package_version ?? "0.0.0",
      env: serverEnv.NODE_ENV,
      db: dbStatus,
      uptime: Math.floor((Date.now() - startedAt) / 1000),
      timestamp: new Date().toISOString(),
    },
    {
      status: ok ? 200 : 503,
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}
