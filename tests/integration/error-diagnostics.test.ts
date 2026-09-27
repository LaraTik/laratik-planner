import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { appErrorEvents, appErrorGroups } from "@/lib/db/schema";
import {
  __resetBurstLimiter,
  captureAppError,
  getAppErrorDiagnostics,
  getAppErrorHealth,
  listAppErrorGroups,
  pruneAppErrorRetention,
  rateLimitedOccurrenceCount,
  triageAppErrorGroup,
} from "@/lib/observability/app-errors";
import { runWithRequestContext } from "@/lib/observability/request-context";
import { logError } from "@/lib/observability/logger";

/**
 * End-to-end coverage for the OBS-002 error-capture pipeline against a
 * real Postgres (`planner_test`).
 *
 * These are the assertions the unit tests structurally *cannot* make:
 *
 *   1. Two **concurrent** captures of the same error produce
 *      `occurrence_count = 2` — the `INSERT … ON CONFLICT DO UPDATE` must
 *      not lose an increment the way a read-modify-write would.
 *   2. The burst cap keeps the occurrence count exact while bounding the
 *      number of event rows.
 *   3. The request log ring buffer round-trips into `context.logs`.
 *   4. Retention prunes events by age and groups by age **but only when
 *      resolved** — deleting an unresolved group would delete the triage
 *      queue.
 *   5. Scrubbed values are what actually land in the database.
 *
 * Runs only when `TEST_DATABASE_URL` is set, matching every other file in
 * this directory. Never point it at `planner` or production.
 */
const TEST_DB_URL = process.env.TEST_DATABASE_URL;
if (!TEST_DB_URL) throw new Error("TEST_DATABASE_URL is required for integration tests");

const pool = new Pool({ connectionString: TEST_DB_URL });
const db = drizzle(pool);

/** Every row this file creates, so cleanup can be surgical. */
const createdEventIds: string[] = [];
const createdFingerprints: string[] = [];

async function cleanup(): Promise<void> {
  if (createdEventIds.length > 0) {
    await db
      .delete(appErrorEvents)
      .where(
        sql`id = any(${sql.raw(`ARRAY[${createdEventIds.map((id) => `'${id}'::uuid`).join(",")}]`)})`,
      );
  }
  if (createdFingerprints.length > 0) {
    await db
      .delete(appErrorGroups)
      .where(
        sql`fingerprint = any(${sql.raw(`ARRAY[${createdFingerprints.map((f) => `'${f}'`)}]`)})`,
      );
  }
  createdEventIds.length = 0;
  createdFingerprints.length = 0;
}

/** Record the fingerprint a given error will hash to, for cleanup. */
async function track(route: string, error: unknown): Promise<void> {
  const { fingerprintFor } = await import("@/lib/observability/fingerprint");
  const { serializeError } = await import("@/lib/observability/redact");
  const serialized = serializeError(error);
  createdFingerprints.push(fingerprintFor(serialized.name, serialized.message, route));
}

/** Capture and remember the ids written, for cleanup. */
async function capture(
  input: Parameters<typeof captureAppError>[0],
  trackFingerprint = true,
): Promise<void> {
  if (trackFingerprint) await track(input.route, input.error);
  await captureAppError(input);
  const rows = await db
    .select({ id: appErrorEvents.id })
    .from(appErrorEvents)
    .orderBy(sql`${appErrorEvents.createdAt} desc`)
    .limit(1);
  if (rows[0]) createdEventIds.push(rows[0].id);
}

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "src/lib/db/migrations" });
}, 120_000);

afterAll(async () => {
  await cleanup();
  await pool.end();
});

beforeEach(async () => {
  // The burst limiter is process-local module state; each test starts
  // with a clean window so the cap assertions are deterministic.
  __resetBurstLimiter();
  delete process.env.APP_ERROR_BURST_LIMIT;
  await cleanup();
});

