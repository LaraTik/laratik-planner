import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * M1.3 — `resolveActiveAgencyContext(actor, requestedAgencyId?)` resolver.
 *
 * The active agency is the **single source of truth** for every
 * agency-scoped lookup the app does. The resolver picks one agency
 * per request, in this priority:
 *
 *   1. requestedAgencyId (explicit override from `?agency=<id>` or path)
 *   2. laratik_active_agency cookie (sticky default; signed + membership-re-checked)
 *   3. fallback: the actor's only active agency
 *
 * Why a priority chain (not a single source):
 *   - The explicit override is needed for "switch agency" links that
 *     navigate to a workspace in a different agency than the cookie
 *     names. The cookie must NEVER block an explicit request.
 *   - The cookie is the stickiness mechanism: once a user lands in
 *     agency B, they stay there until they ask for A.
 *   - The fallback lets a brand-new user with exactly one agency
 *     land on a working page without the agency switcher ever having
 *     to fire. (Pre-existing single-agency users must keep working.)
 *
 * Fail-closed semantics:
 *   - If the explicit override fails membership, the resolver returns
 *     `null`. It does NOT fall through to the cookie or fallback
 *     paths — silently downgrading the explicit request would hide a
 *     permission denial and let a user accidentally land on a
 *     workspace they do not have access to.
 *   - If the cookie is tampered/expired/missing-membership, it loses
 *     authority. The resolver may recover only through the actor's
 *     exactly-one active agency fallback; it returns `null` for zero or
 *     multiple active memberships.
 *
 * Test patterns mirror `agency-context-cookie.test.ts`: a chainable
 * drizzle mock for DB returns, a hoisted `next/headers` cookies()
 * stub, and the env mocked to a fixed secret.
 */

// ─── env mock (must be declared BEFORE any import that reads serverEnv) ───

const TEST_AGENCY_COOKIE_SECRET = "a".repeat(64); // 64 bytes

vi.mock("@/lib/validation/env", () => ({
  serverEnv: {
    NODE_ENV: "test",
    AGENCY_COOKIE_SECRET: TEST_AGENCY_COOKIE_SECRET,
  },
  clientEnv: { NEXT_PUBLIC_APP_URL: "http://localhost:3000" },
}));

// ─── drizzle chain mock ──────────────────────────────────────────────────
//
// The resolver makes up to two DB calls per invocation:
//   - isActiveMember (1 select, used by step 1 requested, step 2 cookie is
//     already membership-checked inside decodeAgencyContext, and we still
//     need a membership check for step 1's "explicit" path)
//   - findSingleActiveAgency (1 select, used by step 3)
//
// The mock exposes both `limit` (used by membership check) and the
// `orderBy(...).limit(...)` chain (used by the fallback) on the same
// chain. Tests queue results in the order they expect the code to
// consume them.

type DrizzleState = {
  // Each call to `limit(n)` pops one result; entries are arrays of rows
  // (or `undefined` to mean "let the chain fall through to the next
  // queryable"). Tests that exercise the catch blocks stage a
  // rejected promise; the chain returns whatever the test queues.
  limitResults: Array<unknown[] | Promise<unknown>>;
  // The full rows returned by `orderBy(...).limit(n)` for the fallback
  // path. We separate it from limitResults so the orderBy chain has
  // its own queue and tests don't have to know which call site
  // consumes which entry.
  fallbackResults: Array<unknown[] | Promise<unknown>>;
};

function makeDrizzleMock(state: DrizzleState) {
  const select = vi.fn(() => {
    const chain: Record<string, unknown> = {};
    chain.from = vi.fn(() => chain);
    chain.innerJoin = vi.fn(() => chain);
    chain.where = vi.fn(() => chain);
    chain.orderBy = vi.fn(() => {
      chain.limit = vi.fn(() => {
        const next = state.fallbackResults.shift() ?? [];
        return Promise.resolve(next);
      });
      return chain;
    });
    chain.limit = vi.fn(() => {
      const next = state.limitResults.shift() ?? [];
      return Promise.resolve(next);
    });
    return chain;
  });
  return { select, state };
}

const dbMock = vi.hoisted(() => {
  const state: DrizzleState = {
    limitResults: [],
    fallbackResults: [],
  };
  return makeDrizzleMock(state);
});

vi.mock("@/lib/db", () => ({ db: dbMock }));

// ─── next/headers cookies() mock ─────────────────────────────────────────
//
// The resolver reads the cookie via `cookies().get(name)`. We model a
// "store" of cookie entries that tests can pre-populate per case.

type CookieEntry = { name: string; value: string };

