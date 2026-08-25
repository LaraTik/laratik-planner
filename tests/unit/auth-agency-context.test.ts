import { describe, expect, it, vi, beforeEach } from "vitest";
import { createHmac } from "node:crypto";

/**
 * TEST-05 — direct unit coverage of `src/lib/auth/agency-context.ts`.
 *
 * The companion test `tests/unit/agency-context-cookie.test.ts` exercises
 * the helper end-to-end with the policy module loaded. This file is
 * the smaller, focused contract test for the §6.2 "wrong-agency
 * cookie" and "unknown agency id" branches that the per-axis audit
 * (`tmp/full-review/test-gaps.md`, finding TEST-05) explicitly calls
 * out as gaps in the existing suite.
 *
 * Pattern (per the brief): mirror the `signed-url.test.ts` style —
 *   - hoist the env + db mocks above the SUT import
 *   - one Drizzle chain mock that consumes the next queued row per
 *     `.limit()` call
 *   - assert on the roundtrip + tamper cases (not SQL shape)
 *
 * Cases:
 *   1. sign → verify happy path
 *   2. tampered signature → null
 *   3. expired cookie (forge a past expiry, recompute HMAC) → null
 *   4. missing cookie (decode("")) → null
 *   5. wrong-agency cookie (a signed cookie for agency A, used against
 *      agency B's lookup) → null
 *   6. unknown agency id (well-formed UUID, but the row does not exist
 *      in agency_membership) → null
 */

const TEST_SECRET = "b".repeat(64); // 64 bytes, above the 32-byte minimum

vi.mock("@/lib/validation/env", () => ({
  serverEnv: {
    NODE_ENV: "test",
    AGENCY_COOKIE_SECRET: TEST_SECRET,
  },
  clientEnv: { NEXT_PUBLIC_APP_URL: "http://localhost:3000" },
}));

// Minimal chain mock: every call to `db.select(...)` produces a fresh
// chain. Each `.limit(1)` call consumes the next entry from
// `limitResults` (the decode helper makes exactly one membership
// lookup per call).
type DrizzleState = {
  limitResults: Array<unknown[] | undefined>;
};

function makeDrizzleMock(state: DrizzleState) {
  const select = vi.fn(() => {
    const chain: Record<string, unknown> = {};
    chain.from = vi.fn(() => chain);
    chain.innerJoin = vi.fn(() => chain);
    chain.where = vi.fn(() => chain);
    chain.limit = vi.fn(() => {
      const next = state.limitResults.shift() ?? [];
      return Promise.resolve(next);
    });
    return chain;
  });
  return { select, state };
}

const dbMock = vi.hoisted(() => {
  const state: DrizzleState = { limitResults: [] };
  return makeDrizzleMock(state);
});

vi.mock("@/lib/db", () => ({ db: dbMock }));

// next/headers is only used by set/clear helpers, not by encode/decode.
// Provide a no-op mock so the import resolves.
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    set: vi.fn(),
    delete: vi.fn(),
  })),
}));

const agencyContext = await import("@/lib/auth/agency-context");

const ACTOR = { id: "user-a" };
const AGENCY_A = "11111111-1111-1111-1111-111111111111";
const AGENCY_B = "22222222-2222-2222-2222-222222222222";

beforeEach(() => {
  dbMock.state.limitResults = [];
  dbMock.select.mockClear();
});

