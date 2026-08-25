/**
 * Tests for the health probe endpoints.
 *
 * Contract:
 *   - /api/health/live  must always return 200 with { status: "ok" }.
 *     This is the liveness probe used by Docker HEALTHCHECK and the
 *     CI smoke loop. It must NOT depend on the database.
 *   - /api/health/ready returns 200 only if DB is up AND schema is
 *     migrated. Returns 503 otherwise. Used by Traefik upstream probe
 *     and the VPS deploy gate.
 *   - /api/health is a backwards-compat alias of /api/health/ready
 *     so existing call sites (Traefik loadbalancer.server.url, the
 *     VPS health-check.sh) keep working without change.
 *
 * The liveness test is straightforward — it does not touch the DB. The
 * readiness test mocks `@/lib/db` so we can exercise both the "up"
 * and "down" branches without a real Postgres.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import migrationJournal from "@/lib/db/migrations/meta/_journal.json";

// Create a real temp directory so the storage health-check can
// write + remove its probe file. /data/uploads doesn't exist in
// the test environment, but a tmpdir is always writable.
const TMP_UPLOADS = mkdtempSync(join(tmpdir(), "health-probe-"));
process.env["UPLOADS_DIR"] = TMP_UPLOADS;

// Mock the DB module so /api/health/ready can be tested without a
// real database. We control the return values per test.
const mockExecute = vi.fn();
vi.mock("@/lib/db", () => ({
  db: { execute: mockExecute },
}));

// The env module reads process.env at import time and runs Zod
// validation. We give it the bare minimum so serverEnv is hydrated.
vi.mock("@/lib/validation/env", () => ({
  serverEnv: {
    APP_VERSION: "a1b2c3d4e5f678901234567890abcdef12345678",
    DATABASE_URL: "postgresql://x:y@localhost:5432/test",
    NODE_ENV: "test",
  },
}));

describe("GET /api/health/live", () => {
  beforeEach(() => {
    mockExecute.mockReset();
  });

  it("returns 200 with { status: 'ok' } and does not touch the database", async () => {
    const { GET } = await import("@/app/api/health/live/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: "ok" });
    expect(mockExecute).not.toHaveBeenCalled();
  });
});

describe("GET /api/health/ready", () => {
  beforeEach(() => {
    mockExecute.mockReset();
  });

  it("returns 200 when db is up and schema is ready", async () => {
    // First call: checkDatabase (select 1) — success
    // Second call: checkSchema — ledger exists and every migration is recorded.
    // Third + fourth + fifth calls: checkRateLimitStorage (insert, count, delete).
    const appliedMigrationTimestamps = migrationJournal.entries.map((entry) => String(entry.when));
    mockExecute
      .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] })
      .mockResolvedValueOnce({
        rows: [
          {
            migration_table: "drizzle.__drizzle_migrations",
            applied_migration_timestamps: appliedMigrationTimestamps,
            required_schema_present: true,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ count: 1 }] })
      .mockResolvedValueOnce({ rows: [] });

    const { GET } = await import("@/app/api/health/ready/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.db).toBe("up");
    expect(body.schema).toBe("ready");
    expect(body.storage).toBe("up");
    expect(body.rateLimit).toBe("up");
    expect(body.version).toBe("a1b2c3d");
  });

  it("returns 200 for a baselined database with a complete recorded suffix", async () => {
    const appliedMigrationTimestamps = migrationJournal.entries
      .filter((entry) => Number(entry.tag.slice(0, 4)) >= 11)
      .map((entry) => String(entry.when));
    mockExecute
      .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] })
      .mockResolvedValueOnce({
        rows: [
          {
            migration_table: "drizzle.__drizzle_migrations",
            applied_migration_timestamps: appliedMigrationTimestamps,
            required_schema_present: true,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ count: 1 }] })
      .mockResolvedValueOnce({ rows: [] });

    const { GET } = await import("@/app/api/health/ready/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.schema).toBe("ready");
  });

  it("returns 503 when db is down", async () => {
    mockExecute.mockRejectedValueOnce(new Error("connection refused"));

    const { GET } = await import("@/app/api/health/ready/route");
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.db).toBe("down");
  });

  it("returns 503 when db is up but schema is not migrated", async () => {
    mockExecute
      .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] })
      .mockResolvedValueOnce({ rows: [{ migration_table: null }] });

    const { GET } = await import("@/app/api/health/ready/route");
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.db).toBe("up");
    expect(body.schema).toBe("missing");
  });

  it("returns 503 when the ledger exists but one migration was skipped", async () => {
    const appliedMigrationTimestamps = migrationJournal.entries
      .filter((entry) => entry.tag !== "0012_support_access_grants")
      .map((entry) => String(entry.when));
    mockExecute
      .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] })
      .mockResolvedValueOnce({
        rows: [
          {
            migration_table: "drizzle.__drizzle_migrations",
            applied_migration_timestamps: appliedMigrationTimestamps,
            required_schema_present: true,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ count: 1 }] })
      .mockResolvedValueOnce({ rows: [] });

    const { GET } = await import("@/app/api/health/ready/route");
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.db).toBe("up");
    expect(body.schema).toBe("missing");
  });

  it("returns 503 when a deployment-critical table is missing", async () => {
    const appliedMigrationTimestamps = migrationJournal.entries.map((entry) => String(entry.when));
    mockExecute
      .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] })
      .mockResolvedValueOnce({
        rows: [
          {
            migration_table: "drizzle.__drizzle_migrations",
            applied_migration_timestamps: appliedMigrationTimestamps,
            required_schema_present: false,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ count: 1 }] })
      .mockResolvedValueOnce({ rows: [] });

    const { GET } = await import("@/app/api/health/ready/route");
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.schema).toBe("missing");
  });

  it("returns 503 when rate-limit storage probe fails", async () => {
    // The probe row insert throws — db + schema are healthy, but
    // the rate-limit table is unreachable. The response should
    // surface the rate-limit status without masking the db/schema
    // results.
    const appliedMigrationTimestamps = migrationJournal.entries.map((entry) => String(entry.when));
    mockExecute
      .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] })
      .mockResolvedValueOnce({
        rows: [
          {
            migration_table: "drizzle.__drizzle_migrations",
            applied_migration_timestamps: appliedMigrationTimestamps,
            required_schema_present: true,
          },
        ],
      })
      .mockRejectedValueOnce(new Error("rate_limit_table_missing"));

    const { GET } = await import("@/app/api/health/ready/route");
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.db).toBe("up");
    expect(body.schema).toBe("ready");
    expect(body.rateLimit).toBe("down");
  });
});

describe("GET /api/health (backwards-compat alias)", () => {
  beforeEach(() => {
    mockExecute.mockReset();
  });

  it("re-exports the ready handler (returns 200 when both checks pass)", async () => {
    const appliedMigrationTimestamps = migrationJournal.entries.map((entry) => String(entry.when));
    mockExecute
      .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] })
      .mockResolvedValueOnce({
        rows: [
          {
            migration_table: "drizzle.__drizzle_migrations",
            applied_migration_timestamps: appliedMigrationTimestamps,
            required_schema_present: true,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ count: 1 }] })
      .mockResolvedValueOnce({ rows: [] });

    const { GET } = await import("@/app/api/health/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});