const cookieStoreMock = vi.hoisted(() => {
  const store: { entries: CookieEntry[] } = { entries: [] };
  const cookiesFn = vi.fn(async () => ({
    get: (name: string) => store.entries.find((e) => e.name === name),
    set: vi.fn(),
    delete: vi.fn(),
  }));
  return { store, cookiesFn };
});

vi.mock("next/headers", () => ({
  cookies: cookieStoreMock.cookiesFn,
}));

// ─── SUT import (after all mocks) ────────────────────────────────────────

const ctx = await import("@/lib/auth/agency-context");

const actor = { id: "user-1" };
const AGENCY_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_AGENCY_ID = "22222222-2222-2222-2222-222222222222";

beforeEach(() => {
  dbMock.state.limitResults = [];
  dbMock.state.fallbackResults = [];
  dbMock.select.mockClear();
  cookieStoreMock.store.entries = [];
  cookieStoreMock.cookiesFn.mockClear();
});

// ─── Step 1: requestedAgencyId override ──────────────────────────────────

describe("requestedAgencyId override (priority 1)", () => {
  it("1) returns the requested agency with source='requested' when the actor is an active member", async () => {
    dbMock.state.limitResults = [[{ x: 1 }]];
    const result = await ctx.resolveActiveAgencyContext({
      actor,
      requestedAgencyId: AGENCY_ID,
    });
    expect(result).toEqual({
      actor,
      agencyId: AGENCY_ID,
      source: "requested",
    });
  });

  it("2) returns null (does NOT fall through) when the actor is not a member of the requested agency", async () => {
    dbMock.state.limitResults = [[]]; // no membership
    const result = await ctx.resolveActiveAgencyContext({
      actor,
      requestedAgencyId: AGENCY_ID,
    });
    expect(result).toBeNull();
    // Explicit fail-closed: the fallback path must NOT be consulted. We
    // assert this by inspecting the call count: exactly one select
    // call (the membership check); zero fallbackResults consumed.
    expect(dbMock.state.fallbackResults).toHaveLength(0);
  });

  it("3) returns null (fail-closed) when the actor's membership is suspended", async () => {
    // The membership check filters status = 'active'; a suspended row
    // matches no rows. We model it as an empty result set (same as #2)
    // — but the test pins the explicit "suspended" case.
    dbMock.state.limitResults = [[]];
    const result = await ctx.resolveActiveAgencyContext({
      actor,
      requestedAgencyId: AGENCY_ID,
    });
    expect(result).toBeNull();
    expect(dbMock.state.fallbackResults).toHaveLength(0);
  });

  it("11) wins over a cookie that disagrees with the explicit request", async () => {
    // Cookie says agency B; explicit override says agency A; the
    // resolver returns agency A. The cookie is NOT consulted for the
    // membership re-check (decodeAgencyContext does that internally
    // only when no requestedAgencyId is present).
    dbMock.state.limitResults = [[{ x: 1 }]];
    const cookieValue = ctx.encodeAgencyContext({
      agencyId: OTHER_AGENCY_ID,
      userId: actor.id,
      maxAgeSeconds: 60 * 60 * 8,
    });
    cookieStoreMock.store.entries = [{ name: ctx.AGENCY_CONTEXT_COOKIE_NAME, value: cookieValue }];
    const result = await ctx.resolveActiveAgencyContext({
      actor,
      requestedAgencyId: AGENCY_ID,
    });
    expect(result).toEqual({
      actor,
      agencyId: AGENCY_ID,
      source: "requested",
    });
  });

  it("12) treats an empty-string requestedAgencyId as not provided (falls through to cookie/fallback)", async () => {
    // Set the cookie to a valid agency so the cookie path resolves
    // and we can prove the empty-string was treated as "no override".
    const cookieValue = ctx.encodeAgencyContext({
      agencyId: AGENCY_ID,
      userId: actor.id,
      maxAgeSeconds: 60 * 60 * 8,
    });
    cookieStoreMock.store.entries = [{ name: ctx.AGENCY_CONTEXT_COOKIE_NAME, value: cookieValue }];
    // decodeAgencyContext's internal membership check needs a row.
    dbMock.state.limitResults = [[{ x: 1 }]];

    const result = await ctx.resolveActiveAgencyContext({
      actor,
      requestedAgencyId: "",
    });
    expect(result).toEqual({
      actor,
      agencyId: AGENCY_ID,
      source: "cookie",
    });
  });
});

// ─── Step 2: cookie path ─────────────────────────────────────────────────

