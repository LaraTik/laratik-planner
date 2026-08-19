import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/validation/env";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

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

async function checkSchema(): Promise<"ready" | "missing" | "disabled"> {
  if (!serverEnv.DATABASE_URL) return "disabled";
  try {
    const result = await db.execute(
      sql`SELECT to_regclass('drizzle.__drizzle_migrations')::text AS migration_table`,
    );
    const rows = (result as unknown as { rows?: Array<{ migration_table: string | null }> }).rows;
    return rows?.[0]?.migration_table ? "ready" : "missing";
  } catch {
    return "missing";
  }
}

export async function GET() {
  const dbStatus = await checkDatabase();
  const schemaStatus = await checkSchema();
  const ok = dbStatus === "up" && schemaStatus === "ready";

  return NextResponse.json(
    {
      ok,
      version: process.env.APP_VERSION ?? process.env.npm_package_version ?? "unknown",
      env: serverEnv.NODE_ENV,
      db: dbStatus,
      schema: schemaStatus,
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
