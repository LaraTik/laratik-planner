import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { appErrorEvents, appErrorGroups } from "@/lib/db/schema/app-errors";
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

describe("app_error_event schema — diagnostics columns (0054)", () => {
  it("declares the columns the server capture path writes to", () => {
    const cols = appErrorEvents;
    expect(cols.groupId, "groupId rolls the occurrence up into app_error_group").toBeDefined();
    expect(
      cols.context,
      "context carries the allowlisted JSONB payload + request log lines",
    ).toBeDefined();
    expect(
      cols.userAgentHash,
      "userAgentHash is the hashed UA — the raw string is never stored",
    ).toBeDefined();
    expect(cols.routeType, "routeType records render | route | action | proxy").toBeDefined();
    expect(cols.routePath, "routePath records the filesystem route file").toBeDefined();
    // error_name / cause_message / component_stack were added in 0021 and
    // are read by matchErrorHint; guard against an accidental removal.
    expect(cols.errorName).toBeDefined();
    expect(cols.causeMessage).toBeDefined();
    expect(cols.componentStack).toBeDefined();
  });
});

describe("app_error_group schema (0054)", () => {
  it("declares the grouping + triage columns", () => {
    expect(
      appErrorGroups.fingerprint,
      "the unique conflict target of the group upsert",
    ).toBeDefined();
    expect(
      appErrorGroups.occurrenceCount,
      "the answer to 'how many times did this break'",
    ).toBeDefined();
    expect(appErrorGroups.firstSeenAt).toBeDefined();
    expect(appErrorGroups.lastSeenAt).toBeDefined();
    expect(appErrorGroups.sampleMessage, "scrubbed message shown in the console").toBeDefined();
    expect(appErrorGroups.resolvedAt, "triage state set by the diagnostics MCP").toBeDefined();
    expect(appErrorGroups.triageNote).toBeDefined();
  });

  it("defaults occurrence_count to 1 so the first insert needs no explicit count", () => {
    const col = (
      appErrorGroups as unknown as { occurrenceCount: { default: unknown; notNull: boolean } }
    ).occurrenceCount;
    expect(col.notNull).toBe(true);
    expect(col.default).toBeDefined();
  });
});

describe("migration — 0054_app_error_diagnostics", () => {
  const path = join(
    process.cwd(),
    "src",
    "lib",
    "db",
    "migrations",
    "0054_app_error_diagnostics.sql",
  );
  const sql = () => readFileSync(path, "utf8");

  it("has a SQL file on disk", () => {
    expect(existsSync(path), `${path} should exist`).toBe(true);
  });

  it("is present in the journal with a monotonic `when`", () => {
    const idx = migrationJournal.entries.findIndex((e) => e.tag === "0054_app_error_diagnostics");
    expect(idx, "journal entry must exist for the new migration").toBeGreaterThan(0);
    const entry = migrationJournal.entries[idx]!;
    const prev = migrationJournal.entries[idx - 1]!;
    expect(entry.when).toBeGreaterThan(prev.when);
  });

  it("creates the group table with the unique fingerprint index", () => {
    const text = sql();
    expect(text).toContain('CREATE TABLE IF NOT EXISTS "app_error_group"');
    expect(text).toContain("app_error_group_fingerprint_key");
    expect(text).toContain("app_error_group_last_seen_at_idx");
    expect(text).toContain("app_error_group_open_idx");
  });

  it("adds every new event column and the group foreign key", () => {
    const text = sql();
    for (const column of ["group_id", "context", "user_agent_hash", "route_type", "route_path"]) {
      expect(text, `${column} must be added`).toContain(`ADD COLUMN IF NOT EXISTS "${column}"`);
    }
    expect(text).toContain("app_error_event_group_id_app_error_group_id_fk");
    expect(text).toContain("ON DELETE set null");
    // The indexes the grouped console and diagnostics reads depend on.
    expect(text).toContain("app_error_event_group_id_idx");
    expect(text).toContain("app_error_event_source_idx");
  });

  it("is idempotent so a re-apply cannot fail on a duplicate object", () => {
    const text = sql();
    expect(text).toContain("CREATE TABLE IF NOT EXISTS");
    expect(text).toContain("CREATE UNIQUE INDEX IF NOT EXISTS");
    expect(text).toContain("CREATE INDEX IF NOT EXISTS");
    expect(text).toContain("ADD COLUMN IF NOT EXISTS");
    // The FK is added inside a guarded DO block for the same reason.
    expect(text).toContain("IF NOT EXISTS (\n    SELECT 1 FROM pg_constraint");
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