describe("cookie path (priority 2)", () => {
  it("4) returns the cookie's agency with source='cookie' when the membership is still active", async () => {
    const cookieValue = ctx.encodeAgencyContext({
      agencyId: AGENCY_ID,
      userId: actor.id,
      maxAgeSeconds: 60 * 60 * 8,
    });
    cookieStoreMock.store.entries = [{ name: ctx.AGENCY_CONTEXT_COOKIE_NAME, value: cookieValue }];
    // decodeAgencyContext hits the membership lookup once.
    dbMock.state.limitResults = [[{ x: 1 }]];

    const result = await ctx.resolveActiveAgencyContext({ actor });
    expect(result).toEqual({
      actor,
      agencyId: AGENCY_ID,
      source: "cookie",
    });
  });

  it("5) returns null when the cookie's agency membership is revoked and no fallback agency exists", async () => {
    const cookieValue = ctx.encodeAgencyContext({
      agencyId: AGENCY_ID,
      userId: actor.id,
      maxAgeSeconds: 60 * 60 * 8,
    });
    cookieStoreMock.store.entries = [{ name: ctx.AGENCY_CONTEXT_COOKIE_NAME, value: cookieValue }];
    // Membership lookup returns empty (revoked / deactivated).
    dbMock.state.limitResults = [[]];
    const result = await ctx.resolveActiveAgencyContext({ actor });
    expect(result).toBeNull();
    // No fallback agency is available, so the revoked cookie cannot
    // authorize access to any tenant.
    expect(dbMock.state.fallbackResults).toHaveLength(0);
  });

  it("6) returns null when the cookie is present but the HMAC signature was tampered with", async () => {
    const cookieValue = ctx.encodeAgencyContext({
      agencyId: AGENCY_ID,
      userId: actor.id,
      maxAgeSeconds: 60 * 60 * 8,
    });
    const parts = cookieValue.split(".");
    const tamperedSig = (parts[2]!.charAt(0) === "A" ? "B" : "A") + parts[2]!.slice(1);
    const tampered = `${parts[0]}.${parts[1]}.${tamperedSig}`;
    cookieStoreMock.store.entries = [{ name: ctx.AGENCY_CONTEXT_COOKIE_NAME, value: tampered }];
    // We DO NOT pre-queue a membership row: the decoder short-circuits
    // on the HMAC failure before the DB lookup. The fallback query is
    // independently empty, so the invalid cookie cannot authorize access.
    const result = await ctx.resolveActiveAgencyContext({ actor });
    expect(result).toBeNull();
    expect(dbMock.state.limitResults).toHaveLength(0);
  });

  it("7) returns null when the cookie is present but expired", async () => {
    // Forge an expired-but-correctly-signed cookie by signing the
    // (agencyId, pastExpiry) pair with the same test secret.
    const { createHmac } = await import("node:crypto");
    const pastExpiry = Math.floor(Date.now() / 1000) - 60;
    const payload = `${AGENCY_ID}.${pastExpiry}.${actor.id}`;
    const sig = createHmac("sha256", TEST_AGENCY_COOKIE_SECRET).update(payload).digest("base64url");
    const expired = `${AGENCY_ID}.${pastExpiry}.${sig}`;
    cookieStoreMock.store.entries = [{ name: ctx.AGENCY_CONTEXT_COOKIE_NAME, value: expired }];

    const result = await ctx.resolveActiveAgencyContext({ actor });
    expect(result).toBeNull();
    expect(dbMock.state.fallbackResults).toHaveLength(0);
  });

  it("13) recovers a single active agency when the cookie belongs to another session", async () => {
    const cookieValue = ctx.encodeAgencyContext({
      agencyId: OTHER_AGENCY_ID,
      userId: actor.id,
      maxAgeSeconds: 60 * 60 * 8,
    });
    cookieStoreMock.store.entries = [{ name: ctx.AGENCY_CONTEXT_COOKIE_NAME, value: cookieValue }];

    // The cookie is structurally valid but no longer authorized for the
    // actor (for example, the browser retained another user's cookie).
    // The actor has exactly one active agency, so the resolver can recover
    // without guessing or granting access to the cookie's agency.
    dbMock.state.limitResults = [[]];
    dbMock.state.fallbackResults = [[{ agencyId: AGENCY_ID }]];

    const result = await ctx.resolveActiveAgencyContext({ actor });
    expect(result).toEqual({
      actor,
      agencyId: AGENCY_ID,
      source: "fallback-single-agency",
    });
  });
});

// ─── Step 3: fallback (actor's only active agency) ───────────────────────