describe("captureAppError — grouping", () => {
  it("creates one group and links the occurrence to it", async () => {
    const error = new TypeError("cannot read properties of undefined (reading 'id')");
    await capture({
      route: "/api/tasks",
      method: "POST",
      source: "server.route",
      routeType: "route",
      routePath: "/api/tasks/route",
      error,
    });

    const [event] = await db.select().from(appErrorEvents).limit(1);
    expect(event?.groupId).toBeTruthy();
    const [group] = await db.select().from(appErrorGroups).limit(1);
    expect(group?.occurrenceCount).toBe(1);
    expect(group?.errorName).toBe("TypeError");
    expect(group?.sampleMessage).toContain("cannot read properties");
  });

  it("does not lose an increment under concurrency", async () => {
    const makeError = (id: string) => new Error(`workspace ${id} not found`);
    const ids = [randomUUID(), randomUUID()];
    for (const id of ids) {
      await track("/api/workspace", makeError(id));
    }

    // Two captures of the *same class* of error, fired concurrently. The
    // UUID in the message normalizes away, so both land on one fingerprint.
    await Promise.all(
      ids.map((id) =>
        captureAppError({
          route: "/api/workspace",
          method: "GET",
          source: "server.route",
          error: makeError(id),
        }),
      ),
    );

    const groups = await db.select().from(appErrorGroups);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.occurrenceCount).toBe(2);
    const events = await db.select().from(appErrorEvents);
    expect(events).toHaveLength(2);
    createdEventIds.push(...events.map((e) => e.id));
  });

  it("separates the same message on different routes", async () => {
    const error = () => new Error("boom");
    await track("/api/a", error());
    await capture({ route: "/api/a", method: "GET", source: "server.route", error: error() });
    await track("/api/b", error());
    await capture({ route: "/api/b", method: "GET", source: "server.route", error: error() });
    const groups = await db.select().from(appErrorGroups);
    expect(groups).toHaveLength(2);
  });

  it("persists the routeType and routePath from the server hook", async () => {
    const error = new Error("action blew up");
    await capture({
      route: "/app/w/[slug]/planning",
      method: "POST",
      source: "server_action",
      routeType: "action",
      routePath: "/app/w/[slug]/planning/actions.ts",
      error,
    });
    const [event] = await db.select().from(appErrorEvents).limit(1);
    expect(event?.routeType).toBe("action");
    expect(event?.routePath).toBe("/app/w/[slug]/planning/actions.ts");
    expect(event?.source).toBe("server_action");
  });
});

describe("captureAppError — scrubbing at rest", () => {
  it("stores a scrubbed message, not the raw secret", async () => {
    const error = new Error("upstream auth failed for Bearer sk-abcdefghij0123456789ABCDEF");
    await capture({
      route: "/api/ai",
      method: "POST",
      source: "server.route",
      error,
    });
    const [event] = await db.select().from(appErrorEvents).limit(1);
    expect(event?.message).not.toContain("sk-abcdefghij0123456789ABCDEF");
    expect(event?.message).toContain("[redacted]");
  });

  it("drops the Postgres DETAIL value but keeps the constraint name", async () => {
    const error = new Error(
      'duplicate key value violates unique constraint "users_email_key"\nDETAIL:  Key (email)=(alice@example.com) already exists.',
    );
    await capture({ route: "/api/users", method: "POST", source: "server.route", error });
    const [event] = await db.select().from(appErrorEvents).limit(1);
    expect(event?.message).toContain("users_email_key");
    expect(event?.message).not.toContain("alice@example.com");
  });

  it("stores the plain object the client boundary sends, with its message intact", async () => {
    // Regression guard for the pre-fix behaviour, where every
    // client-boundary row stored message "Unknown error" because the
    // helpers used `instanceof Error` on a plain object.
    const error = {
      name: "ZodError",
      message: "Invalid input: expected string, received number",
      stack: "ZodError: Invalid input\n    at parse (/app/src/lib/schemas.ts:88:20)",
      cause: { name: "Cause", message: 'column "updated_at" does not exist' },
    };
    await capture({ route: "/app/w/x", method: "GET", source: "app.error", error });
    const [event] = await db.select().from(appErrorEvents).limit(1);
    expect(event?.message).toBe("Invalid input: expected string, received number");
    expect(event?.errorName).toBe("ZodError");
    expect(event?.stack).toContain("at parse");
    expect(event?.causeMessage).toBe('column "updated_at" does not exist');
  });

  it("hashes the user agent rather than storing it", async () => {
    const error = new Error("ua test");
    await capture({
      route: "/app/w/x",
      method: "GET",
      source: "app.error",
      userAgent: "Mozilla/5.0 (fingerprintable)",
      error,
    });
    const [event] = await db.select().from(appErrorEvents).limit(1);
    expect(event?.userAgentHash).toMatch(/^[0-9a-f]{32}$/);
    expect(JSON.stringify(event)).not.toContain("fingerprintable");
  });
});

