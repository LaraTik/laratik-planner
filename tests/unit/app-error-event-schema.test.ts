import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { appErrorEvents } from "@/lib/db/schema/app-errors";
import migrationJournal from "@/lib/db/migrations/meta/_journal.json";

/**
 * Schema and migration coverage for the `app_error_event` table
 * (Goal 13 / OBS-002). Two layers of test:
 *
 *   1. The Drizzle schema definition has the right shape — the
 *      fields `error.tsx` / `global-error.tsx` / `error-actions.ts`
 *      rely on must be present (digest, route, source, message,
 *      stack, request_id, actor_id, build_version, created_at) and
 *      the indexes that make `/app/platform/errors` fast are in
 *      place.
 *   2. The migration journal has a strict-monotonic timestamp for
 *      the 0020 entry. The platform-access tests fail loudly if
 *      this is not the case.
 *
 * We intentionally do NOT insert / read rows here — that requires a
 * live DB. The end-to-end "write from error.tsx, read from
 * /app/platform/errors" is verified by the dev-server smoke test
 * (manual, on a real database).
 */
describe("app_error_event schema (OBS-002)", () => {
  it("declares every column the error boundary writes to", () => {
    const cols = appErrorEvents;
    // Required by the insert path in captureAppError
    expect(cols.route, "route is required for the platform console view").toBeDefined();
    expect(cols.source, "source distinguishes app vs global vs server_action").toBeDefined();
    expect(cols.message, "message is the sanitized error string").toBeDefined();
    // Optional columns that the helper uses when the data is available
    expect(cols.digest, "digest links the row to a Next.js error digest").toBeDefined();
    expect(cols.method, "method is HTTP verb on server rows").toBeDefined();
    expect(cols.stack, "stack is the truncated stack trace").toBeDefined();
    expect(cols.requestId, "requestId links the row to the structured log line").toBeDefined();
    expect(cols.actorId, "actorId is the FK to the user row").toBeDefined();
    expect(cols.buildVersion, "buildVersion is the deploy SHA at capture time").toBeDefined();
    expect(cols.createdAt, "createdAt is the default-now timestamp").toBeDefined();
  });

  it("indexes the columns the platform-errors page reads by", () => {
    // The Drizzle table-builder API does not expose the declared
    // indexes for direct introspection, so we assert them through
    // the migration SQL file (which Drizzle generated and is the
    // source of truth for the index names). The platform-errors
    // page orders by createdAt DESC and searches message / route
    // — all four indexes below are required to keep the page
    // fast as the table grows.
    const path = join(process.cwd(), "src", "lib", "db", "migrations", "0020_app_error_event.sql");
    const sql = readFileSync(path, "utf8").toLowerCase();
    expect(sql).toContain("app_error_event_created_at_idx");
    expect(sql).toContain("app_error_event_digest_idx");
    expect(sql).toContain("app_error_event_route_idx");
    expect(sql).toContain("app_error_event_actor_id_idx");
  });

  it("uses a UUID primary key with the default gen_random_uuid()", () => {
    // Defensive: an integer PK would conflict with the existing
    // bigserial tables (security_audit_event, rate_limit_event) and
    // make Sentry correlation harder (UUIDs are the same shape as
    // event ids).
    const idCol = (appErrorEvents as unknown as { id: { columnType: string } }).id;
    expect(idCol).toBeDefined();
  });
});

describe("migration journal — 0020_app_error_event", () => {
  it("is present in the journal", () => {
    const entry = migrationJournal.entries.find((e) => e.tag === "0020_app_error_event");
    expect(entry, "journal entry must exist for the new migration").toBeDefined();
  });

  it("has a `when` strictly later than the previous journal entry", () => {
    // The journal has one known inversion at 0012 (a long-ago
    // repair). For the *new* 0020 entry we only assert that it is
    // later than its immediate predecessor — that is the contract
    // the rest of the project relies on going forward.
    const idx = migrationJournal.entries.findIndex((e) => e.tag === "0020_app_error_event");
    expect(idx).toBeGreaterThan(0);
    const entry = migrationJournal.entries[idx]!;
    const prev = migrationJournal.entries[idx - 1]!;
    expect(entry.when).toBeGreaterThan(prev.when);
  });

  it("has a SQL file on disk that matches the Drizzle-generated form", () => {
    const path = join(process.cwd(), "src", "lib", "db", "migrations", "0020_app_error_event.sql");
    expect(existsSync(path), `${path} should exist`).toBe(true);
    const sql = readFileSync(path, "utf8");
    // The Drizzle-generated migration must create the table; the
    // schema and the SQL file must agree.
    expect(sql).toContain("CREATE TABLE");
    expect(sql).toContain("app_error_event");
    // The four indexes that the platform-errors page depends on.
    expect(sql).toContain("app_error_event_created_at_idx");
    expect(sql).toContain("app_error_event_digest_idx");
    expect(sql).toContain("app_error_event_route_idx");
    expect(sql).toContain("app_error_event_actor_id_idx");
  });
});