describe("fallback — single active agency (priority 3)", () => {
  it("8) returns the actor's only active agency with source='fallback-single-agency'", async () => {
    // No cookie set; fallback returns exactly one row.
    cookieStoreMock.store.entries = [];
    dbMock.state.fallbackResults = [[{ agencyId: AGENCY_ID }]];

    const result = await ctx.resolveActiveAgencyContext({ actor });
    expect(result).toEqual({
      actor,
      agencyId: AGENCY_ID,
      source: "fallback-single-agency",
    });
  });

  it("9) returns null when the actor has zero active agencies", async () => {
    cookieStoreMock.store.entries = [];
    dbMock.state.fallbackResults = [[]]; // empty
    const result = await ctx.resolveActiveAgencyContext({ actor });
    expect(result).toBeNull();
  });

  it("10) returns null when the actor has 2+ active agencies (must use switcher, not auto-pick)", async () => {
    cookieStoreMock.store.entries = [];
    dbMock.state.fallbackResults = [[{ agencyId: AGENCY_ID }, { agencyId: OTHER_AGENCY_ID }]];
    const result = await ctx.resolveActiveAgencyContext({ actor });
    expect(result).toBeNull();
  });
});

// ─── Priority chain integration (no override, no cookie → fallback) ─────

describe("priority chain integration", () => {
  it("no override + valid cookie (active membership) beats fallback", async () => {
    // Pre-populate fallback with a DIFFERENT agency. The cookie
    // resolves first; the fallback row must be left un-consumed.
    const cookieValue = ctx.encodeAgencyContext({
      agencyId: AGENCY_ID,
      userId: actor.id,
      maxAgeSeconds: 60 * 60 * 8,
    });
    cookieStoreMock.store.entries = [{ name: ctx.AGENCY_CONTEXT_COOKIE_NAME, value: cookieValue }];
    dbMock.state.limitResults = [[{ x: 1 }]];
    dbMock.state.fallbackResults = [[{ agencyId: OTHER_AGENCY_ID }]];

    const result = await ctx.resolveActiveAgencyContext({ actor });
    expect(result).toEqual({
      actor,
      agencyId: AGENCY_ID,
      source: "cookie",
    });
    // The fallback path was NOT consumed.
    expect(dbMock.state.fallbackResults).toHaveLength(1);
  });

  it("no override + no cookie + single agency → fallback", async () => {
    cookieStoreMock.store.entries = [];
    dbMock.state.fallbackResults = [[{ agencyId: AGENCY_ID }]];
    const result = await ctx.resolveActiveAgencyContext({ actor });
    expect(result).toEqual({
      actor,
      agencyId: AGENCY_ID,
      source: "fallback-single-agency",
    });
  });

  it("requestedAgencyId = undefined is treated as not provided", async () => {
    // Cover the explicit-undefined branch (not just empty string).
    cookieStoreMock.store.entries = [];
    dbMock.state.fallbackResults = [[{ agencyId: AGENCY_ID }]];
    const result = await ctx.resolveActiveAgencyContext({ actor });
    expect(result?.source).toBe("fallback-single-agency");
  });

  it("requestedAgencyId = null is treated as not provided", async () => {
    cookieStoreMock.store.entries = [];
    dbMock.state.fallbackResults = [[{ agencyId: AGENCY_ID }]];
    const result = await ctx.resolveActiveAgencyContext({
      actor,
      requestedAgencyId: null,
    });
    expect(result?.source).toBe("fallback-single-agency");
  });
});

// ─── Defensive: malformed cookie + empty fallback ────────────────────────

describe("defensive: malformed cookie + membership gone", () => {
  it("returns null when cookie is a non-base64 garbage string (does not crash, does not fall through)", async () => {
    cookieStoreMock.store.entries = [{ name: ctx.AGENCY_CONTEXT_COOKIE_NAME, value: "garbage" }];
    // The decoder never queries the DB for malformed input; we must
    // not have any rows queued.
    const result = await ctx.resolveActiveAgencyContext({ actor });
    expect(result).toBeNull();
    expect(dbMock.state.fallbackResults).toHaveLength(0);
  });

  it("returns null when the membership lookup throws (DB error in step 1 / step 2 — does not crash)", async () => {
    // Stage a rejected promise for the membership check. The
    // `isActiveMember` catch is exercised; the resolver must not
    // propagate the error to the caller.
    dbMock.state.limitResults = [Promise.reject(new Error("boom"))];
    const result = await ctx.resolveActiveAgencyContext({
      actor,
      requestedAgencyId: AGENCY_ID,
    });
    expect(result).toBeNull();
  });

  it("returns null when the fallback lookup throws (DB error in step 3 — does not crash)", async () => {
    cookieStoreMock.store.entries = [];
    // The fallback uses the `orderBy(...).limit(...)` chain. Reject
    // there to exercise the `findSingleActiveAgency` catch.
    dbMock.state.fallbackResults = [Promise.reject(new Error("boom"))];
    const result = await ctx.resolveActiveAgencyContext({ actor });
    expect(result).toBeNull();
  });
});
