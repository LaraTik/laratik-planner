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
    // Second call: checkSchema (to_regclass) — returns a row
    mockExecute
      .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] })
      .mockResolvedValueOnce({ rows: [{ migration_table: "drizzle.__drizzle_migrations" }] });

    const { GET } = await import("@/app/api/health/ready/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.db).toBe("up");
    expect(body.schema).toBe("ready");
    expect(body.version).toBe("a1b2c3d4e5f678901234567890abcdef12345678");
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
});

describe("GET /api/health (backwards-compat alias)", () => {
  beforeEach(() => {
    mockExecute.mockReset();
  });

  it("re-exports the ready handler (returns 200 when both checks pass)", async () => {
    mockExecute
      .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] })
      .mockResolvedValueOnce({ rows: [{ migration_table: "drizzle.__drizzle_migrations" }] });

    const { GET } = await import("@/app/api/health/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});