describe("captureAppError — request log ring buffer", () => {
  it("flushes the request's recent log lines into context.logs", async () => {
    const error = new Error("failed after a warning");
    await runWithRequestContext({ requestId: "req-ring" }, async () => {
      logError("content.update", { contentItemId: "c1" });
      logError("workspace.resolve", { slug: "acme" });
      await track("/api/tasks", error);
      await captureAppError({ route: "/api/tasks", method: "GET", source: "server.route", error });
    });

    const [event] = await db.select().from(appErrorEvents).limit(1);
    const context = event?.context as { logs?: Array<{ event: string; level: string }> } | null;
    expect(context?.logs).toBeTruthy();
    expect(context?.logs?.map((l) => l.event)).toEqual(["content.update", "workspace.resolve"]);
    expect(event?.requestId).toBe("req-ring");
  });

  it("omits the logs key outside a request scope", async () => {
    const error = new Error("no scope");
    await capture({ route: "/api/cron/x", method: "GET", source: "server.unhandled", error });
    const [event] = await db.select().from(appErrorEvents).limit(1);
    const context = (event?.context ?? {}) as { logs?: unknown };
    expect(context.logs).toBeUndefined();
  });
});

describe("captureAppError — burst cap", () => {
  it("keeps the occurrence count exact while bounding event rows", async () => {
    process.env.APP_ERROR_BURST_LIMIT = "5";
    const burst = 40;
    for (let i = 0; i < burst; i += 1) {
      await captureAppError({
        route: "/api/loop",
        method: "GET",
        source: "server.route",
        error: new Error("infinite loop detected"),
      });
    }

    const [group] = await db.select().from(appErrorGroups);
    expect(group?.occurrenceCount).toBe(burst);
    const events = await db.select().from(appErrorEvents);
    expect(events.length).toBeLessThanOrEqual(5);
    expect(rateLimitedOccurrenceCount()).toBe(burst - events.length);

    // The health surface reports the cap so a throttled system is visible.
    const health = await getAppErrorHealth();
    expect(health.cappedOccurrences).toBeGreaterThan(0);
    createdEventIds.push(...events.map((e) => e.id));
  });

  it("a limit of 0 suppresses every event row but still counts", async () => {
    process.env.APP_ERROR_BURST_LIMIT = "0";
    await captureAppError({
      route: "/api/silent",
      method: "GET",
      source: "server.route",
      error: new Error("never stored"),
    });
    const events = await db.select().from(appErrorEvents);
    expect(events).toHaveLength(0);
    const [group] = await db.select().from(appErrorGroups);
    expect(group?.occurrenceCount).toBe(1);
  });
});

