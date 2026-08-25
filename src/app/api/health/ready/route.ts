import { writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/validation/env";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { createBuildInfo } from "@/lib/build-info";
import migrationJournal from "@/lib/db/migrations/meta/_journal.json";

/**
 * GET /api/health/ready
 *
 * Readiness probe. Returns 200 only if the process is up AND the database
 * is reachable, the deployment-critical schema exists, and the recorded
 * migration suffix matches the bundled journal. Older installations were
 * baselined before the Drizzle ledger existed, so an absent historical
 * prefix is valid; gaps within the recorded suffix are not.
 *
 * Used by:
 *   - Traefik upstream probe (loadbalancer.server.url points here in
 *     docker-compose.yml, so Traefik only routes traffic once the app
 *     is actually ready to serve it).
 *   - VPS deploy gate (`scripts/vps/health-check.sh`) and the cron
 *     watchdog.
 *   - Manual `curl http://planner.laratik.com/api/health/ready` smoke
 *     checks.
 *
 * Why a separate endpoint from /api/health/live:
 *   - Liveness = "process is up" (used to decide whether to restart).
 *   - Readiness = "process can serve traffic" (used to decide whether
 *     to route traffic). They mean different things and must use
 *     different signals — see the Kubernetes / 12-factor pattern.
 *
 * NEVER include secrets, tokens, or full env vars. This endpoint is
 * public (Traefik hits it without auth) — anything here is observable.
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

// Resolve at call time, not at module load. The test suite sets
// `process.env["UPLOADS_DIR"]` from a `vi.mock`/`vi.hoisted` block;
// on some worker runtimes (CI on Linux) the route module is
// evaluated before the test's env assignment runs, so a module-load
// read here would fall back to `/data/uploads` and the probe write
// would ENOENT — turning the "all green" readiness test into a 503.
const DEFAULT_UPLOADS_DIR = "/data/uploads";

/**
 * Storage health check. Writes a 1-byte probe file under UPLOADS_DIR
 * and removes it on success. Touches the disk to surface a
 * permission / disk-full condition early — a readiness check that
 * only checks the DB misses the second-most-common outage vector
 * (disk full on the upload volume).
 */
async function checkStorage(): Promise<"up" | "down" | "disabled"> {
  if (!serverEnv.DATABASE_URL) return "disabled";
  const uploadsDir = process.env["UPLOADS_DIR"] || DEFAULT_UPLOADS_DIR;
  try {
    const probePath = join(uploadsDir, `.health-probe-${randomBytes(4).toString("hex")}`);
    await writeFile(probePath, "1", { flag: "wx" });
    await unlink(probePath);
    return "up";
  } catch {
    return "down";
  }
}

/**
 * Rate-limit storage round-trip. Mirrors what `enforceRateLimit` does
 * on the hot path so a slow or failing rate-limit table shows up
 * here, not as silent 500s on the routes that depend on it. Uses raw
 * SQL so the existing health-test mock (which intercepts
 * `db.execute`) covers this check without needing a query-builder
 * mock.
 */
async function checkRateLimitStorage(): Promise<"up" | "down" | "disabled"> {
  if (!serverEnv.DATABASE_URL) return "disabled";
  try {
    await db.execute(sql`
      INSERT INTO "rate_limit_event" ("scope", "subject_hash", "occurred_at")
      VALUES ('health_probe', '00000000000000000000000000000000', now())
    `);
    const result = await db.execute(sql`
      SELECT count(*)::int AS count
      FROM "rate_limit_event"
      WHERE "occurred_at" >= now() - interval '60 seconds'
    `);
    // Best-effort prune of the probe row so the table doesn't
    // accumulate noise; failure here is non-fatal.
    await db.execute(sql`
      DELETE FROM "rate_limit_event"
      WHERE "scope" = 'health_probe'
        AND "subject_hash" = '00000000000000000000000000000000'
    `);
    const rows = (result as unknown as { rows?: Array<{ count: number }> }).rows;
    return rows?.[0]?.count !== undefined ? "up" : "down";
  } catch {
    return "down";
  }
}

async function checkSchema(): Promise<"ready" | "missing" | "disabled"> {
  if (!serverEnv.DATABASE_URL) return "disabled";
  try {
    const result = await db.execute(
      sql`
        SELECT
          to_regclass('drizzle.__drizzle_migrations')::text AS migration_table,
          COALESCE(
            array_agg(created_at::text ORDER BY created_at),
            ARRAY[]::text[]
          ) AS applied_migration_timestamps,
          to_regclass('public.support_access_request') IS NOT NULL
            AND to_regclass('public.support_access_grant') IS NOT NULL
            AND to_regclass('public.support_access_audit') IS NOT NULL
            AND to_regclass('public.ai_daily_budget_usage') IS NOT NULL
            AS required_schema_present
        FROM drizzle.__drizzle_migrations
      `,
    );
    const rows = (
      result as unknown as {
        rows?: Array<{
          migration_table: string | null;
          applied_migration_timestamps: string[];
          required_schema_present: boolean;
        }>;
      }
    ).rows;
    const row = rows?.[0];
    if (!row?.migration_table || !row.required_schema_present) return "missing";

    const expectedEntries = migrationJournal.entries;
    const applied = [...row.applied_migration_timestamps].sort();

    // An out-of-order journal timestamp can be skipped by Drizzle when it is
    // merged after newer migrations. Such entries must always be present even
    // when the installation has a legitimate pre-ledger baseline prefix.
    const reorderedTimestamps = expectedEntries
      .filter((entry, index) => index > 0 && entry.when <= expectedEntries[index - 1]!.when)
      .map((entry) => String(entry.when));
    const normalApplied = applied.filter((timestamp) => !reorderedTimestamps.includes(timestamp));
    const earliestNormalApplied = normalApplied[0];
    if (!earliestNormalApplied) return "missing";

    const expectedSuffix = expectedEntries
      .filter(
        (entry) =>
          reorderedTimestamps.includes(String(entry.when)) ||
          String(entry.when) >= earliestNormalApplied,
      )
      .map((entry) => String(entry.when))
      .sort();
    const suffixComplete =
      applied.length === expectedSuffix.length &&
      applied.every((timestamp, index) => timestamp === expectedSuffix[index]);
    const reorderedComplete = reorderedTimestamps.every((timestamp) => applied.includes(timestamp));
    const complete = suffixComplete && reorderedComplete;
    return complete ? "ready" : "missing";
  } catch {
    return "missing";
  }
}

export async function GET() {
  const dbStatus = await checkDatabase();
  const schemaStatus = await checkSchema();
  const storageStatus = await checkStorage();
  const rateLimitStatus = await checkRateLimitStorage();
  const ok =
    dbStatus === "up" &&
    schemaStatus === "ready" &&
    (storageStatus === "up" || storageStatus === "disabled") &&
    (rateLimitStatus === "up" || rateLimitStatus === "disabled");
  const buildInfo = createBuildInfo({
    version: serverEnv.APP_VERSION,
    environment: serverEnv.NODE_ENV,
  });

  return NextResponse.json(
    {
      ok,
      // Use the short SHA (7 chars) — enough to correlate with the
      // public commit history without exposing the full deploy
      // identity on a public, unauthenticated endpoint. The full
      // SHA is reserved for the authenticated ApplicationInfoCard.
      version: buildInfo.shortSha ?? buildInfo.displayLabel,
      env: serverEnv.NODE_ENV,
      db: dbStatus,
      schema: schemaStatus,
      storage: storageStatus,
      rateLimit: rateLimitStatus,
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