describe("agency-context: sign + verify roundtrip", () => {
  it("1) sign/verify happy path — agencyId round-trips through encode + decode", async () => {
    dbMock.state.limitResults = [[{ x: 1 }]]; // active membership row
    const encoded = agencyContext.encodeAgencyContext({
      agencyId: AGENCY_A,
      userId: ACTOR.id,
      maxAgeSeconds: 60 * 60 * 8,
    });
    const decoded = await agencyContext.decodeAgencyContext(encoded, ACTOR);
    expect(decoded).toEqual({ agencyId: AGENCY_A });
  });

  it("2) tampered signature is rejected (returns null)", async () => {
    const encoded = agencyContext.encodeAgencyContext({
      agencyId: AGENCY_A,
      userId: ACTOR.id,
      maxAgeSeconds: 60 * 60 * 8,
    });
    const parts = encoded.split(".");
    // Flip the first character of the signature.
    const tamperedSig =
      parts[2]!.charAt(0) === "A" ? "B" + parts[2]!.slice(1) : "A" + parts[2]!.slice(1);
    const tampered = `${parts[0]}.${parts[1]}.${tamperedSig}`;
    const decoded = await agencyContext.decodeAgencyContext(tampered, ACTOR);
    expect(decoded).toBeNull();
    // The HMAC check fires BEFORE the membership lookup, so no DB hit.
    expect(dbMock.select).not.toHaveBeenCalled();
  });

  it("3) expired cookie (past expiry with valid HMAC) is rejected", async () => {
    // Forge a cookie whose expires_at is 60s in the past, but the
    // signature is correct for the (agencyId, expiry, userId) tuple.
    // The decoder should reject on the expiry check.
    const pastExpiry = Math.floor(Date.now() / 1000) - 60;
    const payload = `${AGENCY_A}.${pastExpiry}.${ACTOR.id}`;
    const signature = createHmac("sha256", TEST_SECRET).update(payload).digest("base64url");
    const expired = `${AGENCY_A}.${pastExpiry}.${signature}`;
    const decoded = await agencyContext.decodeAgencyContext(expired, ACTOR);
    expect(decoded).toBeNull();
  });

  it("4) missing cookie (empty string) returns null without touching the DB", async () => {
    const decoded = await agencyContext.decodeAgencyContext("", ACTOR);
    expect(decoded).toBeNull();
    expect(dbMock.select).not.toHaveBeenCalled();
  });
});

describe("agency-context: tenant-isolation branches", () => {
  it("5) wrong-agency cookie: a cookie signed for AGENCY_B returns null when AGENCY_B has no membership", async () => {
    // The cookie itself is well-formed and signed for AGENCY_B, but
    // the membership lookup returns no row (the user is not a member
    // of AGENCY_B). The decode helper must fail closed.
    const encoded = agencyContext.encodeAgencyContext({
      agencyId: AGENCY_B,
      userId: ACTOR.id,
      maxAgeSeconds: 60 * 60 * 8,
    });
    dbMock.state.limitResults = [[]]; // no active membership in AGENCY_B
    const decoded = await agencyContext.decodeAgencyContext(encoded, ACTOR);
    expect(decoded).toBeNull();
  });

  it("6) unknown agency id: a valid cookie for a UUID that has no agency row returns null", async () => {
    // The encode helper signs a UUID that doesn't exist in the
    // agencies table. The decode helper looks up the membership row;
    // a missing agency means the inner-join returns no row.
    const UNKNOWN_AGENCY = "99999999-9999-9999-9999-999999999999";
    const encoded = agencyContext.encodeAgencyContext({
      agencyId: UNKNOWN_AGENCY,
      userId: ACTOR.id,
      maxAgeSeconds: 60 * 60 * 8,
    });
    dbMock.state.limitResults = [[]]; // no membership row
    const decoded = await agencyContext.decodeAgencyContext(encoded, ACTOR);
    expect(decoded).toBeNull();
  });

  it("userId binding: a cookie signed for userA is rejected for userB", async () => {
    // The encode helper binds the userId into the HMAC payload, so
    // re-issuing the same cookie string against a different actor
    // fails the HMAC check (the signature won't match because the
    // expected payload is `<agency>.<expiry>.<otherUser.id>`).
    const userA = { id: "user-a" };
    const userB = { id: "user-b" };
    const encoded = agencyContext.encodeAgencyContext({
      agencyId: AGENCY_A,
      userId: userA.id,
      maxAgeSeconds: 60 * 60 * 8,
    });
    // No DB row needed — the HMAC check fires first.
    const decoded = await agencyContext.decodeAgencyContext(encoded, userB);
    expect(decoded).toBeNull();
  });
});