describe("triage + diagnostics read path", () => {
  it("toggles triage state idempotently", async () => {
    const error = new Error("triage me");
    await capture({ route: "/api/triage", method: "GET", source: "server.route", error });
    const [group] = await db.select().from(appErrorGroups);
    const fingerprint = group!.fingerprint;

    const resolved = await triageAppErrorGroup({ fingerprint, action: "resolve", note: "known" });
    expect(resolved?.resolvedAt).toBeTruthy();
    expect(resolved?.triageNote).toBe("known");

    // Re-resolving is a no-op success, not an error.
    const again = await triageAppErrorGroup({ fingerprint, action: "resolve" });
    expect(again?.resolvedAt).toBeTruthy();

    const reopened = await triageAppErrorGroup({ fingerprint, action: "reopen" });
    expect(reopened?.resolvedAt).toBeNull();
  });

  it("returns null when triaging an unknown fingerprint", async () => {
    expect(
      await triageAppErrorGroup({ fingerprint: "ffffffffffff", action: "resolve" }),
    ).toBeNull();
  });

  it("aggregates occurrences, builds, and samples for a fingerprint", async () => {
    for (const id of ["a", "b", "c"]) {
      const error = new Error(`row ${id} violates the constraint`);
      await captureAppError({
        route: "/api/constraint",
        method: "POST",
        source: "server.route",
        error,
      });
    }
    const [group] = await db.select().from(appErrorGroups);
    const fingerprint = group!.fingerprint;

    const diagnostics = await getAppErrorDiagnostics(fingerprint);
    expect(diagnostics).toBeTruthy();
    expect(diagnostics?.group.occurrenceCount).toBe(3);
    expect(diagnostics?.routes).toContain("/api/constraint");
    expect(diagnostics?.sources).toContain("server.route");
    expect(diagnostics?.recent.length).toBeGreaterThan(0);
    expect(diagnostics?.hourly.length).toBeGreaterThan(0);
  });

  it("returns null diagnostics for an unknown fingerprint", async () => {
    expect(await getAppErrorDiagnostics("ffffffffffff")).toBeNull();
  });

  it("lists groups and filters by triage state", async () => {
    await capture({
      route: "/api/one",
      method: "GET",
      source: "server.route",
      error: new Error("group one"),
    });
    await capture({
      route: "/api/two",
      method: "GET",
      source: "server.route",
      error: new Error("group two"),
    });
    const [first] = await db.select().from(appErrorGroups).orderBy(appErrorGroups.route);
    await triageAppErrorGroup({ fingerprint: first!.fingerprint, action: "resolve" });

    const open = await listAppErrorGroups({ limit: 10, resolved: false });
    const closed = await listAppErrorGroups({ limit: 10, resolved: true });
    expect(open).toHaveLength(1);
    expect(closed).toHaveLength(1);
  });

  it("an empty groupIds set matches nothing rather than everything", async () => {
    await capture({
      route: "/api/three",
      method: "GET",
      source: "server.route",
      error: new Error("group three"),
    });
    expect(await listAppErrorGroups({ limit: 10, groupIds: [] })).toHaveLength(0);
  });
});

describe("pruneAppErrorRetention", () => {
  it("deletes aged events but keeps aged unresolved groups", async () => {
    await capture({
      route: "/api/old",
      method: "GET",
      source: "server.route",
      error: new Error("aged failure"),
    });
    // Backdate both rows past the retention horizon.
    await db.execute(sql`update app_error_event set created_at = now() - interval '60 days'`);
    await db.execute(sql`update app_error_group set last_seen_at = now() - interval '120 days'`);

    const result = await pruneAppErrorRetention({ eventDays: 30, groupDays: 90 });
    expect(result.eventsDeleted).toBeGreaterThan(0);
    // Unresolved → kept, even though it is far past the group horizon.
    expect(result.groupsDeleted).toBe(0);
    const remaining = await db.select().from(appErrorGroups);
    expect(remaining.length).toBeGreaterThan(0);
  });

  it("deletes aged groups once they are resolved", async () => {
    await capture({
      route: "/api/resolved-old",
      method: "GET",
      source: "server.route",
      error: new Error("resolved and aged"),
    });
    const [group] = await db.select().from(appErrorGroups);
    await triageAppErrorGroup({ fingerprint: group!.fingerprint, action: "resolve" });
    await db.execute(sql`update app_error_group set last_seen_at = now() - interval '120 days'`);

    const result = await pruneAppErrorRetention({ eventDays: 30, groupDays: 90 });
    expect(result.groupsDeleted).toBeGreaterThan(0);
  });

  it("is idempotent — a second run deletes nothing new", async () => {
    await capture({
      route: "/api/idem",
      method: "GET",
      source: "server.route",
      error: new Error("idempotence check"),
    });
    const first = await pruneAppErrorRetention();
    const second = await pruneAppErrorRetention();
    expect(second.eventsDeleted).toBe(0);
    expect(second.groupsDeleted).toBe(0);
    expect(first.eventsDeleted).toBeGreaterThanOrEqual(0);
  });
});

describe("getAppErrorHealth", () => {
  it("reports reachability, build, and error counts", async () => {
    await capture({
      route: "/api/health-probe",
      method: "GET",
      source: "server.route",
      error: new Error("health probe error"),
    });
    const health = await getAppErrorHealth();
    expect(health.ok).toBe(true);
    expect(health.db).toBe("reachable");
    expect(health.lastHour).toBeGreaterThan(0);
    expect(health.last24h).toBeGreaterThanOrEqual(health.lastHour);
    expect(health.topGroups.length).toBeGreaterThan(0);
  });
});
